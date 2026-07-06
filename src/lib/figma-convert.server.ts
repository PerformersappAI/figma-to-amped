import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { convertFrame, collectImageRefs, collectVectorNodeIds } from "@/lib/figma-convert";
import { figmaFrameToPuckAI } from "@/lib/figma-to-puck-ai";

export class ConvertPhaseError extends Error {
  phase: string;
  constructor(phase: string, message: string, opts?: { cause?: unknown }) {
    super(`[${phase}] ${message}`);
    this.phase = phase;
    if (opts?.cause) (this as any).cause = opts.cause;
  }
}

export type OwnedPage = {
  id: string;
  project_id: string;
  name: string;
  status: string;
  figma_node_id: string | null;
  figma_node_tree: any;
  figma_metadata: Record<string, any> | null;
  figma_design_reference_url: string | null;
  assets: Record<string, any> | null;
  vectors: Record<string, any> | null;
  html: string | null;
  css: string | null;
  error_message: string | null;
};

type StoredVectorMeta = { path: string; url: string };

type ProcessedAssets = {
  assets: Record<string, string>;
  vectors: Record<string, StoredVectorMeta>;
  designReference: string | null;
};

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
  s = s.replace(/(href|xlink:href)\s*=\s*"https?:\/\/[^\"]*"/gi, "");
  s = s.replace(/(href|xlink:href)\s*=\s*'https?:\/\/[^']*'/gi, "");
  return s.trim();
}

function assetPublicUrl(path: string) {
  const { data } = supabaseAdmin.storage.from("project-assets").getPublicUrl(path);
  return data.publicUrl;
}

async function getStoredPublicAsset(path: string): Promise<{ path: string; url: string } | null> {
  const url = assetPublicUrl(path);
  try {
    const res = await tfetch(url, { method: "HEAD", timeoutMs: 8_000 });
    if (res.ok) return { path, url };
  } catch {
    // ignore cache miss
  }
  return null;
}

async function downloadAndStore(url: string, path: string, contentType = "image/png"): Promise<string | null> {
  try {
    const r = await tfetch(url, { timeoutMs: 30_000 });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const { error } = await supabaseAdmin.storage.from("project-assets").upload(path, buf, { contentType, upsert: true });
    if (error) {
      console.error("storage upload error", path, error);
      return null;
    }
    return assetPublicUrl(path);
  } catch (e) {
    console.error("download/store", url, e);
    return null;
  }
}

async function storeTextAsset(text: string, path: string, contentType = "image/svg+xml"): Promise<string | null> {
  try {
    const { error } = await supabaseAdmin.storage
      .from("project-assets")
      .upload(path, new TextEncoder().encode(text), { contentType, upsert: true });
    if (error) {
      console.error("text asset upload error", path, error);
      return null;
    }
    return assetPublicUrl(path);
  } catch (e) {
    console.error("text asset store failed", path, e);
    return null;
  }
}

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  const queue = [...items];
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const currentIndex = index++;
      await worker(item, currentIndex);
    }
  });
  await Promise.all(runners);
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function normalizeAssetMap(raw: unknown): Record<string, string> {
  const input = asObject(raw);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") out[key] = value;
    else if (value && typeof value === "object" && typeof (value as any).url === "string") out[key] = (value as any).url;
  }
  return out;
}

function normalizeVectorMap(raw: unknown): Record<string, StoredVectorMeta> {
  const input = asObject(raw);
  const out: Record<string, StoredVectorMeta> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") out[key] = { path: "", url: value };
    else if (value && typeof value === "object") {
      const path = typeof (value as any).path === "string" ? (value as any).path : "";
      const url = typeof (value as any).url === "string" ? (value as any).url : path ? assetPublicUrl(path) : "";
      if (url) out[key] = { path, url };
    }
  }
  return out;
}

function mergeFigmaMetadata(existing: unknown, patch: Record<string, unknown>) {
  return {
    ...asObject(existing),
    ...patch,
  };
}

function nodeSlug(nodeId: string) {
  return nodeId.replace(/[^a-zA-Z0-9]/g, "_");
}

function imagePath(userId: string, fileKey: string, nodeId: string, ref: string) {
  return `figma/${userId}/${fileKey}/${nodeSlug(nodeId)}/images/${ref.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
}

function vectorPath(userId: string, fileKey: string, nodeId: string, vectorId: string) {
  return `figma/${userId}/${fileKey}/${nodeSlug(nodeId)}/vectors/${vectorId.replace(/[^a-zA-Z0-9]/g, "_")}.svg`;
}

function referencePath(userId: string, fileKey: string, nodeId: string) {
  return `figma/${userId}/${fileKey}/${nodeSlug(nodeId)}/_reference.png`;
}

function frameDimensions(frameNode: any) {
  return {
    frameName: frameNode?.name || "Untitled frame",
    width: Math.round(frameNode?.absoluteBoundingBox?.width || 0),
    height: Math.round(frameNode?.absoluteBoundingBox?.height || 0),
  };
}

const CLAUDE_CLEANUP_PROMPT = `Here is auto-generated HTML and CSS from a Figma frame. Clean it up: (1) replace divs with semantic tags where appropriate (header, nav, main, section, footer, article), (2) consolidate redundant CSS rules, (3) add meaningful aria-labels and alt attributes, (4) simplify deeply nested wrappers if they have no semantic purpose. Preserve the visual output exactly — do not change layout, spacing, colors, or content. CRITICAL: When you encounter <span class="figma-vector"> elements containing inline SVG, do NOT modify the SVG markup in any way. You may rename the wrapping element to a more semantic tag (e.g. <i class="icon">) or change its class names, but the inner <svg>...</svg> markup must be preserved verbatim — every attribute, path, and child element. Return ONLY a JSON object of shape {"html":"...","css":"..."} with no markdown fences and no explanation.`;

async function claudeCleanup(html: string, css: string): Promise<{ html: string; css: string; usage?: { input_tokens: number; output_tokens: number } } | { skipped: true; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { skipped: true, reason: "no_api_key" };
  let r: Response;
  try {
    r = await tfetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        system: CLAUDE_CLEANUP_PROMPT,
        messages: [{ role: "user", content: `HTML:\n\n${html}\n\nCSS:\n\n${css}` }],
      }),
      timeoutMs: 45_000,
    });
  } catch (e: any) {
    console.error("claude cleanup network error", e?.message || e);
    return { skipped: true, reason: `network: ${e?.message || "unknown"}` };
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error("claude cleanup http", r.status, body.slice(0, 500));
    return { skipped: true, reason: `http_${r.status}` };
  }
  const data = (await r.json().catch(() => null)) as any;
  const text: string = data?.content?.[0]?.text || "";
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { skipped: true, reason: "no_json_in_response" };
    const parsed = JSON.parse(m[0]);
    if (typeof parsed.html === "string" && typeof parsed.css === "string") {
      return { html: parsed.html, css: parsed.css, usage: data.usage };
    }
    return { skipped: true, reason: "missing_html_or_css" };
  } catch (e: any) {
    console.error("claude parse failed", e?.message || e);
    return { skipped: true, reason: "parse_error" };
  }
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

export async function requireFigmaAuth(request: Request): Promise<{ userId: string; accessToken: string }> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new ConvertPhaseError("auth", "Unauthorized");

  const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await supa.auth.getUser(token);
  if (uErr || !u.user) throw new ConvertPhaseError("auth", "Unauthorized");

  const { data: conn } = await supabaseAdmin
    .from("figma_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (!conn) throw new ConvertPhaseError("auth", "Connect Figma first.");

  try {
    const accessToken = await refreshFigmaTokenIfNeeded(u.user.id, conn);
    return { userId: u.user.id, accessToken };
  } catch {
    throw new ConvertPhaseError("auth", "Your Figma session expired. Please reconnect Figma.");
  }
}

export async function getOwnedPage(pageId: string, userId: string): Promise<OwnedPage> {
  const { data: page, error: pageErr } = await supabaseAdmin
    .from("pages")
    .select("id,project_id,name,status,figma_node_id,figma_node_tree,figma_metadata,figma_design_reference_url,assets,vectors,html,css,error_message")
    .eq("id", pageId)
    .single();
  if (pageErr || !page) throw new ConvertPhaseError("page_lookup", "Page not found");

  const { data: project, error: projErr } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", page.project_id)
    .eq("user_id", userId)
    .single();
  if (projErr || !project) throw new ConvertPhaseError("auth", "You don't have access to this page.");

  return page as OwnedPage;
}

export async function markPageFailed(pageId: string, message: string) {
  await supabaseAdmin.from("pages").update({ status: "failed", error_message: message }).eq("id", pageId);
}

async function fetchFigmaNodeTree(opts: { accessToken: string; fileKey: string; nodeId: string }) {
  const { accessToken, fileKey, nodeId } = opts;
  try {
    const nodeRes = await tfetch(
      `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&geometry=paths`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 25_000 },
    );
    if (!nodeRes.ok) {
      throw new ConvertPhaseError("fetch_node", `Figma returned ${nodeRes.status}`);
    }
    const nodeData = (await nodeRes.json()) as any;
    const frameNode = nodeData?.nodes?.[nodeId]?.document;
    if (!frameNode) throw new ConvertPhaseError("fetch_node", "Frame not found in file");
    return frameNode;
  } catch (e: any) {
    if (e instanceof ConvertPhaseError) throw e;
    throw new ConvertPhaseError("fetch_node", e?.message || "Unknown error", { cause: e });
  }
}

async function processFrameAssets(opts: {
  accessToken: string;
  fileKey: string;
  userId: string;
  nodeId: string;
  frameNode: any;
  existingAssets?: unknown;
  existingVectors?: unknown;
  designReference?: string | null;
}): Promise<ProcessedAssets> {
  const { accessToken, fileKey, userId, nodeId, frameNode } = opts;
  const assets = { ...normalizeAssetMap(opts.existingAssets) };
  const vectors = { ...normalizeVectorMap(opts.existingVectors) };
  let designReference = opts.designReference ?? null;

  const imageRefs = Array.from(collectImageRefs(frameNode));
  const imageRefsToFetch = imageRefs.filter((ref) => !assets[ref]);
  if (imageRefsToFetch.length > 0) {
    const imgsRes = await tfetch(`https://api.figma.com/v1/files/${fileKey}/images`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeoutMs: 20_000,
    });
    if (!imgsRes.ok) throw new ConvertPhaseError("process_assets", `Figma images returned ${imgsRes.status}`);
    const imgData = (await imgsRes.json()) as any;
    const meta: Record<string, string> = imgData?.meta?.images || {};
    await mapWithConcurrency(imageRefsToFetch, 8, async (ref) => {
      const path = imagePath(userId, fileKey, nodeId, ref);
      const cached = await getStoredPublicAsset(path);
      if (cached) {
        assets[ref] = cached.url;
        return;
      }
      const url = meta[ref];
      if (!url) return;
      const stored = await downloadAndStore(url, path);
      if (stored) assets[ref] = stored;
    });
  }

  const vectorIds = collectVectorNodeIds(frameNode);
  const unresolvedVectorIds: string[] = [];
  await mapWithConcurrency(vectorIds, 8, async (id) => {
    if (vectors[id]?.url) return;
    const path = vectorPath(userId, fileKey, nodeId, id);
    const cached = await getStoredPublicAsset(path);
    if (cached) {
      vectors[id] = cached;
      return;
    }
    unresolvedVectorIds.push(id);
  });

  for (let i = 0; i < unresolvedVectorIds.length; i += 100) {
    const chunk = unresolvedVectorIds.slice(i, i + 100);
    const r = await tfetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(chunk.join(","))}&format=svg&svg_simplify_stroke=true`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 25_000 },
    );
    if (!r.ok) throw new ConvertPhaseError("process_assets", `Figma SVG export returned ${r.status}`);
    const d = (await r.json()) as any;
    const urls: Record<string, string | null> = d.images || {};
    await mapWithConcurrency(chunk, 8, async (id) => {
      if (vectors[id]?.url) return;
      const u = urls[id];
      if (!u) return;
      try {
        const sr = await tfetch(u, { timeoutMs: 15_000 });
        if (!sr.ok) return;
        const cleaned = sanitizeSvg(await sr.text());
        if (!cleaned) return;
        const path = vectorPath(userId, fileKey, nodeId, id);
        const url = await storeTextAsset(cleaned, path);
        if (url) vectors[id] = { path, url };
      } catch (e: any) {
        console.error("svg dl/store", id, e?.message || e);
      }
    });
  }

  if (!designReference) {
    const cachedReference = await getStoredPublicAsset(referencePath(userId, fileKey, nodeId));
    if (cachedReference) {
      designReference = cachedReference.url;
    } else {
      const refRes = await tfetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 20_000 },
      );
      if (!refRes.ok) throw new ConvertPhaseError("process_assets", `Figma reference export returned ${refRes.status}`);
      const refData = (await refRes.json()) as any;
      const refUrl = refData?.images?.[nodeId];
      if (refUrl) {
        designReference = await downloadAndStore(refUrl, referencePath(userId, fileKey, nodeId));
      }
    }
  }

  return { assets, vectors, designReference };
}

export async function runFetchNodeStep(opts: {
  page: OwnedPage;
  accessToken: string;
  fileKey: string;
  nodeId: string;
}) {
  const frameNode = await fetchFigmaNodeTree({ accessToken: opts.accessToken, fileKey: opts.fileKey, nodeId: opts.nodeId });
  const dims = frameDimensions(frameNode);
  await supabaseAdmin.from("pages").update({
    figma_node_tree: frameNode,
    status: "fetched",
    error_message: null,
    figma_metadata: mergeFigmaMetadata(opts.page.figma_metadata, { ...dims, last_completed_step: "fetched" }),
  }).eq("id", opts.page.id);
  return { ...dims, status: "fetched" as const };
}

export async function runProcessAssetsStep(opts: {
  page: OwnedPage;
  accessToken: string;
  fileKey: string;
  userId: string;
  nodeId: string;
}) {
  if (!opts.page.figma_node_tree) throw new ConvertPhaseError("process_assets", "No stored node tree found. Run fetch-node first.");
  const processed = await processFrameAssets({
    accessToken: opts.accessToken,
    fileKey: opts.fileKey,
    userId: opts.userId,
    nodeId: opts.nodeId,
    frameNode: opts.page.figma_node_tree,
    existingAssets: opts.page.assets,
    existingVectors: opts.page.vectors,
    designReference: opts.page.figma_design_reference_url,
  });
  const dims = frameDimensions(opts.page.figma_node_tree);
  await supabaseAdmin.from("pages").update({
    assets: processed.assets,
    vectors: processed.vectors,
    figma_design_reference_url: processed.designReference,
    status: "assets-ready",
    error_message: null,
    figma_metadata: mergeFigmaMetadata(opts.page.figma_metadata, { ...dims, last_completed_step: "assets-ready" }),
  }).eq("id", opts.page.id);
  return {
    status: "assets-ready" as const,
    imageCount: Object.keys(processed.assets).length,
    vectorCount: Object.keys(processed.vectors).length,
    designReference: processed.designReference,
  };
}

export async function runRenderStep(opts: { page: OwnedPage }) {
  if (!opts.page.figma_node_tree) throw new ConvertPhaseError("render", "No stored node tree found. Run fetch-node first.");

  const imageMap = normalizeAssetMap(opts.page.assets);
  const vectorMeta = normalizeVectorMap(opts.page.vectors);
  const vectorSvgMap: Record<string, string> = {};
  await mapWithConcurrency(Object.entries(vectorMeta), 8, async ([id, meta]) => {
    if (!meta.path) return;
    try {
      const { data, error } = await supabaseAdmin.storage.from("project-assets").download(meta.path);
      if (!error && data) vectorSvgMap[id] = await data.text();
    } catch (e: any) {
      console.error("vector download failed", id, e?.message || e);
    }
  });

  let html: string;
  let css: string;
  try {
    const out = convertFrame(opts.page.figma_node_tree, imageMap, vectorSvgMap);
    html = out.html;
    css = out.css;
  } catch (e: any) {
    throw new ConvertPhaseError("render", e?.message || "convertFrame threw", { cause: e });
  }

  const dims = frameDimensions(opts.page.figma_node_tree);
  const puckData = figmaFrameToPuck(opts.page.figma_node_tree, imageMap);
  await supabaseAdmin.from("pages").update({
    html,
    css,
    puck_data: puckData as any,
    status: "rendered",
    error_message: null,
    figma_metadata: mergeFigmaMetadata(opts.page.figma_metadata, { ...dims, last_completed_step: "rendered" }),
  }).eq("id", opts.page.id);

  return { status: "rendered" as const, html, css, ...dims };
}

export async function runCleanupStep(opts: {
  page: OwnedPage;
  userId: string;
  fileKey?: string | null;
}) {
  if (!opts.page.html || opts.page.css == null) throw new ConvertPhaseError("cleanup", "No rendered HTML found. Run render first.");

  let html = opts.page.html;
  let css = opts.page.css || "";
  let usedClaude = false;
  let cost = 0;
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  let cleanupSkippedReason: string | null = null;

  if (html.length >= 2000) {
    const cleaned = await claudeCleanup(html, css);
    if ("skipped" in cleaned) {
      cleanupSkippedReason = cleaned.reason;
    } else {
      html = cleaned.html;
      css = cleaned.css;
      usedClaude = true;
      usage = cleaned.usage;
      cost = calcCost(cleaned.usage);
      try {
        await supabaseAdmin.from("ai_usage_log").insert({
          user_id: opts.userId,
          project_id: opts.page.project_id,
          operation: "figma_convert_cleanup",
          model: "claude-sonnet-4-5",
          input_tokens: cleaned.usage?.input_tokens ?? null,
          output_tokens: cleaned.usage?.output_tokens ?? null,
          cost_usd: cost,
          metadata: {
            fileKey: opts.fileKey ?? null,
            nodeId: opts.page.figma_node_id,
            frameName: opts.page.figma_node_tree?.name || opts.page.name,
          },
        });
      } catch (e: any) {
        console.error("ai_usage_log insert failed", e?.message || e);
      }
    }
  } else {
    cleanupSkippedReason = "short_html";
  }

  const dims = opts.page.figma_node_tree ? frameDimensions(opts.page.figma_node_tree) : {
    frameName: opts.page.name,
    width: 0,
    height: 0,
  };
  await supabaseAdmin.from("pages").update({
    html,
    css,
    status: "ready",
    error_message: null,
    figma_metadata: mergeFigmaMetadata(opts.page.figma_metadata, {
      ...dims,
      usedClaude,
      cost,
      cleanupSkippedReason,
      last_completed_step: "ready",
    }),
  }).eq("id", opts.page.id);

  return {
    status: "ready" as const,
    html,
    css,
    designReference: opts.page.figma_design_reference_url,
    ...dims,
    usedClaude,
    cost,
    usage,
    cleanupSkippedReason,
  };
}

export async function convertFigmaFrame(opts: {
  accessToken: string;
  fileKey: string;
  nodeId: string;
  userId: string;
  projectId?: string | null;
}): Promise<ConvertedFrame> {
  const frameNode = await fetchFigmaNodeTree({ accessToken: opts.accessToken, fileKey: opts.fileKey, nodeId: opts.nodeId });
  const processed = await processFrameAssets({
    accessToken: opts.accessToken,
    fileKey: opts.fileKey,
    userId: opts.userId,
    nodeId: opts.nodeId,
    frameNode,
  });

  let html: string;
  let css: string;
  try {
    const out = convertFrame(frameNode, processed.assets, Object.fromEntries(
      await Promise.all(
        Object.entries(processed.vectors).map(async ([id, meta]) => {
          if (!meta.path) return [id, ""] as const;
          try {
            const { data, error } = await supabaseAdmin.storage.from("project-assets").download(meta.path);
            if (error || !data) return [id, ""] as const;
            return [id, await data.text()] as const;
          } catch {
            return [id, ""] as const;
          }
        }),
      ),
    ));
    html = out.html;
    css = out.css;
  } catch (e: any) {
    throw new ConvertPhaseError("render", e?.message || "convertFrame threw", { cause: e });
  }

  let usedClaude = false;
  let cost = 0;
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  if (html.length >= 2000) {
    const cleaned = await claudeCleanup(html, css);
    if (!("skipped" in cleaned)) {
      html = cleaned.html;
      css = cleaned.css;
      usedClaude = true;
      usage = cleaned.usage;
      cost = calcCost(cleaned.usage);
      try {
        await supabaseAdmin.from("ai_usage_log").insert({
          user_id: opts.userId,
          project_id: opts.projectId ?? null,
          operation: "figma_convert_cleanup",
          model: "claude-sonnet-4-5",
          input_tokens: cleaned.usage?.input_tokens ?? null,
          output_tokens: cleaned.usage?.output_tokens ?? null,
          cost_usd: cost,
          metadata: { fileKey: opts.fileKey, nodeId: opts.nodeId, frameName: frameNode.name },
        });
      } catch (e: any) {
        console.error("ai_usage_log insert failed", e?.message || e);
      }
    }
  }

  const dims = frameDimensions(frameNode);
  return {
    html,
    css,
    designReference: processed.designReference,
    ...dims,
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
