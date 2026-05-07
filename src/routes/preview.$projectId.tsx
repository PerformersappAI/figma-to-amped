import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/preview/$projectId")({ component: PublicPreview });

function PublicPreview() {
  const { projectId } = Route.useParams();
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("html_content,css_content,is_published,name")
        .eq("id", projectId).maybeSingle();
      if (error || !data) return setError("Preview not found.");
      if (!data.is_published) return setError("This project hasn't been published yet.");
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${data.name}</title><style>${data.css_content || ""}\nbody{margin:0;background:#fff;color:#000;font-family:system-ui,sans-serif;}</style></head><body>${data.html_content || ""}</body></html>`;
      setDoc(html);
    })();
  }, [projectId]);

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
