import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function extractFileKey(input: string): string | null {
  try {
    const u = new URL(input.trim());
    const m = u.pathname.match(/\/(?:design|file|proto)\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function refreshIfNeeded(userId: string, conn: {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 30_000) return conn.access_token;
  const clientId = process.env.FIGMA_CLIENT_ID!;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET!;
  const r = await fetch("https://api.figma.com/v1/oauth/refresh", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
    }).toString(),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("figma refresh failed", r.status, t);
    throw new Error("refresh_failed");
  }
  const data = (await r.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabaseAdmin.from("figma_connections").update({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? conn.refresh_token,
    expires_at: expiresAt,
  }).eq("user_id", userId);
  return data.access_token;
}

export const Route = createFileRoute("/api/figma/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") || "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return json({ error: "Unauthorized" }, 401);

          const supaUrl = process.env.SUPABASE_URL!;
          const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supa = createClient(supaUrl, supaKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: u, error: uErr } = await supa.auth.getUser(token);
          if (uErr || !u.user) return json({ error: "Unauthorized" }, 401);

          const body = (await request.json()) as { url?: string };
          const fileKey = body.url ? extractFileKey(body.url) : null;
          if (!fileKey) return json({ error: "That doesn't look like a valid Figma file URL." }, 400);

          const { data: conn, error: cErr } = await supabaseAdmin
            .from("figma_connections")
            .select("access_token, refresh_token, expires_at")
            .eq("user_id", u.user.id)
            .maybeSingle();
          if (cErr) return json({ error: "Failed to load Figma connection." }, 500);
          if (!conn) return json({ error: "Connect Figma first." }, 400);

          let accessToken: string;
          try {
            accessToken = await refreshIfNeeded(u.user.id, conn);
          } catch {
            return json({ error: "Your Figma session expired. Please reconnect Figma." }, 401);
          }

          const fileRes = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (fileRes.status === 404) return json({ error: "Figma file not found." }, 404);
          if (fileRes.status === 403) return json({ error: "You don't have access to this Figma file." }, 403);
          if (fileRes.status === 401) return json({ error: "Your Figma session expired. Please reconnect Figma." }, 401);
          if (!fileRes.ok) {
            const t = await fileRes.text();
            console.error("figma files api", fileRes.status, t);
            return json({ error: "Couldn't reach Figma. Please try again." }, 502);
          }
          const file = (await fileRes.json()) as any;
          const pages = (file?.document?.children || []).map((p: any) => ({
            name: p.name,
            nodeId: p.id,
          }));
          return json({ fileKey, name: file?.name, pages });
        } catch (e: any) {
          console.error("figma import error", e);
          return json({ error: e?.message || "Server error" }, 500);
        }
      },
    },
  },
});
