import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { UploadCloud, Link2, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { importZip } from "@/lib/zip-import";

export const Route = createFileRoute("/_authenticated/upload")({ component: UploadPage });

function UploadPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return toast.error("Please drop a .zip file from Builder.io Visual Copilot.");
    }
    setBusy(true); setProgress(2); setLabel("Creating project…");
    try {
      const name = file.name.replace(/\.zip$/i, "");
      const { data: project, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, name })
        .select("id").single();
      if (error || !project) throw error || new Error("Project create failed");

      const { html, css, zipPath } = await importZip(
        file, user.id, project.id,
        (pct, l) => { setProgress(pct); setLabel(l); }
      );

      const { error: upErr } = await supabase
        .from("projects")
        .update({ html_content: html, css_content: css, original_zip_url: zipPath })
        .eq("id", project.id);
      if (upErr) throw upErr;

      toast.success("Imported");
      nav({ to: "/projects/$id/preview", params: { id: project.id } });
    } catch (err: any) {
      toast.error(err.message || "Import failed");
      setBusy(false); setProgress(0);
    }
  }, [user, nav]);

  async function importFromUrl() {
    if (!user) return;
    if (!figmaUrl.startsWith("http")) return toast.error("Paste a valid Figma URL");
    setBusy(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: "From Figma URL",
        original_zip_url: figmaUrl,
        html_content: `<div style="padding:60px;text-align:center;font-family:sans-serif"><h1>Imported from Figma</h1><p>Paste the ZIP export to get the live design. URL saved: ${figmaUrl}</p></div>`,
        css_content: "",
      })
      .select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    nav({ to: "/projects/$id/editor", params: { id: data!.id } });
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>
      <div className="text-xs font-display uppercase tracking-widest text-muted-foreground">Step 1 of 5</div>
      <h1 className="text-4xl mt-1 mb-2">Import your Figma export</h1>
      <p className="text-muted-foreground mb-8">
        Drop the ZIP from the Builder.io Visual Copilot Figma plugin.
      </p>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async e => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className="relative rounded-md transition-colors"
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--accent)"}`,
          background: dragOver ? "rgba(200,240,0,0.05)" : "var(--surface)",
          padding: "60px 24px",
        }}
      >
        <div className="text-center">
          <UploadCloud size={48} style={{ color: "var(--accent)", margin: "0 auto" }} />
          <h3 className="mt-4 text-2xl">Drop your ZIP here</h3>
          <p className="text-sm text-muted-foreground mt-2">or click below to browse</p>
          <label className="btn-primary mt-6 inline-flex cursor-pointer">
            Choose file
            <input
              type="file" accept=".zip" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              disabled={busy}
            />
          </label>
        </div>

        {busy && (
          <div className="mt-8">
            <div className="flex justify-between text-xs font-display uppercase tracking-widest mb-2">
              <span>{label}</span><span style={{ color: "var(--accent)" }}>{progress}%</span>
            </div>
            <div className="h-1.5 bg-[var(--surface-2)] overflow-hidden rounded">
              <div className="h-full transition-all" style={{ width: `${progress}%`, background: "var(--accent)" }} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 panel p-6">
        <div className="flex items-center gap-2 text-sm font-display uppercase tracking-widest mb-3">
          <Link2 size={16} style={{ color: "var(--accent)" }} /> Or paste a Figma share URL
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={figmaUrl} onChange={e => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/file/…"
            className="input-brand flex-1"
          />
          <button onClick={importFromUrl} disabled={busy} className="btn-ghost">Import</button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          (URL fallback creates a placeholder project — for full design fidelity, drop the ZIP.)
        </p>
      </div>
    </div>
  );
}
