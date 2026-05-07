import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Upload, Wand2, Rocket } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="font-display text-2xl tracking-wider">
          FIGMA<span style={{ color: "var(--accent)" }}>SHIP</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/login" className="btn-ghost text-sm">Sign in</Link>
          <Link to="/login" className="btn-primary text-sm">Get started</Link>
        </nav>
      </header>

      <main className="px-6">
        <section className="mx-auto max-w-5xl py-24 text-center">
          <div className="inline-block px-3 py-1 mb-6 text-xs font-display uppercase tracking-widest border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
            Figma → live website
          </div>
          <h1 className="text-6xl md:text-8xl leading-[0.9]">
            Ship your Figma <br /> design as a real <br />
            <span style={{ color: "var(--accent)" }}>website. Today.</span>
          </h1>
          <p className="max-w-xl mx-auto mt-8 text-lg text-muted-foreground">
            Drop your Builder.io export. Edit it visually. Talk to an AI design assistant.
            Publish a shareable preview in minutes — no developer required.
          </p>
          <div className="flex items-center justify-center gap-3 mt-10">
            <Link to="/login" className="btn-primary">
              Start shipping <ArrowRight size={18} />
            </Link>
            <a href="#how" className="btn-ghost">See how it works</a>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl pb-24 grid md:grid-cols-3 gap-4">
          {[
            { icon: Upload, title: "1. Drop your ZIP", body: "Export from the Builder.io Visual Copilot Figma plugin and drop the ZIP into FigmaShip." },
            { icon: Wand2, title: "2. Edit visually", body: "Drag, drop, restyle. Ask the AI assistant for help with fonts, spacing, and brand polish." },
            { icon: Rocket, title: "3. Publish & share", body: "Download clean code, hand it to a dev, or share a live preview link with a single click." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel p-6">
              <Icon style={{ color: "var(--accent)" }} size={28} />
              <h3 className="mt-4 text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground font-display uppercase tracking-widest">
        FigmaShip · A Premium Tool by Amped
      </footer>
    </div>
  );
}
