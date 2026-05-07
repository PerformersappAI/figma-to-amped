import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Monitor, Tablet, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/projects/$id/preview")({ component: PreviewPage });

function PreviewPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [doc, setDoc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("name,html_content,css_content")
        .eq("id", id).single();
      if (error || !data) { toast.error("Project not found"); return; }
      setName(data.name);
      setDoc(buildDoc(data.html_content || "", data.css_content || ""));
    })();
  }, [id]);

  const widths = { desktop: 1280, tablet: 768, mobile: 390 };

  return (
    <div className="flex flex-col h-[calc(100vh-65px)]">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Preview</div>
            <div className="text-sm">{name}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 panel !py-1 !px-1">
          {([
            ["desktop", Monitor],
            ["tablet", Tablet],
            ["mobile", Smartphone],
          ] as const).map(([key, Icon]) => (
            <button
              key={key} onClick={() => setDevice(key)}
              className="p-2 rounded transition-colors"
              style={{
                background: device === key ? "var(--accent)" : "transparent",
                color: device === key ? "var(--accent-foreground)" : "var(--muted-foreground)",
              }}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => nav({ to: "/upload" })} className="btn-ghost text-xs !py-2 !px-3">Re-upload</button>
          <Link
            to="/projects/$id/editor" params={{ id }}
            className="btn-primary text-xs !py-2 !px-3"
          >
            Looks good — open editor →
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-background p-6 flex justify-center items-start">
        <div
          className="panel overflow-hidden transition-all duration-300"
          style={{ width: widths[device], maxWidth: "100%", minHeight: "80vh" }}
        >
          {doc ? (
            <iframe
              title="preview" srcDoc={doc} sandbox="allow-same-origin allow-scripts"
              className="w-full h-full border-0" style={{ minHeight: "80vh" }}
            />
          ) : (
            <div className="p-12 text-center text-muted-foreground">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildDoc(html: string, css: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{margin:0;background:#fff;color:#000;font-family:system-ui,sans-serif;}</style></head><body>${html}</body></html>`;
}
