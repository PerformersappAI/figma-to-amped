import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/auth/figma/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

        const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u, error } = await supa.auth.getUser(token);
        if (error || !u.user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const clientId = process.env.FIGMA_CLIENT_ID;
        if (!clientId) {
          return new Response(JSON.stringify({ error: "FIGMA_CLIENT_ID not configured" }), { status: 500 });
        }

        const state = crypto.randomUUID() + "-" + crypto.randomUUID();
        const { error: stErr } = await supabaseAdmin
          .from("figma_oauth_states")
          .insert({ state, user_id: u.user.id });
        if (stErr) {
          console.error("figma state insert", stErr);
          return new Response(JSON.stringify({ error: "Failed to start OAuth" }), { status: 500 });
        }

        const url = new URL(request.url);
        const redirectUri = `${url.origin}/auth/figma/callback`;
        const authUrl = new URL("https://www.figma.com/oauth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("scope", "file_read");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("response_type", "code");

        return new Response(
          JSON.stringify({ authUrl: authUrl.toString(), redirectUri }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    },
  },
});
