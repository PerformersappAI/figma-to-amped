import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { UploadCloud, ArrowLeft, Figma, LinkIcon, LogOut, Check, X as XIcon, Loader2 } from "lucide-react";
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

type DeviceFilter = "all" | "mobile" | "tablet" | "desktop";

function deviceBadge(width: number) {
  if (width < 600) return { label: "MOBILE", color: "var(--accent)", kind: "mobile" as const };
  if (width < 1100) return { label: "TABLET", color: "#7ab8ff", kind: "tablet" as const };
  return { label: "DESKTOP", color: "#ffffff", kind: "desktop" as const };
}

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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<DeviceFilter>("all");

  // Batch build state
  type PageRow = {
    id: string;
    name: string;
    status: string;
    figma_node_id: string;
    thumbnail?: string | null;
    error_message?: string | null;
    last_completed_step?: string | null;
    layoutMethod?: "ai" | "fallback-rules" | null;
    layoutReason?: string | null;
  };
  const [batch, setBatch] = useState<{ projectId: string; rows: PageRow[]; thumbs: Record<string, string | null> } | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("figma_connections")
        .select("figma_handle, figma_email, figma_img_url")
        .eq("user_id", user.id).maybeSingle();
      if (!cancelled) { setFigmaConn(data ?? null); setFigmaLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!search.figma) return;
    if (search.figma === "connected") toast.success("Figma connected");
    else if (search.figma.startsWith("error:")) toast.error(`Figma: ${search.figma.slice(6).replace(/_/g, " ")}`);
    nav({ to: "/upload", replace: true, search: {} });
  }, [search.figma, nav]);

  // Realtime subscribe to pages of the in-progress batch
  useEffect(() => {
    if (!batch?.projectId) return;
    const channel = supabase
      .channel(`pages-${batch.projectId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "pages", filter: `project_id=eq.${batch.projectId}` },
        (payload) => {
          setBatch(prev => {
            if (!prev) return prev;
            const next = (payload.new || payload.old) as any;
            if (!next?.id) return prev;
            const idx = prev.rows.findIndex(r => r.id === next.id);
            const updated = {
              id: next.id,
              name: next.name,
              status: next.status,
              figma_node_id: next.figma_node_id,
              error_message: next.error_message,
              last_completed_step: next.figma_metadata?.last_completed_step ?? null,
              layoutMethod: next.figma_metadata?.puckConversion?.method ?? null,
              layoutReason: next.figma_metadata?.puckConversion?.reason ?? null,
            };
            const rows = idx >= 0
              ? prev.rows.map((r, i) => i === idx ? { ...r, ...updated } : r)
              : [...prev.rows, updated];
            return { ...prev, rows };
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [batch?.projectId]);

  async function connectFigma() {
    if (!session) return;
    try {
      const r = await fetch("/auth/figma/start", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to start");
      window.location.href = data.authUrl;
    } catch (e: any) { toast.error(e.message || "Couldn't start Figma OAuth"); }
  }

  async function disconnectFigma() {
    if (!session) return;
    const r = await fetch("/api/figma/disconnect", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    if (r.ok) { setFigmaConn(null); setFigmaResult(null); toast.success("Figma disconnected"); }
    else toast.error("Disconnect failed");
  }

  async function importFromFigma() {
    if (!session) return;
    setFigmaError(null); setFigmaResult(null); setSelectedIds(new Set()); setFigmaImporting(true);
    try {
      const r = await fetch("/api/figma/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ url: figmaUrl }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Import failed");
      setFigmaResult({ fileKey: data.fileKey, name: data.name, pages: data.pages || [] });
      const totalFrames = (data.pages || []).reduce((s: number, p: any) => s + (p.frames?.length || 0), 0);
      toast.success(`Loaded ${totalFrames} page${totalFrames === 1 ? "" : "s"} from "${data.name}"`);
    } catch (e: any) { setFigmaError(e.message || "Import failed"); }
    finally { setFigmaImporting(false); }
  }

  const allFrames = useMemo(() => {
    if (!figmaResult) return [];
    return figmaResult.pages.flatMap(p => p.frames.map(f => ({ ...f, pageId: p.nodeId, pageName: p.name })));
  }, [figmaResult]);

  const filteredFrames = useMemo(() => {
    if (filter === "all") return allFrames;
    return allFrames.filter(f => deviceBadge(f.width).kind === filter);
  }, [allFrames, filter]);

  function toggleFrame(nodeId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  }

  function toggleAllFiltered() {
    const ids = filteredFrames.map(f => f.nodeId);
    const allSel = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSel) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }

  function slugify(s: string): string {
    return (s || "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page";
  }

  async function postStep(path: string, payload: Record<string, unknown>) {
    if (!session) throw new Error("You need to sign in again.");
    let response: Response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (netErr: any) {
      throw new Error(`Network error (worker may have timed out): ${netErr?.message || "Failed to fetch"}`);
    }

    const raw = await response.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
    if (!response.ok) {
      const phase = data?.phase ? `[${data.phase}] ` : "";
      throw new Error(`${phase}${data?.error || raw?.slice(0, 200) || `HTTP ${response.status}`}`);
    }
    return data;
  }

  function stepIndexFromRow(row?: { status?: string; last_completed_step?: string | null }) {
    const last = row?.last_completed_step;
    if (row?.status === "ready" || last === "ready") return 4;
    if (row?.status === "rendered" || last === "rendered") return 3;
    if (row?.status === "assets-ready" || last === "assets-ready") return 2;
    if (row?.status === "fetched" || last === "fetched") return 1;
    return 0;
  }

  function updateBatchRow(pageId: string, patch: Partial<PageRow>) {
    setBatch(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map(row => row.id === pageId ? { ...row, ...patch } : row),
      };
    });
  }

  async function runPagePipeline(pageId: string, nodeId: string, projectId: string, startStep = 0) {
    if (!figmaResult?.fileKey) throw new Error("Missing Figma file key");
    if (startStep < 1) {
      updateBatchRow(pageId, { status: "fetching", error_message: null });
      await postStep("/api/figma/fetch-node", { fileKey: figmaResult.fileKey, pageId, nodeId, projectId });
      updateBatchRow(pageId, { status: "fetched", last_completed_step: "fetched" });
    }
    if (startStep < 2) {
      updateBatchRow(pageId, { status: "processing-assets", error_message: null });
      await postStep("/api/figma/process-assets", { fileKey: figmaResult.fileKey, pageId, nodeId, projectId });
      updateBatchRow(pageId, { status: "assets-ready", last_completed_step: "assets-ready" });
    }
    if (startStep < 3) {
      updateBatchRow(pageId, { status: "rendering", error_message: null });
      await postStep("/api/figma/render", { pageId, projectId });
      updateBatchRow(pageId, { status: "rendered", last_completed_step: "rendered" });
    }
    if (startStep < 4) {
      updateBatchRow(pageId, { status: "cleaning", error_message: null });
      await postStep("/api/figma/cleanup", { pageId, projectId, fileKey: figmaResult.fileKey });
      updateBatchRow(pageId, { status: "ready", last_completed_step: "ready" });
    }
  }

  async function buildBatchV2() {
    if (!session || !user || !figmaResult?.fileKey || selectedIds.size === 0) return;
    setStarting(true);
    try {
      const selectedFrames = allFrames.filter(f => selectedIds.has(f.nodeId));
      const thumbs: Record<string, string | null> = {};
      selectedFrames.forEach(f => { thumbs[f.nodeId] = f.thumbnail ?? null; });

      // 1. Pre-create the project
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: figmaResult.name || "Figma project",
          figma_metadata: { fileKey: figmaResult.fileKey, sourceFrames: selectedFrames.length },
        })
        .select("id").single();
      if (projErr || !project) throw projErr || new Error("Couldn't create project");

      // 2. Pre-insert ALL page rows up front so the total is known immediately
      //    and Realtime + UI have something concrete to render.
      const usedSlugs = new Set<string>();
      const pageInserts = selectedFrames.map((f, i) => {
        let base = slugify(f.name || `page-${i + 1}`);
        let candidate = base;
        let n = 2;
        while (usedSlugs.has(candidate)) candidate = `${base}-${n++}`;
        usedSlugs.add(candidate);
        return {
          project_id: project.id,
          name: f.name,
          slug: candidate,
          figma_node_id: f.nodeId,
          order_index: i,
          is_home: i === 0,
          status: "pending",
        };
      });
      const { data: insertedPages, error: pagesErr } = await supabase
        .from("pages").insert(pageInserts).select("id, name, status, figma_node_id");
      if (pagesErr || !insertedPages) throw pagesErr || new Error("Couldn't create pages");

      const initialRows: PageRow[] = insertedPages.map(p => ({
        id: p.id, name: p.name, status: p.status,
        figma_node_id: p.figma_node_id as string, error_message: null, last_completed_step: null,
      }));
      setBatch({ projectId: project.id, rows: initialRows, thumbs });

      const queue = [...insertedPages];
      const CONCURRENCY = 2;
      const runOne = async (page: { id: string; figma_node_id: string | null }) => {
        const nodeId = page.figma_node_id!;
        try {
          await runPagePipeline(page.id, nodeId, project.id, 0);
        } catch (e: any) {
          console.error("convert page failed", nodeId, e);
          updateBatchRow(page.id, { status: "failed", error_message: e?.message || "Conversion failed" });
        }
      };
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const next = queue.shift();
          if (next) await runOne(next);
        }
      });
      Promise.all(workers)
        .catch(e => console.error("batch workers", e))
        .finally(() => setStarting(false));
    } catch (e: any) {
      toast.error(e.message || "Couldn't start build");
      setStarting(false);
    }
  }



  async function retryPage(pageId: string, nodeId: string) {
    if (!batch || !session || !figmaResult?.fileKey) return;
    updateBatchRow(pageId, { status: "pending", error_message: null });
    try {
      const row = batch.rows.find(r => r.id === pageId);
      await runPagePipeline(pageId, nodeId, batch.projectId, stepIndexFromRow(row));
    } catch (e: any) {
      updateBatchRow(pageId, { status: "failed", error_message: e?.message || "Retry failed" });
      toast.error(e?.message || "Retry failed");
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
        .from("projects").insert({ user_id: user.id, name }).select("id").single();
      if (error || !project) throw error || new Error("Project create failed");
      const { html, css, zipPath } = await importZip(file, user.id, project.id, (pct, l) => { setProgress(pct); setLabel(l); });
      const { error: upErr } = await supabase
        .from("projects").update({ html_content: html, css_content: css, original_zip_url: zipPath }).eq("id", project.id);
      if (upErr) throw upErr;
      // Also create a home page row for compatibility with new model
      await supabase.from("pages").insert({
        project_id: project.id, name: "Home", slug: "home",
        html, css, order_index: 0, is_home: true, status: "ready",
      });
      toast.success("Imported");
      nav({ to: "/projects/$id/preview", params: { id: project.id } });
    } catch (err: any) {
      toast.error(err.message || "Import failed");
      setBusy(false); setProgress(0);
    }
  }, [user, nav]);

  const totalFrames = allFrames.length;
  const selectedCount = selectedIds.size;
  const ctaLabel = selectedCount === 0
    ? "Pick at least one page"
    : selectedCount === 1 ? "Build 1 page →" : `Build ${selectedCount} pages →`;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>
      <ProgressBar current={0} />
      <h1 className="text-4xl mt-1 mb-2">Import your design</h1>
      <p className="text-muted-foreground mb-8">
        Connect Figma and paste a file URL — pick the pages you want, we'll build them all.
      </p>

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
                {figmaConn.figma_img_url && <img src={figmaConn.figma_img_url} alt="" className="w-8 h-8 rounded-full" />}
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
              <button onClick={importFromFigma} disabled={figmaImporting || !figmaUrl} className="btn-primary">
                {figmaImporting ? "Importing…" : "Import"}
              </button>
            </div>

            {figmaError && <div className="mt-3 text-sm" style={{ color: "#ff6b6b" }}>{figmaError}</div>}

            {figmaImporting && !figmaResult && (
              <div className="mt-4 rounded p-3 space-y-2" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <div className="skeleton-shimmer" style={{ width: 14, height: 14, borderRadius: 3 }} />
                    <div className="skeleton-shimmer shrink-0" style={{ width: 80, height: 60 }} />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton-shimmer" style={{ height: 14, width: "60%" }} />
                      <div className="skeleton-shimmer" style={{ height: 10, width: "30%" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {figmaResult && totalFrames === 0 && (
              <div className="mt-4 rounded p-8 text-center" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                <div className="text-sm mb-2">No pages found in this file.</div>
                <div className="text-xs text-muted-foreground mb-3">Make sure your design is inside a Frame, not floating on the canvas.</div>
                <a href="https://help.figma.com/hc/en-us/articles/360041064173-Frames-in-Figma" target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--accent)" }}>
                  Learn how →
                </a>
              </div>
            )}

            {figmaResult && totalFrames > 0 && (
              <div className="mt-4 rounded" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                <div className="px-4 pt-4 pb-3 flex items-center justify-between flex-wrap gap-3">
                  <div className="text-xs font-display uppercase tracking-widest text-muted-foreground">
                    {figmaResult.name} — Pick the pages you want to build
                  </div>
                  <div className="flex items-center gap-1">
                    {(["all", "mobile", "tablet", "desktop"] as const).map(k => (
                      <button
                        key={k}
                        onClick={() => setFilter(k)}
                        className="text-[10px] font-display uppercase tracking-widest px-2 py-1 rounded"
                        style={{
                          background: filter === k ? "var(--accent)" : "transparent",
                          color: filter === k ? "#0a0a0a" : "var(--muted-foreground)",
                          border: `1px solid ${filter === k ? "var(--accent)" : "var(--border)"}`,
                        }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-4 pb-2">
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filteredFrames.length > 0 && filteredFrames.every(f => selectedIds.has(f.nodeId))}
                      onChange={toggleAllFiltered}
                    />
                    <span className="text-muted-foreground">Select all {filter !== "all" ? filter : ""} ({filteredFrames.length})</span>
                  </label>
                </div>

                <div className="max-h-[480px] overflow-auto px-2 pb-2 space-y-1">
                  {filteredFrames.map(f => {
                    const selected = selectedIds.has(f.nodeId);
                    const badge = deviceBadge(f.width);
                    const hue = hashHue(f.name);
                    return (
                      <label
                        key={f.nodeId}
                        className="w-full flex items-center gap-3 p-3 rounded transition-all cursor-pointer"
                        style={{
                          background: selected ? "rgba(200,240,0,0.10)" : "transparent",
                          border: `1px solid ${selected ? "var(--accent)" : "transparent"}`,
                          boxShadow: selected ? "0 0 0 3px rgba(200,240,0,0.15)" : "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleFrame(f.nodeId)}
                          className="shrink-0"
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <div
                          className="shrink-0 flex items-center justify-center"
                          style={{
                            width: 80, height: 60,
                            background: f.thumbnail ? "#1a1a1a" : `linear-gradient(135deg, hsl(${hue} 40% 18%), hsl(${(hue + 40) % 360} 50% 28%))`,
                            borderRadius: 4, overflow: "hidden",
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
                      </label>
                    );
                  })}
                </div>

                <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="text-xs text-muted-foreground">
                    {selectedCount === 0 ? "Pick at least one page" : `${selectedCount} page${selectedCount === 1 ? "" : "s"} selected`}
                  </div>
                  <button
                    onClick={buildBatchV2}
                    disabled={selectedCount === 0 || starting}
                    className="btn-primary"
                  >
                    {starting && !batch ? "Starting…" : ctaLabel}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Advanced: ZIP fallback */}
      <div className="mt-12 text-center">
        <button type="button" onClick={() => setShowZip(s => !s)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
          {showZip ? "Hide advanced import options" : "Other ways to import"}
        </button>
      </div>

      {showZip && (
        <div className="mt-6">
          <div className="text-xs font-display uppercase tracking-widest text-muted-foreground mb-3">Upload a site export ZIP</div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async e => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className="relative rounded-md transition-colors"
            style={{ border: `2px dashed var(--accent)`, background: dragOver ? "rgba(200,240,0,0.05)" : "var(--surface)", padding: "60px 24px" }}
          >
            <div className="text-center">
              <UploadCloud size={48} style={{ color: "var(--accent)", margin: "0 auto" }} />
              <h3 className="mt-4 text-2xl">Drop your ZIP here</h3>
              <p className="text-sm text-muted-foreground mt-2">or click below to browse</p>
              <label className="btn-primary mt-6 inline-flex cursor-pointer">
                Choose file
                <input type="file" accept=".zip" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={busy} />
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
        </div>
      )}

      {batch && (
        <BatchOverlay
          batch={batch}
          onRetry={retryPage}
          onOpen={() => nav({ to: "/projects/$id/puck-editor", params: { id: batch.projectId } })}
        />
      )}
    </div>
  );
}

function BatchOverlay({
  batch,
  onRetry,
  onOpen,
}: {
  batch: { projectId: string; rows: { id: string; name: string; status: string; figma_node_id: string; error_message?: string | null; layoutMethod?: "ai" | "fallback-rules" | null; layoutReason?: string | null }[]; thumbs: Record<string, string | null> };
  onRetry: (pageId: string, nodeId: string) => void;
  onOpen: () => void;
}) {
  const total = batch.rows.length;
  const completed = batch.rows.filter(r => r.status === "ready" || r.status === "failed").length;
  const allDone = total > 0 && completed === total;
  const anyReady = batch.rows.some(r => r.status === "ready");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(10,10,10,0.95)" }}>
      <div className="w-full max-w-2xl mx-4 rounded p-6" style={{ background: "#111", border: "1px solid #2a2a2a" }}>
        <div className="font-display uppercase tracking-widest text-xs mb-1" style={{ color: "var(--accent)" }}>
          Building your site
        </div>
        <h2 className="text-2xl font-display uppercase mb-4">{completed} of {total || "…"} pages built</h2>

        <div className="h-2 rounded overflow-hidden mb-4" style={{ background: "#0a0a0a" }}>
          <div className="h-full transition-all" style={{ width: `${total ? (completed / total) * 100 : 0}%`, background: "var(--accent)" }} />
        </div>

        <div className="max-h-[50vh] overflow-auto space-y-2 mb-4">
          {batch.rows.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">Setting things up…</div>
          ) : batch.rows.map(r => {
            const thumb = batch.thumbs[r.figma_node_id];
            return (
              <div key={r.id} className="flex items-center gap-3 p-2 rounded" style={{ background: "#0a0a0a" }}>
                <StatusIcon status={r.status} />
                <div className="shrink-0" style={{ width: 56, height: 42, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                  {thumb && <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{r.name}</div>
                  {r.status === "failed" && r.error_message && (
                    <div className="text-[11px]" style={{ color: "#ff6b6b" }}>{r.error_message}</div>
                  )}
                </div>
                {r.status === "failed" && (
                  <button onClick={() => onRetry(r.id, r.figma_node_id)} className="text-[10px] font-display uppercase tracking-widest px-2 py-1 rounded" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>
                    Retry
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button onClick={onOpen} disabled={!anyReady} className="btn-primary">
            {allDone ? "Open in editor →" : anyReady ? "Open editor while we finish →" : "Working…"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ready") return <Check size={16} style={{ color: "var(--accent)" }} />;
  if (status === "failed") return <XIcon size={16} style={{ color: "#ff6b6b" }} />;
  if (status === "building") return <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)" }} />;
  return <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#444" }} />;
}
