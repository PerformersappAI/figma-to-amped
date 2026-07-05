// Deterministic Figma node tree -> Puck Data JSON.
// Layout-aware:
// - Top-level frame children are ordered by Y and each maps to ONE Puck block.
// - Rows (children sharing a Y band, spread across X) collapse into a single
//   Navbar / CardGrid, never a stack of separate blocks.
// - Large frames with a background image + text -> single Hero.
// - Buttons stay inside their parent section (never emitted at top level as
//   a separate stack).
// - Layer NAMES are never used as visible text. Decorative shapes
//   (RECTANGLE/ELLIPSE/POLYGON/VECTOR/LINE/STAR/BOOLEAN_OPERATION) are
//   skipped at every depth unless they carry an IMAGE fill.

type ImageMap = Record<string, string>;

export type PuckBlock = { type: string; props: Record<string, any> };
export type PuckData = { content: PuckBlock[]; root: { props: Record<string, any> } };

const DECORATIVE_TYPES = new Set([
  "RECTANGLE",
  "ELLIPSE",
  "POLYGON",
  "STAR",
  "VECTOR",
  "LINE",
  "BOOLEAN_OPERATION",
]);

let _counter = 0;
function uid(prefix: string): string {
  _counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

// ---------------- helpers ----------------

function isVisible(n: any): boolean {
  return !!n && n.visible !== false && n.isMask !== true;
}

function bbox(n: any): { x: number; y: number; w: number; h: number } | null {
  const b = n?.absoluteBoundingBox;
  if (!b) return null;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

function nodeImageUrl(node: any, imageMap: ImageMap): string | null {
  for (const f of node?.fills || []) {
    if (f?.type === "IMAGE" && f.imageRef && imageMap[f.imageRef]) return imageMap[f.imageRef];
  }
  return null;
}

function firstImageUrl(node: any, imageMap: ImageMap): string | null {
  if (!isVisible(node)) return null;
  const own = nodeImageUrl(node, imageMap);
  if (own) return own;
  for (const c of node.children || []) {
    const u = firstImageUrl(c, imageMap);
    if (u) return u;
  }
  return null;
}

type TextItem = { text: string; size: number };

function collectTexts(node: any, out: TextItem[] = []): TextItem[] {
  if (!isVisible(node)) return out;
  if (node.type === "TEXT" && typeof node.characters === "string" && node.characters.trim()) {
    // Skip single-letter "K"-style leaked glyphs.
    const t = node.characters.trim();
    if (t.length >= 2 || /\w{2,}/.test(t)) {
      out.push({ text: t, size: node.style?.fontSize || 16 });
    }
  }
  for (const c of node.children || []) collectTexts(c, out);
  return out;
}

function isShortLabel(t: string): boolean {
  const words = t.trim().split(/\s+/);
  return words.length <= 4 && t.length <= 32;
}

function isButtonLike(node: any): boolean {
  if (!node) return false;
  const nameLc = (node.name || "").toLowerCase();
  const texts = collectTexts(node);
  if (texts.length !== 1) return false;
  if (!isShortLabel(texts[0].text)) return false;
  const b = bbox(node);
  if (!b || b.h > 80 || b.w > 320) return false;
  const hasBg =
    (node.fills || []).some((f: any) => f?.visible !== false && f?.type?.startsWith("SOLID")) ||
    (node.backgroundColor != null) ||
    (typeof node.cornerRadius === "number" && node.cornerRadius > 0) ||
    /(^|\W)(btn|button|cta)(\W|$)/.test(nameLc);
  return hasBg;
}

// ---------------- row detection ----------------

function groupIntoRows(children: any[]): any[][] {
  const withBbox = children.map((c) => ({ node: c, b: bbox(c) })).filter((x) => x.b);
  withBbox.sort((a, b) => a.b!.y - b.b!.y);
  const rows: { node: any; b: any }[][] = [];
  for (const item of withBbox) {
    const row = rows[rows.length - 1];
    if (!row) { rows.push([item]); continue; }
    const ref = row[0].b;
    const overlap = item.b!.y < ref.y + ref.h * 0.6 && item.b!.y + item.b!.h > ref.y + ref.h * 0.4;
    if (overlap) row.push(item);
    else rows.push([item]);
  }
  return rows.map((r) => r.sort((a, b) => a.b.x - b.b.x).map((x) => x.node));
}

// ---------------- section classifiers ----------------

function looksLikeNavbar(section: any): boolean {
  const b = bbox(section);
  if (!b || b.h > 160) return false;
  const texts = collectTexts(section);
  return texts.length >= 2 && texts.every((t) => t.size <= 22);
}

function looksLikeFooter(section: any): boolean {
  const b = bbox(section);
  if (!b) return false;
  if (b.h > 500) return false;
  const nameLc = (section.name || "").toLowerCase();
  if (/footer/.test(nameLc)) return true;
  const texts = collectTexts(section);
  return texts.length >= 1 && texts.every((t) => t.size <= 18);
}

function looksLikeHero(section: any, imageMap: ImageMap): boolean {
  const b = bbox(section);
  if (!b || b.h < 400) return false;
  const bg = firstImageUrl(section, imageMap);
  const texts = collectTexts(section);
  const hasBigText = texts.some((t) => t.size >= 28);
  return !!bg && hasBigText;
}

// ---------------- section builders ----------------

function toNavbar(section: any, imageMap: ImageMap): PuckBlock {
  const texts = collectTexts(section);
  const logoUrl = firstImageUrl(section, imageMap) || "";
  const logoText = logoUrl ? "" : texts[0]?.text?.slice(0, 24) || "BRAND";
  const linkTexts = logoUrl ? texts : texts.slice(1);
  const links = linkTexts
    .filter((t) => isShortLabel(t.text))
    .slice(0, 6)
    .map((t) => ({ label: t.text.slice(0, 24), href: "#" }));
  return {
    type: "Navbar",
    props: {
      id: uid("Navbar"),
      logoUrl,
      logoText,
      links: links.length ? links : [{ label: "Home", href: "#" }],
    },
  };
}

function toHero(section: any, imageMap: ImageMap): PuckBlock {
  const texts = collectTexts(section).sort((a, b) => b.size - a.size);
  const title = texts[0]?.text?.slice(0, 120) || "Welcome";
  const subtitle = texts.slice(1, 3).map((t) => t.text).join(" ").slice(0, 240);
  const cta = texts.find((t) => isShortLabel(t.text) && t.text !== title);
  const bg = firstImageUrl(section, imageMap) || "";
  return {
    type: "Hero",
    props: {
      id: uid("Hero"),
      backgroundImage: bg,
      title,
      subtitle,
      buttonLabel: cta?.text?.slice(0, 32) || "Learn more",
      buttonHref: "#",
    },
  };
}

function toFooter(section: any): PuckBlock {
  const texts = collectTexts(section);
  const text =
    texts.find((t) => /©|copyright|rights/i.test(t.text))?.text || texts[0]?.text || "© Your company";
  const links = texts
    .filter((t) => !/©|copyright/i.test(t.text) && isShortLabel(t.text))
    .slice(0, 6)
    .map((t) => ({ label: t.text.slice(0, 24), href: "#" }));
  return {
    type: "Footer",
    props: {
      id: uid("Footer"),
      text: text.slice(0, 120),
      links: links.length ? links : [{ label: "Privacy", href: "#" }],
    },
  };
}

function toCardGridFromRow(rowNodes: any[], imageMap: ImageMap): PuckBlock | null {
  const cards = rowNodes
    .map((n) => {
      const img = firstImageUrl(n, imageMap);
      if (!img) return null;
      const texts = collectTexts(n).sort((a, b) => b.size - a.size);
      const title = texts[0]?.text?.slice(0, 80) || "";
      const cta = texts.find((t) => isShortLabel(t.text) && t.text !== title);
      return {
        image: img,
        title: title || "",
        buttonLabel: cta?.text?.slice(0, 32) || "",
        buttonHref: "#",
      };
    })
    .filter(Boolean) as any[];
  if (cards.length < 2) return null;
  const cols = Math.min(6, Math.max(2, cards.length >= 4 ? 4 : cards.length));
  return { type: "CardGrid", props: { id: uid("CardGrid"), columns: cols, cards } };
}

// ---------------- generic block extraction ----------------

function walkForBlocks(node: any, imageMap: ImageMap, blocks: PuckBlock[], seen: Set<string>): void {
  if (!isVisible(node)) return;

  // Button collapse: emit one Button, stop descending.
  if (isButtonLike(node)) {
    const t = collectTexts(node)[0];
    if (t && !seen.has("btn:" + t.text)) {
      seen.add("btn:" + t.text);
      blocks.push({
        type: "Button",
        props: { id: uid("Button"), label: t.text.slice(0, 32), href: "#", variant: "primary" },
      });
    }
    return;
  }

  if (node.type === "TEXT") {
    const raw = typeof node.characters === "string" ? node.characters.trim() : "";
    if (!raw) return;
    if (raw.length < 2) return; // skip stray glyphs
    if (seen.has("txt:" + raw)) return;
    seen.add("txt:" + raw);
    const size = node.style?.fontSize || 16;
    if (size >= 24) {
      blocks.push({
        type: "Heading",
        props: {
          id: uid("Heading"),
          text: raw.slice(0, 200),
          level: size >= 40 ? "h1" : size >= 30 ? "h2" : "h3",
          align: "left",
          color: "#ffffff",
        },
      });
    } else {
      blocks.push({
        type: "Paragraph",
        props: { id: uid("Paragraph"), text: raw, color: "#cccccc", align: "left" },
      });
    }
    return;
  }

  const ownImg = nodeImageUrl(node, imageMap);
  if (ownImg) {
    if (!seen.has("img:" + ownImg)) {
      seen.add("img:" + ownImg);
      blocks.push({ type: "Image", props: { id: uid("Image"), src: ownImg, alt: "", maxWidth: 1200 } });
    }
    return;
  }

  // Decorative shape with no image fill: skip entirely — do NOT descend
  // (children of decorative shapes are usually masks/overlays and their
  // layer names are noise).
  if (DECORATIVE_TYPES.has(node.type)) return;

  // Container: recurse into children in row order (top->bottom, left->right).
  const visibleChildren = (node.children || []).filter(isVisible);
  const rows = groupIntoRows(visibleChildren);
  for (const row of rows) {
    // If a row is a horizontal band of image-bearing children, collapse to CardGrid.
    if (row.length >= 3 && row.every((c) => firstImageUrl(c, imageMap))) {
      const grid = toCardGridFromRow(row, imageMap);
      if (grid) { blocks.push(grid); continue; }
    }
    for (const c of row) walkForBlocks(c, imageMap, blocks, seen);
  }
}

function extractSectionBlocks(section: any, imageMap: ImageMap): PuckBlock[] {
  const blocks: PuckBlock[] = [];
  const seen = new Set<string>();
  const visibleChildren = (section.children || []).filter(isVisible);
  const rows = groupIntoRows(visibleChildren);
  for (const row of rows) {
    if (row.length >= 3 && row.every((c) => firstImageUrl(c, imageMap))) {
      const grid = toCardGridFromRow(row, imageMap);
      if (grid) { blocks.push(grid); continue; }
    }
    for (const c of row) walkForBlocks(c, imageMap, blocks, seen);
  }
  if (blocks.length === 0) walkForBlocks(section, imageMap, blocks, seen);
  return blocks;
}

// ---------------- top-level entry ----------------

export function figmaFrameToPuck(frameNode: any, imageMap: ImageMap): PuckData {
  _counter = 0;
  const content: PuckBlock[] = [];
  if (!frameNode) return { content, root: { props: {} } };

  // Unwrap single-child wrapper frames.
  let rawSections: any[] = (frameNode.children || []).filter(isVisible);
  if (rawSections.length === 1 && (rawSections[0].children || []).length > 1) {
    rawSections = rawSections[0].children.filter(isVisible);
  }

  // Order sections top-to-bottom by Y.
  const sections = [...rawSections].sort((a, b) => {
    const ba = bbox(a), bb = bbox(b);
    return (ba?.y ?? 0) - (bb?.y ?? 0);
  });

  sections.forEach((section: any, index: number) => {
    const isFirst = index === 0;
    const isLast = index === sections.length - 1;

    if (isFirst && looksLikeNavbar(section)) { content.push(toNavbar(section, imageMap)); return; }
    if (isLast && looksLikeFooter(section)) { content.push(toFooter(section)); return; }
    if (looksLikeHero(section, imageMap)) { content.push(toHero(section, imageMap)); return; }

    // If this section IS a horizontal row of image children, emit one CardGrid.
    const visibleChildren = (section.children || []).filter(isVisible);
    const rows = groupIntoRows(visibleChildren);
    if (rows.length === 1 && rows[0].length >= 3 && rows[0].every((c) => firstImageUrl(c, imageMap))) {
      const grid = toCardGridFromRow(rows[0], imageMap);
      if (grid) { content.push(grid); return; }
    }

    for (const b of extractSectionBlocks(section, imageMap)) content.push(b);
  });

  if (content.length === 0) {
    for (const b of extractSectionBlocks(frameNode, imageMap)) content.push(b);
  }

  return { content, root: { props: {} } };
}
