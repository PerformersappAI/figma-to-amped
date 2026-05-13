import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/preview/$projectId/$pageSlug")({ component: PublicPreview });

function PublicPreview() {
  const { projectId, pageSlug } = Route.useParams();
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: project } = await supabase
        .from("projects").select("name,is_published").eq("id", projectId).maybeSingle();
      if (!project) return setError("Preview not found.");
      if (!project.is_published) return setError("This project hasn't been published yet.");
      const { data: page } = await supabase
        .from("pages").select("html,css,name").eq("project_id", projectId).eq("slug", pageSlug).maybeSingle();
      if (!page) return setError("Page not found.");
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.name} — ${project.name}</title><style>${page.css || ""}\nbody{margin:0;background:#fff;color:#000;font-family:system-ui,sans-serif;}</style></head><body>${page.html || ""}</body></html>`;
      setDoc(html);
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
  if (!doc) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
  return (
    <iframe
      title="Public preview" srcDoc={doc} sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
