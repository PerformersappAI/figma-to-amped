import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/auth/figma/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const back = (msg: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: `/upload?figma=${encodeURIComponent(msg)}` },
          });

        if (error) return back(`error:${error}`);
        if (!code || !state) return back("error:missing_params");

        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("figma_oauth_states")
          .select("user_id, created_at")
          .eq("state", state)
          .maybeSingle();
        if (stateErr || !stateRow) return back("error:invalid_state");

        // Expire after 15 minutes
        const ageMs = Date.now() - new Date(stateRow.created_at).getTime();
        if (ageMs > 15 * 60 * 1000) {
          await supabaseAdmin.from("figma_oauth_states").delete().eq("state", state);
          return back("error:state_expired");
        }

        const clientId = process.env.FIGMA_CLIENT_ID!;
        const clientSecret = process.env.FIGMA_CLIENT_SECRET!;
        const redirectUri = `${url.origin}/auth/figma/callback`;

        const tokenRes = await fetch("https://api.figma.com/v1/oauth/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code,
            grant_type: "authorization_code",
          }).toString(),
        });

        if (!tokenRes.ok) {
          const body = await tokenRes.text();
          console.error("figma token exchange failed", {
            status: tokenRes.status,
            body,
            redirectUri,
            origin: url.origin,
          });
          let figmaCode = `http_${tokenRes.status}`;
          try {
            const parsed = JSON.parse(body) as { error?: string };
            if (parsed?.error) figmaCode = parsed.error;
          } catch {
            /* not json */
          }
          return back(`error:token_exchange_failed:${figmaCode}`);
        }
        const tokenData = (await tokenRes.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
          user_id?: string;
        };

        // Fetch Figma profile
        let profile: { id?: string; handle?: string; email?: string; img_url?: string } = {};
        try {
          const meRes = await fetch("https://api.figma.com/v1/me", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          if (meRes.ok) profile = (await meRes.json()) as any;
        } catch (e) {
          console.warn("figma /me failed", e);
        }

        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

        const { error: upErr } = await supabaseAdmin
          .from("figma_connections")
          .upsert(
            {
              user_id: stateRow.user_id,
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expires_at: expiresAt,
              figma_user_id: profile.id ?? tokenData.user_id ?? null,
              figma_handle: profile.handle ?? null,
              figma_email: profile.email ?? null,
              figma_img_url: profile.img_url ?? null,
            },
            { onConflict: "user_id" }
          );
        if (upErr) {
          console.error("figma connection upsert", upErr);
          return back("error:save_failed");
        }

        await supabaseAdmin.from("figma_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `/upload?figma=connected` },
        });
      },
    },
  },
});
