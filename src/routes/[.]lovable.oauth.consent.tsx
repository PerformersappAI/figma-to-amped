import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type OAuthApi = {
  getAuthorizationDetails: (authorizationId: string) => Promise<{ data: any; error: { message?: string } | null }>;
  approveAuthorization: (authorizationId: string) => Promise<{ data: any; error: { message?: string } | null }>;
  denyAuthorization: (authorizationId: string) => Promise<{ data: any; error: { message?: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as typeof supabase.auth & { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search.authorization_id === "string" ? search.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = `${location.pathname}${location.searchStr}`;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Missing authorization_id");

    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message ?? "Could not load authorization request.");

    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });

    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <section className="panel w-full max-w-lg p-8">
        <h1 className="text-2xl text-foreground">Connection unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </section>
    </main>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client_name ?? "an app";
  const redirectUri = details?.redirect_uri ?? details?.client?.redirect_uri ?? details?.client?.redirect_uris?.[0];
  const rawScope = String(details?.scope ?? details?.scopes ?? "openid email profile");
  const scopes = rawScope.split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);

    const { data, error } = approve
      ? await oauthApi().approveAuthorization(authorization_id)
      : await oauthApi().denyAuthorization(authorization_id);

    if (error) {
      setBusy(null);
      setError(error.message ?? "Could not complete this authorization request.");
      return;
    }

    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("No redirect was returned by the authorization server.");
      return;
    }

    window.location.href = target;
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <section className="panel w-full max-w-xl p-8">
        <div className="mb-6">
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">Agent integration</p>
          <h1 className="mt-2 text-3xl text-foreground">Connect {clientName} to FigmaShip</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {clientName} will be able to call this app's enabled tools while you are signed in.
          </p>
        </div>

        <div className="space-y-4 border-y border-border py-5 text-sm">
          <div>
            <div className="font-display text-xs uppercase tracking-widest text-muted-foreground">Signed in as</div>
            <div className="mt-1 text-foreground">{user?.email ?? "Current user"}</div>
          </div>
          {redirectUri ? (
            <div>
              <div className="font-display text-xs uppercase tracking-widest text-muted-foreground">Client callback</div>
              <div className="mt-1 break-all text-foreground">{redirectUri}</div>
            </div>
          ) : null}
          <div>
            <div className="font-display text-xs uppercase tracking-widest text-muted-foreground">Access</div>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>Use FigmaShip as you</li>
              {scopes.includes("profile") ? <li>Share your basic profile</li> : null}
              {scopes.includes("email") ? <li>Share your email address</li> : null}
              <li>This does not bypass this app's permissions or backend policies.</li>
            </ul>
          </div>
        </div>

        {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => signOut()}>
            Switch account
          </button>
          <div className="flex gap-3">
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => decide(false)}>
              {busy === "deny" ? "Cancelling…" : "Cancel connection"}
            </button>
            <button type="button" className="btn-primary" disabled={!!busy} onClick={() => decide(true)}>
              {busy === "approve" ? "Connecting…" : "Approve"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
