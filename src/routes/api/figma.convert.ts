import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { convertFrame, collectImageRefs } from "@/lib/figma-convert";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

async function downloadAndStore(url: string, path: string, contentType = "image/png"): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const { error } = await supabaseAdmin.storage.from("project-assets").upload(path, buf, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.error("storage upload error", path, error);
      return null;
    }
    const { data } = supabaseAdmin.storage.from("project-assets").getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error("download/store error", url, e);
    return null;
  }
}

const CLAUDE_CLEANUP_PROMPT = `Here is auto-generated HTML and CSS from a Figma frame. Clean it up: (1) replace divs with semantic tags where appropriate (header, nav, main, section, footer, article), (2) consolidate redundant CSS rules, (3) add meaningful aria-labels and alt attributes, (4) simplify deeply nested wrappers if they have no semantic purpose. Preserve the visual output exactly — do not change layout, spacing, colors, or content. Return ONLY a JSON object of shape {"html":"...","css":"..."} with no markdown fences and no explanation.`;

async function claudeCleanup(html: string, css: string): Promise<{ html: string; css: string; usage?: { input_tokens: number; output_tokens: number } } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system: CLAUDE_CLEANUP_PROMPT,
      messages: [
        { role: "user", content: `HTML:\n\n${html}\n\nCSS:\n\n${css}` },
      ],
    }),
  });
  if (!r.ok) {
    console.error("claude cleanup failed", r.status, await r.text());
    return null;
  }
  const data = (await r.json()) as any;
  const text: string = data?.content?.[0]?.text || "";
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.html === "string" && typeof parsed.css === "string") {
      return { html: parsed.html, css: parsed.css, usage: data.usage };
    }
  } catch (e) {
    console.error("claude parse failed", e);
  }
  return null;
}

// Sonnet 4.5 pricing: $3/M input, $15/M output
function calcCost(usage?: { input_tokens: number; output_tokens: number }) {
  if (!usage) return 0;
  return (usage.input_tokens / 1_000_000) * 3 + (usage.output_tokens / 1_000_000) * 15;
}

export const Route = createFileRoute("/api/figma/convert")({
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
          const userId = u.user.id;

          const body = (await request.json()) as { fileKey?: string; nodeId?: string };
          if (!body.fileKey || !body.nodeId) return json({ error: "Missing fileKey or nodeId" }, 400);
          const { fileKey, nodeId } = body;

          const { data: conn } = await supabaseAdmin
            .from("figma_connections")
            .select("access_token, refresh_token, expires_at")
            .eq("user_id", userId)
            .maybeSingle();
          if (!conn) return json({ error: "Connect Figma first." }, 400);

          let accessToken: string;
          try {
            accessToken = await refreshIfNeeded(userId, conn);
          } catch {
            return json({ error: "Your Figma session expired. Please reconnect Figma." }, 401);
          }

          // 3a — fetch frame node tree
          const nodeRes = await fetch(
            `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&geometry=paths`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!nodeRes.ok) {
            const t = await nodeRes.text();
            console.error("figma node fetch", nodeRes.status, t);
            return json({ error: "Couldn't load frame from Figma." }, 502);
          }
          const nodeData = (await nodeRes.json()) as any;
          const frameNode = nodeData?.nodes?.[nodeId]?.document;
          if (!frameNode) return json({ error: "Frame not found in Figma file." }, 404);

          // 3b — fetch images
          const imageRefs = Array.from(collectImageRefs(frameNode));
          const imageMap: Record<string, string> = {};
          if (imageRefs.length > 0) {
            const imgsRes = await fetch(`https://api.figma.com/v1/files/${fileKey}/images`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (imgsRes.ok) {
              const imgData = (await imgsRes.json()) as any;
              const meta: Record<string, string> = imgData?.meta?.images || {};
              const slug = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
              await Promise.all(
                imageRefs.map(async (ref) => {
                  const url = meta[ref];
                  if (!url) return;
                  const stored = await downloadAndStore(url, `figma/${userId}/${fileKey}/${slug}/${ref}.png`);
                  if (stored) imageMap[ref] = stored;
                })
              );
            }
          }

          // 3c — fetch screenshot reference
          let designReference: string | null = null;
          const refRes = await fetch(
            `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (refRes.ok) {
            const refData = (await refRes.json()) as any;
            const refUrl = refData?.images?.[nodeId];
            if (refUrl) {
              const slug = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
              designReference = await downloadAndStore(refUrl, `figma/${userId}/${fileKey}/${slug}/_reference.png`);
            }
          }

          // 3d — deterministic conversion
          let { html, css } = convertFrame(frameNode, imageMap);

          // 3e — Claude cleanup (only if substantial)
          let usedClaude = false;
          let cost = 0;
          if (html.length >= 2000) {
            const cleaned = await claudeCleanup(html, css);
            if (cleaned) {
              html = cleaned.html;
              css = cleaned.css;
              usedClaude = true;
              cost = calcCost(cleaned.usage);
              await supabaseAdmin.from("ai_usage_log").insert({
                user_id: userId,
                project_id: null,
                operation: "figma_convert_cleanup",
                model: "claude-sonnet-4-5",
                input_tokens: cleaned.usage?.input_tokens ?? null,
                output_tokens: cleaned.usage?.output_tokens ?? null,
                cost_usd: cost,
                metadata: { fileKey, nodeId, frameName: frameNode.name },
              });
            }
          }

          return json({
            html,
            css,
            assets: Object.entries(imageMap).map(([imageRef, url]) => ({ imageRef, url })),
            designReference,
            metadata: {
              frameName: frameNode.name,
              originalDimensions: {
                width: Math.round(frameNode.absoluteBoundingBox?.width || 0),
                height: Math.round(frameNode.absoluteBoundingBox?.height || 0),
              },
              usedClaude,
              cost,
            },
          });
        } catch (e: any) {
          console.error("figma convert error", e);
          return json({ error: e?.message || "Server error" }, 500);
        }
      },
    },
  },
});
