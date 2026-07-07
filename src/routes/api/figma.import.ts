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
  const r = await fetch("https://api.figma.com/v1/oauth/refresh", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.FIGMA_CLIENT_ID!,
      client_secret: process.env.FIGMA_CLIENT_SECRET!,
      refresh_token: conn.refresh_token,
    }).toString(),
  });
  if (!r.ok) throw new Error("refresh_failed");
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

          const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: u, error: uErr } = await supa.auth.getUser(token);
          if (uErr || !u.user) return json({ error: "Unauthorized" }, 401);

          const body = (await request.json()) as { url?: string };
          const fileKey = body.url ? extractFileKey(body.url) : null;
          if (!fileKey) return json({ error: "That doesn't look like a valid Figma file URL." }, 400);

          const { data: conn } = await supabaseAdmin
            .from("figma_connections")
            .select("access_token, refresh_token, expires_at")
            .eq("user_id", u.user.id)
            .maybeSingle();
          if (!conn) return json({ error: "Connect Figma first." }, 400);

          let accessToken: string;
          try {
            accessToken = await refreshIfNeeded(u.user.id, conn);
          } catch {
            return json({ error: "Your Figma session expired. Please reconnect Figma." }, 401);
          }

          // depth=2 to get pages + their immediate frame children
          let fileRes: Response;
          try {
            const ac = new AbortController();
            const to = setTimeout(() => ac.abort(), 25_000);
            try {
              fileRes = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=2`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: ac.signal,
              });
            } finally {
              clearTimeout(to);
            }
          } catch (netErr: any) {
            console.error("figma files fetch network error", fileKey, netErr?.message || netErr);
            return json({ error: `Couldn't reach Figma: ${netErr?.message || "network error"}` }, 502);
          }
          if (fileRes.status === 404) return json({ error: "Figma file not found (404). Check the URL." }, 404);
          if (fileRes.status === 403) {
            const body = await fileRes.text().catch(() => "");
            console.error("figma 403", fileKey, body.slice(0, 500));
            return json({ error: `Figma denied access to this file (403). Your Figma OAuth app may be missing the "files:read" scope — reconnect Figma to re-authorize. Body: ${body.slice(0, 160)}` }, 403);
          }
          if (fileRes.status === 401) return json({ error: "Your Figma session expired (401). Please reconnect Figma." }, 401);
          if (fileRes.status === 429) return json({ error: "Figma rate limit hit (429). Wait a minute and try again." }, 429);
          if (!fileRes.ok) {
            const body = await fileRes.text().catch(() => "");
            console.error("figma files fetch non-ok", fileKey, fileRes.status, body.slice(0, 500));
            return json({ error: `Figma returned ${fileRes.status}. ${body.slice(0, 200) || "Try again in a moment."}` }, 502);
          }

          const file = (await fileRes.json()) as any;
          const pages = (file?.document?.children || []).map((p: any) => {
            const frames = (p.children || [])
              .filter((c: any) => c.type === "FRAME")
              .map((f: any) => ({
                name: f.name,
                nodeId: f.id,
                width: Math.round(f.absoluteBoundingBox?.width || 0),
                height: Math.round(f.absoluteBoundingBox?.height || 0),
              }));
            return { name: p.name, nodeId: p.id, frames };
          });

          // Resolve thumbnails on a strict time budget. If we can't finish in
          // time, return null thumbnails so the client renders placeholders
          // instead of the whole import failing with a Worker timeout.
          const allFrameIds: string[] = pages.flatMap((p: any) => p.frames.map((f: any) => f.nodeId));
          const bucket = "project-thumbnails";
          const publicUrlFor = (nodeId: string) => {
            const path = `figma/${fileKey}/${nodeId.replace(/:/g, "_")}.png`;
            const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
            return { path, url: data.publicUrl };
          };

          const cached: Record<string, string> = {};
          const THUMB_BUDGET_MS = 12_000;
          const budget = new Promise<void>((r) => setTimeout(r, THUMB_BUDGET_MS));

          const resolveThumbs = async () => {
            if (allFrameIds.length === 0 || allFrameIds.length > 150) return;
            // Assume cached URLs exist (Storage is public + upsert). One shot
            // to Figma for any that need rendering; no per-file HEAD probes.
            let figmaUrls: Record<string, string | null> = {};
            try {
              const tRes = await fetch(
                `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(allFrameIds.join(","))}&format=png&scale=0.5`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (tRes.ok) {
                const td = (await tRes.json()) as any;
                figmaUrls = td.images || {};
              }
            } catch { /* ignore */ }

            await Promise.all(
              allFrameIds.map(async (id) => {
                const src = figmaUrls[id];
                const { path, url } = publicUrlFor(id);
                if (!src) { cached[id] = url; return; }
                try {
                  const imgRes = await fetch(src);
                  if (!imgRes.ok) { cached[id] = url; return; }
                  const buf = new Uint8Array(await imgRes.arrayBuffer());
                  await supabaseAdmin.storage
                    .from(bucket)
                    .upload(path, buf, { contentType: "image/png", upsert: true });
                  cached[id] = url;
                } catch {
                  cached[id] = url;
                }
              })
            );
          };

          await Promise.race([resolveThumbs(), budget]);

          for (const p of pages) {
            for (const f of p.frames) {
              f.thumbnail = cached[f.nodeId] || null;
            }
          }

          return json({ fileKey, name: file?.name, pages });
        } catch (e: any) {
          console.error("figma import error", e);
          return json({ error: "An internal error occurred. Please try again." }, 500);
        }
      },
    },
  },
});
