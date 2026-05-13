// Server-only helper: shared single-frame conversion used by single + batch endpoints.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { convertFrame, collectImageRefs, collectVectorNodeIds } from "@/lib/figma-convert";

// Phase-tagged error so callers know exactly which step blew up.
export class ConvertPhaseError extends Error {
  phase: string;
  constructor(phase: string, message: string, opts?: { cause?: unknown }) {
    super(`[${phase}] ${message}`);
    this.phase = phase;
    if (opts?.cause) (this as any).cause = opts.cause;
  }
}

// Bounded fetch — Cloudflare Workers do NOT honor the default fetch timeout
// reliably, so we attach an AbortController to every outbound call.
async function tfetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 20_000, ...rest } = init;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function sanitizeSvg(svg: string): string {
  let s = svg;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  s = s.replace(/\s(on[a-z]+)\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\s(on[a-z]+)\s*=\s*'[^']*'/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*"\s*javascript:[^"]*"/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*'\s*javascript:[^']*'/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*"https?:\/\/[^"]*"/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*'https?:\/\/[^']*'/gi, "");
  return s.trim();
}

async function downloadAndStore(url: string, path: string, contentType = "image/png"): Promise<string | null> {
  try {
    const r = await tfetch(url, { timeoutMs: 30_000 });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const { error } = await supabaseAdmin.storage.from("project-assets").upload(path, buf, { contentType, upsert: true });
    if (error) { console.error("storage upload error", path, error); return null; }
    const { data } = supabaseAdmin.storage.from("project-assets").getPublicUrl(path);
    return data.publicUrl;
  } catch (e) { console.error("download/store", url, e); return null; }
}

const CLAUDE_CLEANUP_PROMPT = `Here is auto-generated HTML and CSS from a Figma frame. Clean it up: (1) replace divs with semantic tags where appropriate (header, nav, main, section, footer, article), (2) consolidate redundant CSS rules, (3) add meaningful aria-labels and alt attributes, (4) simplify deeply nested wrappers if they have no semantic purpose. Preserve the visual output exactly — do not change layout, spacing, colors, or content. CRITICAL: When you encounter <span class="figma-vector"> elements containing inline SVG, do NOT modify the SVG markup in any way. You may rename the wrapping element to a more semantic tag (e.g. <i class="icon">) or change its class names, but the inner <svg>...</svg> markup must be preserved verbatim — every attribute, path, and child element. Return ONLY a JSON object of shape {"html":"...","css":"..."} with no markdown fences and no explanation.`;

async function claudeCleanup(html: string, css: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system: CLAUDE_CLEANUP_PROMPT,
      messages: [{ role: "user", content: `HTML:\n\n${html}\n\nCSS:\n\n${css}` }],
    }),
  });
  if (!r.ok) { console.error("claude cleanup failed", r.status, await r.text().catch(() => "")); return null; }
  const data = (await r.json()) as any;
  const text: string = data?.content?.[0]?.text || "";
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.html === "string" && typeof parsed.css === "string") {
      return { html: parsed.html, css: parsed.css, usage: data.usage as { input_tokens: number; output_tokens: number } | undefined };
    }
  } catch (e) { console.error("claude parse failed", e); }
  return null;
}

function calcCost(usage?: { input_tokens: number; output_tokens: number }) {
  if (!usage) return 0;
  return (usage.input_tokens / 1_000_000) * 3 + (usage.output_tokens / 1_000_000) * 15;
}

export async function refreshFigmaTokenIfNeeded(userId: string, conn: { access_token: string; refresh_token: string; expires_at: string }) {
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

export type ConvertedFrame = {
  html: string;
  css: string;
  designReference: string | null;
  frameName: string;
  width: number;
  height: number;
  usedClaude: boolean;
  cost: number;
  usage?: { input_tokens: number; output_tokens: number };
};

export async function convertFigmaFrame(opts: {
  accessToken: string;
  fileKey: string;
  nodeId: string;
  userId: string;
  projectId?: string | null;
}): Promise<ConvertedFrame> {
  const { accessToken, fileKey, nodeId, userId, projectId = null } = opts;

  const nodeRes = await fetch(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&geometry=paths`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!nodeRes.ok) throw new Error("Couldn't load frame from Figma.");
  const nodeData = (await nodeRes.json()) as any;
  const frameNode = nodeData?.nodes?.[nodeId]?.document;
  if (!frameNode) throw new Error("Frame not found in Figma file.");

  // Images
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
      await Promise.all(imageRefs.map(async (ref) => {
        const url = meta[ref];
        if (!url) return;
        const stored = await downloadAndStore(url, `figma/${userId}/${fileKey}/${slug}/${ref}.png`);
        if (stored) imageMap[ref] = stored;
      }));
    }
  }

  // Reference screenshot
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

  // Vectors
  const vectorIds = collectVectorNodeIds(frameNode);
  const vectorSvgMap: Record<string, string> = {};
  if (vectorIds.length > 0) {
    const vecPath = (id: string) => `figma/${userId}/${fileKey}/vectors/${id.replace(/[^a-zA-Z0-9]/g, "_")}.svg`;
    const missing: string[] = [];
    await Promise.all(vectorIds.map(async (id) => {
      try {
        const { data } = await supabaseAdmin.storage.from("project-assets").download(vecPath(id));
        if (data) vectorSvgMap[id] = await data.text();
        else missing.push(id);
      } catch { missing.push(id); }
    }));
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      const r = await fetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(chunk.join(","))}&format=svg&svg_simplify_stroke=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!r.ok) { console.error("figma svg fetch", r.status); continue; }
      const d = (await r.json()) as any;
      const urls: Record<string, string | null> = d.images || {};
      await Promise.all(chunk.map(async (id) => {
        const u = urls[id]; if (!u) return;
        try {
          const sr = await fetch(u); if (!sr.ok) return;
          const cleaned = sanitizeSvg(await sr.text()); if (!cleaned) return;
          vectorSvgMap[id] = cleaned;
          await supabaseAdmin.storage.from("project-assets").upload(
            vecPath(id), new TextEncoder().encode(cleaned),
            { contentType: "image/svg+xml", upsert: true },
          );
        } catch (e) { console.error("svg dl/store", id, e); }
      }));
    }
  }

  let { html, css } = convertFrame(frameNode, imageMap, vectorSvgMap);
  let usedClaude = false;
  let cost = 0;
  let usage: { input_tokens: number; output_tokens: number } | undefined;

  if (html.length >= 2000) {
    const cleaned = await claudeCleanup(html, css);
    if (cleaned) {
      html = cleaned.html;
      css = cleaned.css;
      usedClaude = true;
      usage = cleaned.usage;
      cost = calcCost(cleaned.usage);
      await supabaseAdmin.from("ai_usage_log").insert({
        user_id: userId,
        project_id: projectId,
        operation: "figma_convert_cleanup",
        model: "claude-sonnet-4-5",
        input_tokens: cleaned.usage?.input_tokens ?? null,
        output_tokens: cleaned.usage?.output_tokens ?? null,
        cost_usd: cost,
        metadata: { fileKey, nodeId, frameName: frameNode.name },
      });
    }
  }

  return {
    html,
    css,
    designReference,
    frameName: frameNode.name,
    width: Math.round(frameNode.absoluteBoundingBox?.width || 0),
    height: Math.round(frameNode.absoluteBoundingBox?.height || 0),
    usedClaude,
    cost,
    usage,
  };
}

export function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";
}
