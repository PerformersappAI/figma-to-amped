// AI-powered Figma -> Puck conversion. Builds a compact JSON summary of the
// Figma frame and asks Claude to output puck_data JSON. Falls back to the
// deterministic rule-based mapper if anything goes wrong.

import { figmaFrameToPuck, type PuckData } from "@/lib/figma-to-puck";

type ImageMap = Record<string, string>;

const DECORATIVE_TYPES = new Set([
  "RECTANGLE",
  "ELLIPSE",
  "POLYGON",
  "STAR",
  "VECTOR",
  "LINE",
  "BOOLEAN_OPERATION",
]);

const ALLOWED_TYPES = new Set([
  "Navbar",
  "Hero",
  "Section",
  "Heading",
  "Paragraph",
  "Image",
  "Button",
  "CardGrid",
  "Footer",
]);

type SimpleNode = {
  type: string;
  name?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fontSize?: number;
  image?: string;
  children?: SimpleNode[];
};

function nodeImageUrl(node: any, imageMap: ImageMap): string | null {
  for (const f of node?.fills || []) {
    if (f?.type === "IMAGE" && f.imageRef && imageMap[f.imageRef]) return imageMap[f.imageRef];
  }
  return null;
}

function simplify(node: any, imageMap: ImageMap, depth = 0): SimpleNode | null {
  if (!node || node.visible === false || node.isMask) return null;
  const b = node.absoluteBoundingBox;
  const image = nodeImageUrl(node, imageMap);

  // Skip pure decorative shapes without image fills or text descendants.
  if (DECORATIVE_TYPES.has(node.type) && !image) return null;

  const out: SimpleNode = { type: node.type };
  if (node.name && node.name.length < 60) out.name = node.name;
  if (b) {
    out.x = Math.round(b.x);
    out.y = Math.round(b.y);
    out.w = Math.round(b.width);
    out.h = Math.round(b.height);
  }
  if (node.type === "TEXT" && typeof node.characters === "string") {
    const t = node.characters.trim();
    if (!t) return null;
    out.text = t.slice(0, 300);
    if (node.style?.fontSize) out.fontSize = Math.round(node.style.fontSize);
  }
  if (image) out.image = image;

  if (depth < 6 && Array.isArray(node.children) && node.children.length) {
    const kids: SimpleNode[] = [];
    for (const c of node.children) {
      const s = simplify(c, imageMap, depth + 1);
      if (s) kids.push(s);
    }
    if (kids.length) out.children = kids;
  }

  // Prune empty non-text non-image leaves.
  if (!out.text && !out.image && !out.children && node.type !== "FRAME") return null;
  return out;
}

const SYSTEM_PROMPT = `You are converting a Figma design into Puck page data.

Return ONLY valid JSON of shape:
{"content":[ ...blocks ],"root":{"props":{}}}

Each block: {"type":"<ComponentName>","props":{ ...props }}.

Allowed component types and their EXACT prop schemas:

- Navbar: { logoUrl: string, logoText: string, links: [{label: string, href: string}] }
- Hero: { backgroundImage: string, title: string, subtitle: string, buttonLabel: string, buttonHref: string }
- Section: { background: string (hex), backgroundImage: string, paddingY: number, paddingX: number }
- Heading: { text: string, level: "h1"|"h2"|"h3", align: "left"|"center"|"right", color: string }
- Paragraph: { text: string, color: string, align: "left"|"center"|"right" }
- Image: { src: string, alt: string, maxWidth: number }
- Button: { label: string, href: string, variant: "primary"|"ghost" }
- CardGrid: { columns: 2|3|4|5|6, cards: [{image: string, title: string, buttonLabel: string, buttonHref: string}] }
- Footer: { text: string, links: [{label: string, href: string}] }

Rules:
- Preserve top-to-bottom section order by Y position.
- Group side-by-side items (similar Y) into a single CardGrid or Navbar — never stack them as separate blocks.
- If a large frame has a background image with big text over it, emit ONE Hero.
- Use ACTUAL text characters from TEXT nodes only — NEVER use a layer name as visible text.
- Ignore decorative shapes (RECTANGLE, ELLIPSE, POLYGON, VECTOR, LINE) unless they carry an image fill.
- Short labels (<=4 words) inside styled shapes become Button.
- Never invent content that isn't in the input.
- Every href defaults to "#" if unknown.
- Output ONLY the JSON object, no markdown fences, no commentary.`;

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function extractJson(text: string): any | null {
  const s = stripFences(text);
  try { return JSON.parse(s); } catch { /* try substring */ }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

function validatePuck(data: any): data is PuckData {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.content)) return false;
  for (const b of data.content) {
    if (!b || typeof b !== "object") return false;
    if (typeof b.type !== "string" || !ALLOWED_TYPES.has(b.type)) return false;
    if (!b.props || typeof b.props !== "object") return false;
  }
  if (!data.root || typeof data.root !== "object") data.root = { props: {} };
  if (!data.root.props) data.root.props = {};
  return true;
}

function ensureIds(data: PuckData): PuckData {
  let i = 0;
  const stamp = Date.now().toString(36);
  for (const b of data.content) {
    if (!b.props.id) b.props.id = `${b.type}-${stamp}-${(i++).toString(36)}`;
  }
  return data;
}

async function callClaude(payload: unknown): Promise<PuckData | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const body = JSON.stringify({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Figma frame JSON:\n\n${JSON.stringify(payload)}` }],
  });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60_000);
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body,
      signal: ac.signal,
    });
  } catch (e: any) {
    console.error("figma-to-puck-ai network error", e?.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
  if (!r.ok) {
    console.error("figma-to-puck-ai http", r.status);
    return null;
  }
  const data = (await r.json().catch(() => null)) as any;
  const text: string = data?.content?.[0]?.text || "";
  const parsed = extractJson(text);
  if (!validatePuck(parsed)) {
    console.error("figma-to-puck-ai invalid response shape");
    return null;
  }
  return ensureIds(parsed);
}

export async function figmaFrameToPuckAI(frameNode: any, imageMap: ImageMap): Promise<PuckData> {
  try {
    const simplified = simplify(frameNode, imageMap);
    if (simplified) {
      const ai = await callClaude(simplified);
      if (ai && ai.content.length > 0) return ai;
    }
  } catch (e: any) {
    console.error("figma-to-puck-ai failed, falling back", e?.message || e);
  }
  return figmaFrameToPuck(frameNode, imageMap);
}
