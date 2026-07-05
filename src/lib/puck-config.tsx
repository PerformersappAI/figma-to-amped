import type { Config, Data } from "@measured/puck";

type CardItem = { image: string; title: string; buttonLabel: string; buttonHref: string };
type MenuLink = { label: string; href: string };
type FooterLink = { label: string; href: string };

export const ACCENT = "#c8f000";

export const EMPTY_PUCK_DATA: Data = { content: [], root: { props: {} } };

export const puckConfig: Config = {
  components: {
    Section: {
      fields: {
        background: { type: "text", label: "Background color (hex)" },
        backgroundImage: { type: "text", label: "Background image URL (optional)" },
        paddingY: { type: "number", label: "Vertical padding (px)" },
        paddingX: { type: "number", label: "Horizontal padding (px)" },
      },
      defaultProps: {
        background: "#111111",
        backgroundImage: "",
        paddingY: 80,
        paddingX: 24,
      },
      render: ({ background, backgroundImage, paddingY, paddingX, puck }: any) => (
        <section
          style={{
            background: backgroundImage ? `url(${backgroundImage}) center/cover, ${background}` : background,
            padding: `${paddingY}px ${paddingX}px`,
            color: "#fff",
          }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {puck?.renderDropZone ? puck.renderDropZone({ zone: "content" }) : null}
          </div>
        </section>
      ),
    },
    Heading: {
      fields: {
        text: { type: "text" },
        level: {
          type: "select",
          options: [
            { label: "H1", value: "h1" },
            { label: "H2", value: "h2" },
            { label: "H3", value: "h3" },
          ],
        },
        align: {
          type: "select",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
        },
        color: { type: "text" },
      },
      defaultProps: { text: "Your heading", level: "h2", align: "left", color: "#ffffff" },
      render: ({ text, level, align, color }: any) => {
        const Tag = level as any;
        return (
          <Tag
            style={{
              textAlign: align,
              color,
              fontFamily: "'Barlow Condensed', sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 800,
              margin: 0,
            }}
          >
            {text}
          </Tag>
        );
      },
    },
    Paragraph: {
      fields: {
        text: { type: "textarea" },
        color: { type: "text" },
        align: {
          type: "select",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
        },
      },
      defaultProps: { text: "Add your paragraph text here.", color: "#cccccc", align: "left" },
      render: ({ text, color, align }: any) => (
        <p style={{ color, textAlign: align, lineHeight: 1.6, margin: "12px 0" }}>{text}</p>
      ),
    },
    Image: {
      fields: {
        src: { type: "text", label: "Image URL" },
        alt: { type: "text" },
        maxWidth: { type: "number", label: "Max width (px)" },
      },
      defaultProps: { src: "https://placehold.co/800x500", alt: "", maxWidth: 800 },
      render: ({ src, alt, maxWidth }: any) => (
        <img src={src} alt={alt} style={{ width: "100%", maxWidth, display: "block", margin: "0 auto" }} />
      ),
    },
    Button: {
      fields: {
        label: { type: "text" },
        href: { type: "text" },
        variant: {
          type: "select",
          options: [
            { label: "Primary", value: "primary" },
            { label: "Ghost", value: "ghost" },
          ],
        },
      },
      defaultProps: { label: "Click me", href: "#", variant: "primary" },
      render: ({ label, href, variant }: any) => (
        <a
          href={href}
          style={{
            display: "inline-block",
            padding: "12px 24px",
            fontFamily: "'Barlow Condensed', sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 800,
            textDecoration: "none",
            borderRadius: 4,
            background: variant === "primary" ? ACCENT : "transparent",
            color: variant === "primary" ? "#0a0a0a" : "#fff",
            border: variant === "primary" ? "none" : "1px solid #2a2a2a",
          }}
        >
          {label}
        </a>
      ),
    },
    Navbar: {
      fields: {
        logoUrl: { type: "text", label: "Logo URL" },
        logoText: { type: "text", label: "Logo text (if no image)" },
        links: {
          type: "array",
          arrayFields: {
            label: { type: "text" },
            href: { type: "text" },
          },
          defaultItemProps: { label: "Link", href: "#" },
        },
      },
      defaultProps: {
        logoUrl: "",
        logoText: "BRAND",
        links: [
          { label: "Home", href: "#" },
          { label: "About", href: "#" },
          { label: "Contact", href: "#" },
        ] as MenuLink[],
      },
      render: ({ logoUrl, logoText, links }: any) => (
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 32px",
            background: "#0a0a0a",
            color: "#fff",
            borderBottom: "1px solid #1e1e1e",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="logo" style={{ height: 32 }} />
            ) : (
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  textTransform: "uppercase",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                }}
              >
                {logoText}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {(links || []).map((l: MenuLink, i: number) => (
              <a
                key={i}
                href={l.href}
                style={{ color: "#fff", textDecoration: "none", fontSize: 14 }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </nav>
      ),
    },
    Hero: {
      fields: {
        backgroundImage: { type: "text", label: "Background image URL" },
        title: { type: "text" },
        subtitle: { type: "textarea" },
        buttonLabel: { type: "text" },
        buttonHref: { type: "text" },
      },
      defaultProps: {
        backgroundImage: "",
        title: "Big Hero Title",
        subtitle: "Say something compelling here.",
        buttonLabel: "Get Started",
        buttonHref: "#",
      },
      render: ({ backgroundImage, title, subtitle, buttonLabel, buttonHref }: any) => (
        <section
          style={{
            padding: "120px 24px",
            textAlign: "center",
            background: backgroundImage
              ? `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)), url(${backgroundImage}) center/cover`
              : "#0a0a0a",
            color: "#fff",
          }}
        >
          <h1
            style={{
              fontSize: 56,
              margin: 0,
              fontFamily: "'Barlow Condensed', sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 800,
            }}
          >
            {title}
          </h1>
          <p style={{ marginTop: 16, color: "#ccc", fontSize: 18, maxWidth: 640, marginInline: "auto" }}>
            {subtitle}
          </p>
          <a
            href={buttonHref}
            style={{
              display: "inline-block",
              marginTop: 32,
              padding: "14px 28px",
              background: ACCENT,
              color: "#0a0a0a",
              fontFamily: "'Barlow Condensed', sans-serif",
              textTransform: "uppercase",
              fontWeight: 800,
              letterSpacing: "0.05em",
              textDecoration: "none",
              borderRadius: 4,
            }}
          >
            {buttonLabel}
          </a>
        </section>
      ),
    },
    CardGrid: {
      fields: {
        columns: {
          type: "select",
          options: [2, 3, 4, 5, 6].map((n) => ({ label: `${n} columns`, value: n })),
        },
        cards: {
          type: "array",
          arrayFields: {
            image: { type: "text", label: "Image URL" },
            title: { type: "text" },
            buttonLabel: { type: "text" },
            buttonHref: { type: "text" },
          },
          defaultItemProps: {
            image: "https://placehold.co/400x300",
            title: "Card title",
            buttonLabel: "Learn more",
            buttonHref: "#",
          },
        },
      },
      defaultProps: {
        columns: 3,
        cards: [
          { image: "https://placehold.co/400x300", title: "Card one", buttonLabel: "Learn more", buttonHref: "#" },
          { image: "https://placehold.co/400x300", title: "Card two", buttonLabel: "Learn more", buttonHref: "#" },
          { image: "https://placehold.co/400x300", title: "Card three", buttonLabel: "Learn more", buttonHref: "#" },
        ] as CardItem[],
      },
      render: ({ columns, cards }: any) => (
        <div
          style={{
            display: "grid",
            gap: 24,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            padding: "40px 24px",
            background: "#111",
          }}
        >
          {(cards || []).map((c: CardItem, i: number) => (
            <div key={i} style={{ background: "#1a1a1a", borderRadius: 6, overflow: "hidden" }}>
              <img src={c.image} alt="" style={{ width: "100%", display: "block" }} />
              <div style={{ padding: 20 }}>
                <h3
                  style={{
                    color: "#fff",
                    margin: "0 0 12px",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {c.title}
                </h3>
                <a
                  href={c.buttonHref}
                  style={{
                    display: "inline-block",
                    padding: "8px 16px",
                    background: ACCENT,
                    color: "#0a0a0a",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    fontSize: 12,
                    letterSpacing: "0.05em",
                    textDecoration: "none",
                    borderRadius: 4,
                  }}
                >
                  {c.buttonLabel}
                </a>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    Footer: {
      fields: {
        text: { type: "text" },
        links: {
          type: "array",
          arrayFields: {
            label: { type: "text" },
            href: { type: "text" },
          },
          defaultItemProps: { label: "Link", href: "#" },
        },
      },
      defaultProps: {
        text: "© Your company",
        links: [
          { label: "Privacy", href: "#" },
          { label: "Terms", href: "#" },
        ] as FooterLink[],
      },
      render: ({ text, links }: any) => (
        <footer
          style={{
            padding: "32px 24px",
            background: "#0a0a0a",
            color: "#888",
            borderTop: "1px solid #1e1e1e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 13 }}>{text}</span>
          <div style={{ display: "flex", gap: 20 }}>
            {(links || []).map((l: FooterLink, i: number) => (
              <a key={i} href={l.href} style={{ color: "#888", textDecoration: "none", fontSize: 13 }}>
                {l.label}
              </a>
            ))}
          </div>
        </footer>
      ),
    },
  },
};

export function hasPuckData(pd: unknown): pd is Data {
  return !!pd && typeof pd === "object" && Array.isArray((pd as any).content);
}
