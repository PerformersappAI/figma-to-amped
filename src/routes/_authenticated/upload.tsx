import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { UploadCloud, ArrowLeft, Figma, LinkIcon, LogOut } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { importZip } from "@/lib/zip-import";

type FigmaConn = {
  figma_handle: string | null;
  figma_email: string | null;
  figma_img_url: string | null;
} | null;

export const Route = createFileRoute("/_authenticated/upload")({
  validateSearch: (s: Record<string, unknown>) => ({
    figma: typeof s.figma === "string" ? s.figma : undefined,
  }),
  component: UploadPage,
});

const STEPS = ["Import", "Build", "Edit", "Review", "Publish"] as const;

function deviceBadge(width: number) {
  if (width < 600) return { label: "MOBILE", color: "var(--accent)" };
  if (width < 1100) return { label: "TABLET", color: "#7ab8ff" };
  return { label: "DESKTOP", color: "#ffffff" };
}

// Stable hue from a string for gradient fallback
function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function ProgressBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((s, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className="flex-1">
              <div
                className="text-[10px] font-display uppercase tracking-widest mb-1"
                style={{ color: active ? "var(--accent)" : done ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {i + 1}. {s}
              </div>
              <div className="h-[3px] rounded" style={{ background: active || done ? "var(--accent)" : "var(--surface-2)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UploadPage() {
  const { user, session } = useAuth();
  const nav = useNavigate();
  const search = useSearch({ from: "/_authenticated/upload" });

  const [dragOver, setDragOver] = useState(false);
  const [showZip, setShowZip] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const [figmaConn, setFigmaConn] = useState<FigmaConn>(null);
  const [figmaLoading, setFigmaLoading] = useState(true);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaImporting, setFigmaImporting] = useState(false);
  const [figmaError, setFigmaError] = useState<string | null>(null);
  type FigmaFrame = { name: string; nodeId: string; width: number; height: number; thumbnail?: string | null };
  type FigmaPage = { name: string; nodeId: string; frames: FigmaFrame[] };
  const [figmaResult, setFigmaResult] = useState<{ fileKey?: string; name?: string; pages: FigmaPage[] } | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<{ pageId: string; nodeId: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertStatus, setConvertStatus] = useState("");

  // Load existing Figma connection
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("figma_connections")
        .select("figma_handle, figma_email, figma_img_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setFigmaConn(data ?? null);
        setFigmaLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Toast based on ?figma=...
  useEffect(() => {
    if (!search.figma) return;
    if (search.figma === "connected") toast.success("Figma connected");
    else if (search.figma.startsWith("error:")) toast.error(`Figma: ${search.figma.slice(6).replace(/_/g, " ")}`);
    nav({ to: "/upload", replace: true, search: {} });
  }, [search.figma, nav]);

  async function connectFigma() {
    if (!session) return;
    try {
      const r = await fetch("/auth/figma/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to start");
      window.location.href = data.authUrl;
    } catch (e: any) {
      toast.error(e.message || "Couldn't start Figma OAuth");
    }
  }

  async function disconnectFigma() {
    if (!session) return;
    const r = await fetch("/api/figma/disconnect", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (r.ok) {
      setFigmaConn(null);
      setFigmaResult(null);
      toast.success("Figma disconnected");
    } else {
      toast.error("Disconnect failed");
    }
  }

  async function importFromFigma() {
    if (!session) return;
    setFigmaError(null);
    setFigmaResult(null);
    setSelectedFrame(null);
    setFigmaImporting(true);
    try {
      const r = await fetch("/api/figma/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: figmaUrl }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Import failed");
      setFigmaResult({ fileKey: data.fileKey, name: data.name, pages: data.pages || [] });
      const totalFrames = (data.pages || []).reduce((s: number, p: any) => s + (p.frames?.length || 0), 0);
      toast.success(`Loaded ${totalFrames} page${totalFrames === 1 ? "" : "s"} from "${data.name}"`);
    } catch (e: any) {
      setFigmaError(e.message || "Import failed");
    } finally {
      setFigmaImporting(false);
    }
  }

  async function convertFrame() {
    if (!session || !user || !selectedFrame || !figmaResult?.fileKey) return;
    setConverting(true);
    const messages = [
      "Reading your design…",
      "Pulling images…",
      "Generating code…",
      "Cleaning up with AI…",
    ];
    let i = 0;
    setConvertStatus(messages[0]);
    const ticker = setInterval(() => {
      i = (i + 1) % messages.length;
      setConvertStatus(messages[i]);
    }, 2200);
    try {
      const r = await fetch("/api/figma/convert", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ fileKey: figmaResult.fileKey, nodeId: selectedFrame.nodeId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Conversion failed");

      // Create project
      const frame = figmaResult.pages
        .flatMap(p => p.frames)
        .find(f => f.nodeId === selectedFrame.nodeId);
      const projectName = `${figmaResult.name || "Figma"} — ${frame?.name || "Page"}`;
      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: projectName,
          html_content: data.html,
          css_content: data.css,
          figma_design_reference: data.designReference || null,
          figma_metadata: data.metadata || null,
        })
        .select("id")
        .single();
      if (error || !project) throw error || new Error("Failed to save project");

      toast.success("Converted! Opening editor…");
      nav({ to: "/projects/$id/editor", params: { id: project.id } });
    } catch (e: any) {
      toast.error(e.message || "Conversion failed");
      setConverting(false);
      setConvertStatus("");
    } finally {
      clearInterval(ticker);
    }
  }

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return toast.error("Please drop a .zip file containing your site export.");
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>
      <ProgressBar current={0} />
      <h1 className="text-4xl mt-1 mb-2">Import your design</h1>
      <p className="text-muted-foreground mb-8">
        Connect Figma and paste a file URL, or drop a site export ZIP.
      </p>

      {/* Figma section */}
      <div className="panel p-6 mb-6" style={{ borderColor: "var(--accent)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Figma size={18} style={{ color: "var(--accent)" }} />
          <h2 className="text-xl font-display uppercase tracking-widest">Import from Figma</h2>
        </div>

        {figmaLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !figmaConn ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your Figma account to import any file you have access to.
            </p>
            <button onClick={connectFigma} className="btn-primary inline-flex items-center gap-2">
              <Figma size={16} /> Connect Figma
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                {figmaConn.figma_img_url && (
                  <img src={figmaConn.figma_img_url} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div>
                  <div className="text-sm">Connected as <span style={{ color: "var(--accent)" }}>{figmaConn.figma_handle || figmaConn.figma_email || "Figma user"}</span></div>
                  {figmaConn.figma_email && <div className="text-xs text-muted-foreground">{figmaConn.figma_email}</div>}
                </div>
              </div>
              <button onClick={disconnectFigma} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <LogOut size={12} /> Disconnect
              </button>
            </div>

            <label className="text-xs font-display uppercase tracking-widest text-muted-foreground flex items-center gap-1 mb-2">
              <LinkIcon size={12} /> Paste your Figma file URL
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={figmaUrl}
                onChange={e => setFigmaUrl(e.target.value)}
                placeholder="https://figma.com/design/…"
                className="input-brand flex-1"
                disabled={figmaImporting}
              />
              <button
                onClick={importFromFigma}
                disabled={figmaImporting || !figmaUrl}
                className="btn-primary"
              >
                {figmaImporting ? "Importing…" : "Import"}
              </button>
            </div>

            {figmaError && (
              <div className="mt-3 text-sm" style={{ color: "#ff6b6b" }}>{figmaError}</div>
            )}

            {figmaImporting && !figmaResult && (
              <div className="mt-4 rounded p-3 space-y-2" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <div className="skeleton-shimmer" style={{ width: 14, height: 14, borderRadius: "50%" }} />
                    <div className="skeleton-shimmer shrink-0" style={{ width: 80, height: 60 }} />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton-shimmer" style={{ height: 14, width: "60%" }} />
                      <div className="skeleton-shimmer" style={{ height: 10, width: "30%" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {figmaResult && (() => {
              const allPages = figmaResult.pages;
              const allFrames = allPages.flatMap(p => p.frames.map(f => ({ ...f, pageId: p.nodeId, pageName: p.name })));
              const totalFrames = allFrames.length;
              // Hide generic "Page N" group headers; only show meaningful ones
              const showGroupHeaders = allPages.length > 1 && allPages.some(p => !/^page\s*\d+$/i.test(p.name.trim()));
              const selectedCount = selectedFrame ? 1 : 0;

              if (totalFrames === 0) {
                return (
                  <div className="mt-4 rounded p-8 text-center" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                    <div className="text-sm mb-2">No pages found in this file.</div>
                    <div className="text-xs text-muted-foreground mb-3">Make sure your design is inside a Frame, not floating on the canvas.</div>
                    <a href="https://help.figma.com/hc/en-us/articles/360041064173-Frames-in-Figma" target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--accent)" }}>
                      Learn how →
                    </a>
                  </div>
                );
              }

              const renderFrame = (f: typeof allFrames[number]) => {
                const selected = selectedFrame?.nodeId === f.nodeId;
                const badge = deviceBadge(f.width);
                const hue = hashHue(f.name);
                return (
                  <button
                    key={f.nodeId}
                    onClick={() => setSelectedFrame({ pageId: f.pageId, nodeId: f.nodeId })}
                    aria-label={`Select page ${f.name}`}
                    title={`${f.width} × ${f.height}`}
                    className="w-full text-left flex items-center gap-3 p-3 rounded transition-all"
                    style={{
                      background: selected ? "rgba(200,240,0,0.10)" : "transparent",
                      border: `1px solid ${selected ? "var(--accent)" : "transparent"}`,
                      boxShadow: selected ? "0 0 0 3px rgba(200,240,0,0.15)" : "none",
                    }}
                  >
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${selected ? "var(--accent)" : "#444"}` }}
                    >
                      {selected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
                    </div>
                    <div
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        width: 80,
                        height: 60,
                        background: f.thumbnail ? "#1a1a1a" : `linear-gradient(135deg, hsl(${hue} 40% 18%), hsl(${(hue + 40) % 360} 50% 28%))`,
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      {f.thumbnail ? (
                        <img src={f.thumbnail} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      ) : (
                        <span className="text-[10px] font-display uppercase tracking-widest text-center px-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {f.name.length > 18 ? f.name.slice(0, 16) + "…" : f.name}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div className="text-base truncate font-display">{f.name}</div>
                      <span
                        className="text-[10px] font-display uppercase tracking-widest px-2 py-0.5 rounded shrink-0"
                        style={{ background: "rgba(255,255,255,0.06)", color: badge.color, border: `1px solid ${badge.color}` }}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </button>
                );
              };

              return (
                <div className="mt-4 rounded" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                  <div className="px-4 pt-4 pb-2 text-xs font-display uppercase tracking-widest text-muted-foreground">
                    {figmaResult.name} — Pick which page you want to publish
                  </div>
                  <div className="max-h-[480px] overflow-auto px-2 pb-2">
                    {showGroupHeaders ? (
                      allPages.map(p => (
                        <div key={p.nodeId} className="mb-2">
                          {!/^page\s*\d+$/i.test(p.name.trim()) && (
                            <div className="px-2 py-1 text-[10px] font-display uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                              {p.name}
                            </div>
                          )}
                          {p.frames.map(f => renderFrame({ ...f, pageId: p.nodeId, pageName: p.name }))}
                        </div>
                      ))
                    ) : (
                      <div className="space-y-1">
                        {allFrames.map(renderFrame)}
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                    <div className="text-xs text-muted-foreground">
                      {selectedCount === 0
                        ? "Pick a page to continue"
                        : `${selectedCount} page${selectedCount === 1 ? "" : "s"} selected`}
                    </div>
                    <button
                      onClick={convertFrame}
                      disabled={!selectedFrame || converting}
                      className="btn-primary"
                    >
                      {converting ? "Building…" : "Build this page →"}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ZIP fallback */}
      <div className="text-xs font-display uppercase tracking-widest text-muted-foreground mb-3">
        Or upload a site export ZIP
      </div>
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
          border: `2px dashed var(--accent)`,
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

      {converting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(10,10,10,0.92)" }}>
          <div className="text-center px-6">
            <div className="inline-block w-12 h-12 mb-6 rounded-full animate-spin" style={{ borderWidth: 3, borderStyle: "solid", borderColor: "var(--accent) transparent var(--accent) transparent" }} />
            <div className="font-display uppercase tracking-widest text-2xl" style={{ color: "var(--accent)" }}>
              {convertStatus || "Working…"}
            </div>
            <div className="text-sm text-muted-foreground mt-3">This usually takes 10–30 seconds.</div>
          </div>
        </div>
      )}
    </div>
  );
}
