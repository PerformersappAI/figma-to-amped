// Deterministic Figma node tree -> Puck Data JSON.
// Maps sections to the Puck components defined in puck-editor.tsx:
// Navbar, Hero, CardGrid, Heading, Paragraph, Image, Footer, Section.

type ImageMap = Record<string, string>;

export type PuckBlock = { type: string; props: Record<string, any> };
export type PuckData = { content: PuckBlock[]; root: { props: Record<string, any> } };

let _counter = 0;
function uid(prefix: string): string {
  _counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

function firstImageUrl(node: any, imageMap: ImageMap): string | null {
  if (!node) return null;
  for (const f of node.fills || []) {
    if (f?.type === "IMAGE" && f.imageRef && imageMap[f.imageRef]) return imageMap[f.imageRef];
  }
  for (const c of node.children || []) {
    const u = firstImageUrl(c, imageMap);
    if (u) return u;
  }
  return null;
}

function collectTexts(node: any, out: { text: string; size: number }[] = []): { text: string; size: number }[] {
  if (!node || node.visible === false) return out;
  if (node.type === "TEXT" && typeof node.characters === "string" && node.characters.trim()) {
    out.push({ text: node.characters.trim(), size: node.style?.fontSize || 16 });
  }
  for (const c of node.children || []) collectTexts(c, out);
  return out;
}

function collectImages(node: any, imageMap: ImageMap, out: string[] = []): string[] {
  if (!node || node.visible === false) return out;
  for (const f of node.fills || []) {
    if (f?.type === "IMAGE" && f.imageRef && imageMap[f.imageRef]) out.push(imageMap[f.imageRef]);
  }
  for (const c of node.children || []) collectImages(c, imageMap, out);
  return out;
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
  const logoText = texts[0]?.text?.slice(0, 24) || "BRAND";
  const logoUrl = firstImageUrl(section, imageMap) || "";
  const links = texts.slice(1, 7).map((t) => ({ label: t.text.slice(0, 24), href: "#" }));
  return {
    type: "Navbar",
    props: {
      id: uid("Navbar"),
      logoUrl,
      logoText: logoUrl ? "" : logoText,
      links: links.length ? links : [{ label: "Home", href: "#" }],
    },
  };
}

function toHero(section: any, imageMap: ImageMap): PuckBlock {
  const texts = collectTexts(section).sort((a, b) => b.size - a.size);
  const title = texts[0]?.text?.slice(0, 120) || section.name || "Hero";
  const subtitle = texts.slice(1, 3).map((t) => t.text).join(" ").slice(0, 240);
  const bg = firstImageUrl(section, imageMap) || "";
  return {
    type: "Hero",
    props: {
      id: uid("Hero"),
      backgroundImage: bg,
      title,
      subtitle,
      buttonLabel: "Learn more",
      buttonHref: "#",
    },
  };
}

function toCardGrid(section: any, cardNodes: any[], imageMap: ImageMap): PuckBlock {
  const cards = cardNodes.slice(0, 12).map((c) => {
    const texts = collectTexts(c).sort((a, b) => b.size - a.size);
    return {
      image: firstImageUrl(c, imageMap) || "https://placehold.co/400x300",
      title: texts[0]?.text?.slice(0, 80) || c.name || "Card",
      buttonLabel: "Learn more",
      buttonHref: "#",
    };
  });
  const cols = Math.min(6, Math.max(2, cards.length >= 4 ? 4 : cards.length));
  return {
    type: "CardGrid",
    props: {
      id: uid("CardGrid"),
      columns: cols,
      cards,
    },
  };
}

function toFooter(section: any): PuckBlock {
  const texts = collectTexts(section);
  const text = texts.find((t) => /©|copyright|rights/i.test(t.text))?.text || texts[0]?.text || "© Your company";
  const links = texts
    .filter((t) => !/©|copyright/i.test(t.text))
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

function extractLooseBlocks(section: any, imageMap: ImageMap): PuckBlock[] {
  // Fallback: emit headings / paragraphs / images so nothing is lost visually.
  const blocks: PuckBlock[] = [];
  const texts = collectTexts(section);
  const images = collectImages(section, imageMap);
  const seen = new Set<string>();

  for (const t of texts) {
    if (seen.has(t.text)) continue;
    seen.add(t.text);
    if (t.size >= 24) {
      blocks.push({
        type: "Heading",
        props: {
          id: uid("Heading"),
          text: t.text.slice(0, 200),
          level: t.size >= 40 ? "h1" : t.size >= 30 ? "h2" : "h3",
          align: "left",
          color: "#ffffff",
        },
      });
    } else {
      blocks.push({
        type: "Paragraph",
        props: {
          id: uid("Paragraph"),
          text: t.text,
          color: "#cccccc",
          align: "left",
        },
      });
    }
  }
  for (const src of images.slice(0, 4)) {
    blocks.push({
      type: "Image",
      props: { id: uid("Image"), src, alt: "", maxWidth: 1200 },
    });
  }
  if (blocks.length === 0) {
    blocks.push({
      type: "Heading",
      props: {
        id: uid("Heading"),
        text: section.name || "Section",
        level: "h2",
        align: "left",
        color: "#ffffff",
      },
    });
  }
  return blocks;
}

export function figmaFrameToPuck(frameNode: any, imageMap: ImageMap): PuckData {
  _counter = 0;
  const content: PuckBlock[] = [];
  if (!frameNode) return { content, root: { props: {} } };

  const rawSections: any[] = (frameNode.children || []).filter(
    (c: any) => c?.visible !== false && c?.isMask !== true,
  );
  // If the frame has only one giant wrapper child, dive one level.
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
    // Fallback: emit individual editable blocks from the section's contents.
    for (const b of extractLooseBlocks(section, imageMap)) content.push(b);
  });

  if (content.length === 0) {
    for (const b of extractLooseBlocks(frameNode, imageMap)) content.push(b);
  }

  return { content, root: { props: {} } };
}
