// Deterministic Figma node tree → HTML/CSS converter.
// No AI here. Pure mapping.

type Style = Record<string, string | number>;

export type ConvertCtx = {
  imageMap: Record<string, string>; // imageRef -> stored URL
  cssRules: Map<string, Style>;     // className -> style
  classNames: Set<string>;
  vectorSvgMap: Record<string, string>; // nodeId -> sanitized SVG markup
};

const VECTOR_PRIM_TYPES = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "REGULAR_POLYGON",
]);

function isVectorOnlyGroup(node: any): boolean {
  if (!node || node.type !== "GROUP" || !node.children?.length) return false;
  return node.children.every(
    (c: any) => VECTOR_PRIM_TYPES.has(c.type) || isVectorOnlyGroup(c)
  );
}

function isVectorElement(node: any): boolean {
  return VECTOR_PRIM_TYPES.has(node?.type) || isVectorOnlyGroup(node);
}

/** Walk the tree and collect node IDs that should be exported as SVG. */
export function collectVectorNodeIds(node: any, out: string[] = []): string[] {
  if (!node || node.visible === false) return out;
  if (isVectorElement(node)) {
    out.push(node.id);
    return out; // do not recurse — emit one SVG per element/group
  }
  for (const c of node.children || []) collectVectorNodeIds(c, out);
  return out;
}

function kebab(name: string, fallback = "node"): string {
  const cleaned = (name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function uniqueClass(ctx: ConvertCtx, base: string): string {
  let c = base;
  let i = 2;
  while (ctx.classNames.has(c)) {
    c = `${base}-${i++}`;
  }
  ctx.classNames.add(c);
  return c;
}

function rgbaToCss(c: any): string {
  if (!c) return "transparent";
  const r = Math.round((c.r ?? 0) * 255);
  const g = Math.round((c.g ?? 0) * 255);
  const b = Math.round((c.b ?? 0) * 255);
  const a = c.a ?? 1;
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}

function fillToCss(fills: any[] | undefined, ctx: ConvertCtx): { kind: "color" | "image" | "none"; value: string; imageRef?: string } {
  if (!fills || fills.length === 0) return { kind: "none", value: "" };
  const f = fills.find((x: any) => x.visible !== false) || fills[0];
  if (!f || f.visible === false) return { kind: "none", value: "" };
  if (f.type === "SOLID") return { kind: "color", value: rgbaToCss({ ...f.color, a: f.opacity ?? f.color?.a ?? 1 }) };
  if (f.type === "IMAGE" && f.imageRef && ctx.imageMap[f.imageRef]) {
    return { kind: "image", value: ctx.imageMap[f.imageRef], imageRef: f.imageRef };
  }
  if (f.type?.startsWith("GRADIENT") && f.gradientStops?.length) {
    const stops = f.gradientStops.map((s: any) => `${rgbaToCss(s.color)} ${Math.round(s.position * 100)}%`).join(",");
    return { kind: "color", value: `linear-gradient(${stops})` };
  }
  return { kind: "none", value: "" };
}

function strokeToCss(node: any): string | null {
  const s = (node.strokes || []).find((x: any) => x.visible !== false);
  if (!s || s.type !== "SOLID") return null;
  const w = node.strokeWeight ?? 1;
  return `${w}px solid ${rgbaToCss({ ...s.color, a: s.opacity ?? s.color?.a ?? 1 })}`;
}

function effectsToBoxShadow(effects: any[] | undefined): string | null {
  if (!effects) return null;
  const shadows = effects
    .filter((e: any) => e.visible !== false && (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW"))
    .map((e: any) => {
      const inset = e.type === "INNER_SHADOW" ? "inset " : "";
      const o = e.offset || { x: 0, y: 0 };
      return `${inset}${o.x}px ${o.y}px ${e.radius || 0}px ${rgbaToCss(e.color)}`;
    });
  return shadows.length ? shadows.join(",") : null;
}

function styleToCssString(s: Style): string {
  return Object.entries(s)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
}

function pickTextTag(fontSize: number): "h1" | "h2" | "h3" | "p" {
  if (fontSize >= 32) return "h1";
  if (fontSize >= 24) return "h2";
  if (fontSize >= 18) return "h3";
  return "p";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nodeStyle(node: any, ctx: ConvertCtx, isRoot: boolean): { style: Style; bgImageRef?: string } {
  const style: Style = {};
  const bbox = node.absoluteBoundingBox;

  // Auto-layout
  if (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL") {
    style["display"] = "flex";
    style["flex-direction"] = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    if (node.itemSpacing) style["gap"] = `${node.itemSpacing}px`;
    if (node.paddingTop) style["padding-top"] = `${node.paddingTop}px`;
    if (node.paddingRight) style["padding-right"] = `${node.paddingRight}px`;
    if (node.paddingBottom) style["padding-bottom"] = `${node.paddingBottom}px`;
    if (node.paddingLeft) style["padding-left"] = `${node.paddingLeft}px`;
    const align: Record<string, string> = { MIN: "flex-start", CENTER: "center", MAX: "flex-end", SPACE_BETWEEN: "space-between" };
    if (node.primaryAxisAlignItems) style["justify-content"] = align[node.primaryAxisAlignItems] || "flex-start";
    if (node.counterAxisAlignItems) style["align-items"] = align[node.counterAxisAlignItems] || "flex-start";
  }

  if (bbox) {
    if (isRoot) {
      // Use the frame's true Figma width so absolutely-positioned children
      // line up with their original X/Y. The outer canvas/iframe scrolls.
      style["width"] = `${Math.round(bbox.width)}px`;
      style["height"] = `${Math.round(bbox.height)}px`;
      style["margin"] = "0 auto";
      style["position"] = "relative";
      if (!node.layoutMode) style["overflow"] = "hidden";
    } else {
      style["width"] = `${Math.round(bbox.width)}px`;
      style["height"] = `${Math.round(bbox.height)}px`;
    }
  }

  const fill = fillToCss(node.fills, ctx);
  let bgImageRef: string | undefined;
  if (fill.kind === "color") style["background"] = fill.value;
  else if (fill.kind === "image") {
    style["background-image"] = `url("${fill.value}")`;
    style["background-size"] = "cover";
    style["background-position"] = "center";
    bgImageRef = fill.imageRef;
  }

  const border = strokeToCss(node);
  if (border) style["border"] = border;

  if (node.cornerRadius) style["border-radius"] = `${node.cornerRadius}px`;
  else if (node.rectangleCornerRadii?.length === 4) {
    style["border-radius"] = node.rectangleCornerRadii.map((r: number) => `${r}px`).join(" ");
  }

  const shadow = effectsToBoxShadow(node.effects);
  if (shadow) style["box-shadow"] = shadow;

  if (node.opacity != null && node.opacity < 1) style["opacity"] = String(node.opacity);

  return { style, bgImageRef };
}

function textStyle(node: any): { tag: string; style: Style } {
  const s: Style = {};
  const ts = node.style || {};
  const fontSize = ts.fontSize || 16;
  s["font-size"] = `${fontSize}px`;
  if (ts.fontFamily) s["font-family"] = `"${ts.fontFamily}", sans-serif`;
  if (ts.fontWeight) s["font-weight"] = String(ts.fontWeight);
  if (ts.lineHeightPx) s["line-height"] = `${ts.lineHeightPx}px`;
  if (ts.letterSpacing) s["letter-spacing"] = `${ts.letterSpacing}px`;
  if (ts.textAlignHorizontal) s["text-align"] = String(ts.textAlignHorizontal).toLowerCase();
  const f = (node.fills || []).find((x: any) => x.type === "SOLID" && x.visible !== false);
  if (f) s["color"] = rgbaToCss({ ...f.color, a: f.opacity ?? f.color?.a ?? 1 });
  s["margin"] = "0";
  return { tag: pickTextTag(fontSize), style: s };
}

function convertNode(node: any, ctx: ConvertCtx, depth = 0, isRoot = false): string {
  if (!node || node.visible === false) return "";

  const cls = uniqueClass(ctx, kebab(node.name, node.type.toLowerCase()));

  if (node.type === "TEXT") {
    const { tag, style } = textStyle(node);
    ctx.cssRules.set(cls, style);
    const content = escapeHtml(node.characters || "");
    return `<${tag} class="${cls}">${content}</${tag}>`;
  }

  // Image rectangle
  if (node.type === "RECTANGLE") {
    const fill = fillToCss(node.fills, ctx);
    if (fill.kind === "image") {
      const { style } = nodeStyle(node, ctx, isRoot);
      // Use img tag instead of bg
      delete style["background-image"];
      delete style["background-size"];
      delete style["background-position"];
      style["display"] = "block";
      style["object-fit"] = "cover";
      ctx.cssRules.set(cls, style);
      const alt = escapeHtml(node.name || "");
      return `<img class="${cls}" src="${fill.value}" alt="${alt}" />`;
    }
  }

  if (node.type === "ELLIPSE") {
    const { style } = nodeStyle(node, ctx, isRoot);
    style["border-radius"] = "50%";
    ctx.cssRules.set(cls, style);
    return `<div class="${cls}"></div>`;
  }

  // Vector primitives + groups composed entirely of vectors → inline SVG
  if (isVectorElement(node)) {
    const bbox = node.absoluteBoundingBox;
    const w = Math.max(1, Math.round(bbox?.width || 24));
    const h = Math.max(1, Math.round(bbox?.height || 24));
    const svg = ctx.vectorSvgMap[node.id];
    ctx.cssRules.set(cls, {
      display: "inline-block",
      width: `${w}px`,
      height: `${h}px`,
      "vertical-align": "middle",
    });
    const inner = svg
      ? svg
      : `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="${w}" height="${h}" fill="rgba(255,255,255,0.05)"/></svg>`;
    return `<span class="figma-vector ${cls}" data-figma-vector="${node.type}" aria-hidden="true">${inner}</span>`;
  }

  // FRAME, GROUP, INSTANCE, COMPONENT, COMPONENT_SET → div container
  const { style } = nodeStyle(node, ctx, isRoot);
  // If no auto-layout, fallback to relative + absolute children
  if (!node.layoutMode && (node.children || []).length > 0) {
    style["position"] = "relative";
  }
  ctx.cssRules.set(cls, style);

  const children = (node.children || []).map((c: any) => {
    const html = convertNode(c, ctx, depth + 1, false);
    // Absolute positioning fallback
    if (!node.layoutMode && c.absoluteBoundingBox && node.absoluteBoundingBox && html) {
      const x = Math.round(c.absoluteBoundingBox.x - node.absoluteBoundingBox.x);
      const y = Math.round(c.absoluteBoundingBox.y - node.absoluteBoundingBox.y);
      // Inject inline style for position - we wrap in a positioning div
      return `<div style="position:absolute;left:${x}px;top:${y}px;">${html}</div>`;
    }
    return html;
  }).join("\n");

  return `<div class="${cls}">\n${children}\n</div>`;
}

export function buildCss(ctx: ConvertCtx): string {
  const parts: string[] = [];
  for (const [cls, style] of ctx.cssRules) {
    parts.push(`.${cls} {\n${styleToCssString(style)}\n}`);
  }
  return parts.join("\n\n");
}

export function collectImageRefs(node: any, out: Set<string> = new Set()): Set<string> {
  if (!node) return out;
  for (const f of node.fills || []) {
    if (f?.type === "IMAGE" && f.imageRef) out.add(f.imageRef);
  }
  for (const c of node.children || []) collectImageRefs(c, out);
  return out;
}

export function convertFrame(
  node: any,
  imageMap: Record<string, string>,
  vectorSvgMap: Record<string, string> = {}
): { html: string; css: string } {
  const ctx: ConvertCtx = { imageMap, cssRules: new Map(), classNames: new Set(), vectorSvgMap };
  const inner = convertNode(node, ctx, 0, true);
  const html = `<main>\n${inner}\n</main>`;
  const css = buildCss(ctx);
  return { html, css };
}
