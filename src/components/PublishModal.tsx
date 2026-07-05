import { useState } from "react";
import { X, Download, Code2, Link2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { puckConfig, hasPuckData } from "@/lib/puck-config";


export function PublishModal({
  open, onClose, projectId, onSave,
}: { open: boolean; onClose: () => void; projectId: string; onSave: () => Promise<void> }) {
  const [view, setView] = useState<"home" | "code" | "share">("home");
  const [code, setCode] = useState<{ html: string; css: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (!open) return null;

  async function loadCode() {
    await onSave();
    const { data } = await supabase
      .from("projects").select("html_content,css_content").eq("id", projectId).single();
    setCode({ html: data?.html_content || "", css: data?.css_content || "" });
    setView("code");
  }

  async function downloadZip() {
    await onSave();
    const { data } = await supabase
      .from("projects").select("html_content,css_content,name").eq("id", projectId).single();
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${data?.name}</title><link rel="stylesheet" href="style.css"></head><body>${data?.html_content || ""}</body></html>`;
    zip.file("index.html", html);
    zip.file("style.css", data?.css_content || "");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${data?.name || "site"}.zip`; a.click();
    URL.revokeObjectURL(url);
    toast.success("ZIP downloaded");
  }

  async function publishShare() {
    await onSave();
    const url = `${window.location.origin}/preview/${projectId}`;
    const { error } = await supabase
      .from("projects").update({ is_published: true, preview_url: url }).eq("id", projectId);
    if (error) return toast.error(error.message);
    setShareUrl(url);
    setView("share");
    toast.success("Published");
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="panel w-full max-w-3xl max-h-[90vh] overflow-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10">
          <X size={20} />
        </button>
        <div className="p-8">
          {view === "home" && (
            <>
              <div className="text-xs font-display uppercase tracking-widest text-muted-foreground">Step 5 of 5</div>
              <h2 className="text-3xl mt-1 mb-2">Ship it</h2>
              <p className="text-muted-foreground mb-8">Pick how you want to deliver this design.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card icon={<Download size={28} />} title="Download ZIP" body="Clean HTML + CSS, ready to host anywhere." onClick={downloadZip} />
                <Card icon={<Code2 size={28} />} title="Copy clean code" body="Hand-off code your developer will love." onClick={loadCode} />
                <Card icon={<Link2 size={28} />} title="Share preview link" body="Public URL. No login needed to view." onClick={publishShare} />
              </div>
            </>
          )}
          {view === "code" && code && (
            <>
              <button onClick={() => setView("home")} className="text-xs text-muted-foreground mb-4 hover:text-foreground">← Back</button>
              <h2 className="text-2xl mb-4">Clean code</h2>
              <div className="space-y-4">
                <CodeBlock label="HTML" content={code.html} onCopy={() => copy(code.html, "html")} copied={copied === "html"} />
                <CodeBlock label="CSS" content={code.css} onCopy={() => copy(code.css, "css")} copied={copied === "css"} />
              </div>
            </>
          )}
          {view === "share" && shareUrl && (
            <>
              <button onClick={() => setView("home")} className="text-xs text-muted-foreground mb-4 hover:text-foreground">← Back</button>
              <h2 className="text-2xl mb-2">It's live 🚀</h2>
              <p className="text-muted-foreground mb-6">Share this link with anyone — no account required.</p>
              <div className="flex gap-2">
                <input readOnly value={shareUrl} className="input-brand flex-1" />
                <button onClick={() => copy(shareUrl, "share")} className="btn-primary">
                  {copied === "share" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "share" ? "Copied" : "Copy"}
                </button>
              </div>
              <a href={shareUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-4 inline-flex">
                Open preview ↗
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ icon, title, body, onClick }: { icon: React.ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="panel p-6 text-left transition-colors hover:[border-color:var(--accent)]"
    >
      <div style={{ color: "var(--accent)" }}>{icon}</div>
      <h3 className="mt-4 text-lg">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </button>
  );
}

function CodeBlock({ label, content, onCopy, copied }: { label: string; content: string; onCopy: () => void; copied: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-display uppercase tracking-widest text-muted-foreground">{label}</span>
        <button onClick={onCopy} className="btn-ghost text-xs !py-1 !px-2">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="text-xs overflow-auto p-3 max-h-64 rounded" style={{ background: "#0a0a0a", border: "1px solid var(--border-strong)", color: "#c8f000" }}>
        <code>{content}</code>
      </pre>
    </div>
  );
}
