import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getRedirectUri(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/auth/figma/callback`;
}

export const Route = createFileRoute("/auth/figma/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return new Response("Missing token", { status: 401 });

        const supaUrl = process.env.SUPABASE_URL!;
        const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supa = createClient(supaUrl, supaKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u, error } = await supa.auth.getUser(token);
        if (error || !u.user) return new Response("Unauthorized", { status: 401 });

        const clientId = process.env.FIGMA_CLIENT_ID;
        if (!clientId) return new Response("FIGMA_CLIENT_ID not configured", { status: 500 });

        const state = crypto.randomUUID() + "-" + crypto.randomUUID();
        const { error: stErr } = await supabaseAdmin
          .from("figma_oauth_states")
          .insert({ state, user_id: u.user.id });
        if (stErr) {
          console.error("figma state insert", stErr);
          return new Response("Failed to start OAuth", { status: 500 });
        }

        const redirectUri = getRedirectUri(request);
        const authUrl = new URL("https://www.figma.com/oauth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", "file_read");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("response_type", "code");

        return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
      },
    },
  },
});
