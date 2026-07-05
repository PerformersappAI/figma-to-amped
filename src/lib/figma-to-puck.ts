// Deterministic Figma node tree -> Puck Data JSON.
// Rules:
// - Only TEXT nodes with real `characters` produce Heading/Paragraph.
//   Layer names are NEVER used as visible text.
// - Decorative shapes (RECTANGLE/ELLIPSE/POLYGON/VECTOR/LINE/STAR/BOOLEAN_OPERATION)
//   are skipped unless they have an IMAGE fill -> Image component.
// - A shape/frame whose only meaningful text is short (<= 4 words, <= 32 chars)
//   collapses to a single Button component with that label.

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

function hasImageFill(node: any): boolean {
  return (node?.fills || []).some((f: any) => f?.type === "IMAGE" && f.imageRef);
}

function nodeImageUrl(node: any, imageMap: ImageMap): string | null {
  for (const f of node?.fills || []) {
    if (f?.type === "IMAGE" && f.imageRef && imageMap[f.imageRef]) return imageMap[f.imageRef];
  }
  return null;
}

function firstImageUrl(node: any, imageMap: ImageMap): string | null {
  if (!node || node.visible === false) return null;
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
  if (!node || node.visible === false) return out;
  if (node.type === "TEXT" && typeof node.characters === "string" && node.characters.trim()) {
    out.push({ text: node.characters.trim(), size: node.style?.fontSize || 16 });
  }
  for (const c of node.children || []) collectTexts(c, out);
  return out;
}

function collectImages(node: any, imageMap: ImageMap, out: string[] = []): string[] {
  if (!node || node.visible === false) return out;
  const own = nodeImageUrl(node, imageMap);
  if (own) out.push(own);
  for (const c of node.children || []) collectImages(c, imageMap, out);
  return out;
}

function isShortLabel(t: string): boolean {
  const words = t.trim().split(/\s+/);
  return words.length <= 4 && t.length <= 32;
}

function isButtonLike(node: any): boolean {
  if (!node) return false;
  const nameLc = (node.name || "").toLowerCase();
  if (/(^|\W)(btn|button|cta)(\W|$)/.test(nameLc)) {
    const t = collectTexts(node);
    if (t.length >= 1 && isShortLabel(t[0].text)) return true;
  }
  // Frame/instance with rounded background + single short text
  const texts = collectTexts(node);
  if (texts.length !== 1) return false;
  if (!isShortLabel(texts[0].text)) return false;
  const bbox = node.absoluteBoundingBox;
  if (!bbox || bbox.height > 80 || bbox.width > 320) return false;
  const hasBg =
    (node.fills || []).some((f: any) => f?.visible !== false && f?.type?.startsWith("SOLID")) ||
    (node.backgroundColor != null) ||
    (typeof node.cornerRadius === "number" && node.cornerRadius > 0);
  return hasBg;
}

function looksLikeNavbar(node: any): boolean {
  const bbox = node.absoluteBoundingBox;
  if (!bbox) return false;
  if (bbox.height > 140) return false;
  const texts = collectTexts(node);
  return texts.length >= 2 && texts.every((t) => t.size <= 22);
}

function looksLikeFooter(node: any): boolean {
  const bbox = node.absoluteBoundingBox;
  if (!bbox) return false;
  if (bbox.height > 400) return false;
  const nameLc = (node.name || "").toLowerCase();
  if (/footer/.test(nameLc)) return true;
  const texts = collectTexts(node);
  return texts.length >= 1 && texts.every((t) => t.size <= 18);
}

function looksLikeHero(node: any, imageMap: ImageMap): boolean {
  const bbox = node.absoluteBoundingBox;
  if (!bbox || bbox.height < 320) return false;
  const bg = firstImageUrl(node, imageMap);
  const texts = collectTexts(node);
  const hasBigText = texts.some((t) => t.size >= 28);
  return !!bg && hasBigText;
}

function detectCardChildren(section: any, imageMap: ImageMap): any[] | null {
  const children = (section.children || []).filter((c: any) => c?.visible !== false && c?.isMask !== true);
  if (children.length < 2) return null;
  const withImg = children.filter((c: any) => firstImageUrl(c, imageMap) && collectTexts(c).length >= 1);
  if (withImg.length >= Math.min(2, children.length)) return withImg;
  return null;
}

function toNavbar(section: any, imageMap: ImageMap): PuckBlock {
  const texts = collectTexts(section);
  const logoUrl = firstImageUrl(section, imageMap) || "";
  const logoText = logoUrl ? "" : texts[0]?.text?.slice(0, 24) || "BRAND";
  const linkTexts = logoUrl ? texts : texts.slice(1);
  const links = linkTexts.slice(0, 6).map((t) => ({ label: t.text.slice(0, 24), href: "#" }));
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
  // Find a short CTA label if any
  const cta = texts.find((t) => isShortLabel(t.text) && t !== texts[0]);
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

function toCardGrid(_section: any, cardNodes: any[], imageMap: ImageMap): PuckBlock {
  const cards = cardNodes.slice(0, 12).map((c) => {
    const texts = collectTexts(c).sort((a, b) => b.size - a.size);
    const title = texts[0]?.text?.slice(0, 80) || "";
    const cta = texts.find((t) => isShortLabel(t.text) && t.text !== title);
    return {
      image: firstImageUrl(c, imageMap) || "https://placehold.co/400x300",
      title: title || "Untitled",
      buttonLabel: cta?.text?.slice(0, 32) || "Learn more",
      buttonHref: "#",
    };
  });
  const cols = Math.min(6, Math.max(2, cards.length >= 4 ? 4 : cards.length));
  return {
    type: "CardGrid",
    props: { id: uid("CardGrid"), columns: cols, cards },
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

// Walk a subtree and emit blocks. Skips decorative shapes and layer names.
// Collapses button-like frames into a single Button block.
function walkForBlocks(node: any, imageMap: ImageMap, blocks: PuckBlock[], seenText: Set<string>): void {
  if (!node || node.visible === false || node.isMask) return;

  // Button collapse: emit one Button and STOP descending into its children.
  if (isButtonLike(node)) {
    const t = collectTexts(node)[0];
    if (t && !seenText.has("btn:" + t.text)) {
      seenText.add("btn:" + t.text);
      blocks.push({
        type: "Button",
        props: { id: uid("Button"), label: t.text.slice(0, 32), href: "#", variant: "primary" },
      });
    }
    return;
  }

  // TEXT node -> Heading or Paragraph based on font size
  if (node.type === "TEXT") {
    const raw = typeof node.characters === "string" ? node.characters.trim() : "";
    if (!raw) return;
    if (seenText.has("txt:" + raw)) return;
    seenText.add("txt:" + raw);
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

  // Node with image fill -> Image
  const ownImg = nodeImageUrl(node, imageMap);
  if (ownImg) {
    if (!seenText.has("img:" + ownImg)) {
      seenText.add("img:" + ownImg);
      blocks.push({
        type: "Image",
        props: { id: uid("Image"), src: ownImg, alt: "", maxWidth: 1200 },
      });
    }
    // Don't descend into image-fill nodes (their children are usually mask/overlays)
    return;
  }

  // Purely decorative shape with no image fill and no children -> skip
  if (DECORATIVE_TYPES.has(node.type)) {
    // Descend only if it somehow has meaningful text children (rare)
    for (const c of node.children || []) walkForBlocks(c, imageMap, blocks, seenText);
    return;
  }

  // Container: recurse into children
  for (const c of node.children || []) walkForBlocks(c, imageMap, blocks, seenText);
}

function extractSectionBlocks(section: any, imageMap: ImageMap): PuckBlock[] {
  const blocks: PuckBlock[] = [];
  const seen = new Set<string>();
  for (const c of section.children || []) walkForBlocks(c, imageMap, blocks, seen);
  // If the section itself is a TEXT / has image fill (unlikely at top level), handle it
  if (blocks.length === 0) walkForBlocks(section, imageMap, blocks, seen);
  return blocks;
}

export function figmaFrameToPuck(frameNode: any, imageMap: ImageMap): PuckData {
  _counter = 0;
  const content: PuckBlock[] = [];
  if (!frameNode) return { content, root: { props: {} } };

  const rawSections: any[] = (frameNode.children || []).filter(
    (c: any) => c?.visible !== false && c?.isMask !== true,
  );
  const sections =
    rawSections.length === 1 && (rawSections[0].children || []).length > 1
      ? rawSections[0].children.filter((c: any) => c?.visible !== false && c?.isMask !== true)
      : rawSections;

  sections.forEach((section: any, index: number) => {
    const isFirst = index === 0;
    const isLast = index === sections.length - 1;
    const cards = detectCardChildren(section, imageMap);

    if (isFirst && looksLikeNavbar(section)) {
      content.push(toNavbar(section, imageMap));
      return;
    }
    if (isLast && looksLikeFooter(section)) {
      content.push(toFooter(section));
      return;
    }
    if (looksLikeHero(section, imageMap)) {
      content.push(toHero(section, imageMap));
      return;
    }
    if (cards) {
      content.push(toCardGrid(section, cards, imageMap));
      return;
    }
    // Fallback: emit real text/image/button blocks from within this section.
    for (const b of extractSectionBlocks(section, imageMap)) content.push(b);
  });

  if (content.length === 0) {
    for (const b of extractSectionBlocks(frameNode, imageMap)) content.push(b);
  }

  return { content, root: { props: {} } };
}
