// Fidelity-first Figma -> Puck converter.
// Each top-level child of the frame becomes ONE FaithfulSection block.
// Every visible descendant with text or an image fill is flattened into
// children[] with absolute x/y/w/h, scaled so the section renders at 1440px
// wide regardless of the source design's width.

import type { PuckData } from "@/lib/figma-to-puck";

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

const TARGET_WIDTH = 1440;

let _counter = 0;
function uid(prefix: string): string {
  _counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

function isVisible(n: any): boolean {
  return !!n && n.visible !== false && n.isMask !== true;
}

function nodeImageUrl(node: any, imageMap: ImageMap): string | null {
  for (const f of node?.fills || []) {
    if (f?.type === "IMAGE" && f.imageRef && imageMap[f.imageRef]) return imageMap[f.imageRef];
  }
  return null;
}

function nodeSolidBg(node: any): string | null {
  const f = (node?.fills || []).find((x: any) => x?.type === "SOLID" && x.visible !== false);
  if (!f?.color) return null;
  const r = Math.round((f.color.r ?? 0) * 255);
  const g = Math.round((f.color.g ?? 0) * 255);
  const b = Math.round((f.color.b ?? 0) * 255);
  const a = f.opacity ?? f.color.a ?? 1;
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}

function nodeTextColor(node: any): string {
  const f = (node?.fills || []).find((x: any) => x?.type === "SOLID" && x.visible !== false);
  if (!f?.color) return "#ffffff";
  const r = Math.round((f.color.r ?? 0) * 255);
  const g = Math.round((f.color.g ?? 0) * 255);
  const b = Math.round((f.color.b ?? 0) * 255);
  return `rgb(${r},${g},${b})`;
}

function isShortLabel(t: string): boolean {
  const words = t.trim().split(/\s+/);
  return words.length <= 4 && t.length <= 32;
}

function looksLikeButton(node: any, text: string): boolean {
  if (!isShortLabel(text)) return false;
  // Buttons in Figma are typically a text node inside a filled/rounded frame.
  // We consider it a button if the immediate parent frame has bg + small height.
  return true;
}

type Child = {
  kind: "text" | "image" | "button";
  x: number; y: number; width: number; height: number;
  text?: string; src?: string; href?: string;
  fontSize?: number; fontWeight?: number; color?: string;
  textAlign?: "left" | "center" | "right";
  backgroundColor?: string;
};

function walk(
  node: any,
  imageMap: ImageMap,
  sectionOrigin: { x: number; y: number },
  scale: number,
  out: Child[],
  parentIsButton = false,
): void {
  if (!isVisible(node)) return;
  const b = node.absoluteBoundingBox;

  // TEXT node
  if (node.type === "TEXT") {
    const t = typeof node.characters === "string" ? node.characters.trim() : "";
    if (!t || !b) return;
    const align = (node.style?.textAlignHorizontal || "LEFT").toLowerCase() as any;
    out.push({
      kind: parentIsButton && looksLikeButton(node, t) ? "button" : "text",
      x: Math.round((b.x - sectionOrigin.x) * scale),
      y: Math.round((b.y - sectionOrigin.y) * scale),
      width: Math.round(b.width * scale),
      height: Math.round(b.height * scale),
      text: t,
      fontSize: node.style?.fontSize ? Math.round(node.style.fontSize * scale) : 16,
      fontWeight: node.style?.fontWeight || 400,
      color: nodeTextColor(node),
      textAlign: (["left","center","right"].includes(align) ? align : "left"),
      href: parentIsButton ? "#" : undefined,
    });
    return;
  }

  // Image fill on any node -> image child
  const img = nodeImageUrl(node, imageMap);
  if (img && b) {
    out.push({
      kind: "image",
      x: Math.round((b.x - sectionOrigin.x) * scale),
      y: Math.round((b.y - sectionOrigin.y) * scale),
      width: Math.round(b.width * scale),
      height: Math.round(b.height * scale),
      src: img,
    });
    // don't return — a filled frame may still have text children on top
  }

  // Skip pure decorative shapes with no fill and no children
  if (DECORATIVE_TYPES.has(node.type) && !img) {
    // still allow if it has visible children (rare for these types)
    if (!node.children?.length) return;
  }

  // Detect button-like wrapper: frame with solid bg + rounded + small height + single text child
  const bg = nodeSolidBg(node);
  const hasRadius = typeof node.cornerRadius === "number" && node.cornerRadius > 0;
  const smallH = b && b.height <= 80 && b.width <= 400;
  const singleTextChild =
    Array.isArray(node.children) &&
    node.children.filter(isVisible).length === 1 &&
    node.children.find(isVisible)?.type === "TEXT";
  const buttonWrapper = !!bg && hasRadius && smallH && singleTextChild;

  for (const c of node.children || []) {
    walk(c, imageMap, sectionOrigin, scale, out, buttonWrapper);
  }
}

function sectionFromFrame(section: any, imageMap: ImageMap, scale: number): any {
  const b = section.absoluteBoundingBox || { x: 0, y: 0, width: 1440, height: 600 };
  const children: Child[] = [];
  for (const c of section.children || []) {
    walk(c, imageMap, { x: b.x, y: b.y }, scale, children);
  }
  // Background: solid color and/or image fill on section itself.
  const bg = nodeSolidBg(section) || "";
  const bgImage = nodeImageUrl(section, imageMap) || "";
  return {
    type: "FaithfulSection",
    props: {
      id: uid("FaithfulSection"),
      width: Math.round(b.width * scale),
      height: Math.round(b.height * scale),
      backgroundColor: bg,
      backgroundImage: bgImage,
      children,
    },
  };
}

export function figmaFrameToPuckFaithful(frameNode: any, imageMap: ImageMap): PuckData {
  _counter = 0;
  if (!frameNode) return { content: [], root: { props: {} } };

  const frameW = frameNode.absoluteBoundingBox?.width || TARGET_WIDTH;
  const scale = TARGET_WIDTH / frameW;

  let sections: any[] = (frameNode.children || []).filter(isVisible);
  // Unwrap a single wrapper child
  if (sections.length === 1 && (sections[0].children || []).filter(isVisible).length > 1) {
    sections = (sections[0].children || []).filter(isVisible);
  }
  // If frame has no children at all, treat the frame itself as one section
  if (sections.length === 0) {
    return { content: [sectionFromFrame(frameNode, imageMap, scale)], root: { props: {} } };
  }

  sections.sort(
    (a, b) => (a.absoluteBoundingBox?.y ?? 0) - (b.absoluteBoundingBox?.y ?? 0),
  );

  const content = sections.map((s) => sectionFromFrame(s, imageMap, scale));
  return { content, root: { props: {} } };
}
