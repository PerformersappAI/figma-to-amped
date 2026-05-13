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
          const fileRes = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=2`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (fileRes.status === 404) return json({ error: "Figma file not found." }, 404);
          if (fileRes.status === 403) return json({ error: "You don't have access to this Figma file." }, 403);
          if (fileRes.status === 401) return json({ error: "Your Figma session expired. Please reconnect Figma." }, 401);
          if (!fileRes.ok) return json({ error: "Couldn't reach Figma. Please try again." }, 502);

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

          // Resolve thumbnails: check cache in Storage first, then fetch from Figma + cache
          const allFrameIds: string[] = pages.flatMap((p: any) => p.frames.map((f: any) => f.nodeId));
          const bucket = "project-thumbnails";
          const publicUrlFor = (nodeId: string) => {
            const path = `figma/${fileKey}/${nodeId.replace(/:/g, "_")}.png`;
            const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
            return { path, url: data.publicUrl };
          };

          const cached: Record<string, string> = {};
          const missing: string[] = [];
          await Promise.all(
            allFrameIds.map(async (id) => {
              const { path, url } = publicUrlFor(id);
              const head = await fetch(url, { method: "HEAD" });
              if (head.ok) cached[id] = url;
              else missing.push(id);
            })
          );

          if (missing.length > 0 && missing.length <= 100) {
            // Poll Figma /v1/images until renders complete (Figma can return null while pending)
            let figmaUrls: Record<string, string | null> = {};
            const deadline = Date.now() + 30_000;
            while (Date.now() < deadline) {
              const tRes = await fetch(
                `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(missing.join(","))}&format=png&scale=0.5`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (!tRes.ok) break;
              const td = (await tRes.json()) as any;
              figmaUrls = td.images || {};
              const stillPending = missing.some((id) => figmaUrls[id] == null);
              if (!stillPending) break;
              await new Promise((r) => setTimeout(r, 1500));
            }

            // Download + upload to Storage; never expose Figma signed URLs to the browser
            await Promise.all(
              missing.map(async (id) => {
                const src = figmaUrls[id];
                if (!src) return;
                try {
                  const imgRes = await fetch(src);
                  if (!imgRes.ok) return;
                  const buf = new Uint8Array(await imgRes.arrayBuffer());
                  const { path, url } = publicUrlFor(id);
                  const { error: upErr } = await supabaseAdmin.storage
                    .from(bucket)
                    .upload(path, buf, { contentType: "image/png", upsert: true });
                  if (!upErr) cached[id] = url;
                } catch {
                  /* ignore single-thumb failures */
                }
              })
            );
          }

          for (const p of pages) {
            for (const f of p.frames) {
              f.thumbnail = cached[f.nodeId] || null;
            }
          }

          return json({ fileKey, name: file?.name, pages });
        } catch (e: any) {
          console.error("figma import error", e);
          return json({ error: e?.message || "Server error" }, 500);
        }
      },
    },
  },
});
