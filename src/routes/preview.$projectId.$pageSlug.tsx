import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Render } from "@measured/puck";
import puckCssRaw from "@measured/puck/puck.css?raw";
import { supabase } from "@/integrations/supabase/client";
import { puckConfig, hasPuckData } from "@/lib/puck-config";
import type { Data } from "@measured/puck";

const puckCss = (puckCssRaw as string).replace(/@import\s+["']https?:\/\/[^"']+["'];?/g, "");

export const Route = createFileRoute("/preview/$projectId/$pageSlug")({
  head: () => ({
    links: [{ rel: "stylesheet", href: "https://rsms.me/inter/inter.css" }],
    styles: [{ children: puckCss }],
  }),
  component: PublicPreview,
});

type Loaded =
  | { kind: "puck"; data: Data; title: string }
  | { kind: "html"; doc: string };

function PublicPreview() {
  const { projectId, pageSlug } = Route.useParams();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: project } = await supabase
        .from("projects").select("name,is_published").eq("id", projectId).maybeSingle();
      if (!project) return setError("Preview not found.");
      if (!project.is_published) return setError("This project hasn't been published yet.");
      const { data: page } = await supabase
        .from("pages").select("html,css,name,puck_data").eq("project_id", projectId).eq("slug", pageSlug).maybeSingle();
      if (!page) return setError("Page not found.");

      const pd = (page as any).puck_data;
      if (hasPuckData(pd) && pd.content.length > 0) {
        document.title = `${page.name} — ${project.name}`;
        setLoaded({ kind: "puck", data: pd, title: `${page.name} — ${project.name}` });
        return;
      }
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.name} — ${project.name}</title><style>${page.css || ""}\nbody{margin:0;background:#fff;color:#000;font-family:system-ui,sans-serif;}</style></head><body>${page.html || ""}</body></html>`;
      setLoaded({ kind: "html", doc: html });
    })();
  }, [projectId, pageSlug]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl">404</h1>
          <p className="text-muted-foreground mt-2">{error}</p>
        </div>
      </div>
    );
  }
  if (!loaded) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;

  if (loaded.kind === "puck") {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a" }}>
        <Render config={puckConfig} data={loaded.data} />
      </div>
    );
  }

  return (
    <iframe
      title="Public preview" srcDoc={loaded.doc} sandbox="allow-scripts allow-forms allow-popups"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
