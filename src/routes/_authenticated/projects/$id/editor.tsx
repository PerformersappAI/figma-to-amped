import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Rocket, Sparkles, Monitor, Smartphone, Undo2, Redo2,
  Layout, Type, Image as ImageIcon, MousePointerClick, Columns2, Columns3,
  Minus, Video, FormInput, MessageSquareQuote, Megaphone, FileText, Bot,
  HelpCircle, Search, Share2, UserPlus, Lightbulb, Star, BarChart3, Zap,
  Layers, Globe, Figma, X, FileText as PageIcon, Home, Plus, MoreVertical,
  ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import grapesjs, { Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { supabase } from "@/integrations/supabase/client";
import { ChatDrawer } from "@/components/ChatDrawer";
import { PublishModal } from "@/components/PublishModal";

export const Route = createFileRoute("/_authenticated/projects/$id/editor")({ component: EditorPage });

type BlockDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  ai?: boolean;
  content: string;
};

const LAYOUT_BLOCKS: BlockDef[] = [
  { id: "section", label: "Section", icon: Layout, content: `<section style="padding:60px 24px"><h2>Section</h2></section>` },
  { id: "hero", label: "Hero", icon: Megaphone, content: `<section style="padding:100px 24px;text-align:center;background:#0a0a0a;color:#fff"><h1 style="font-size:48px;margin:0">Big Hero Title</h1><p style="margin-top:12px;color:#888">Subtitle goes here.</p></section>` },
  { id: "text", label: "Text", icon: Type, content: `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>` },
  { id: "image", label: "Image", icon: ImageIcon, content: `<img src="https://via.placeholder.com/600x400" style="max-width:100%"/>` },
  { id: "button", label: "Button", icon: MousePointerClick, content: `<a href="#" style="display:inline-block;background:#c8f000;color:#0a0a0a;padding:12px 24px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;text-decoration:none">Click me</a>` },
  { id: "cols2", label: "2-Column", icon: Columns2, content: `<div style="display:flex;gap:24px"><div style="flex:1;padding:24px;background:#f4f4f4">Column 1</div><div style="flex:1;padding:24px;background:#f4f4f4">Column 2</div></div>` },
  { id: "cols3", label: "3-Column", icon: Columns3, content: `<div style="display:flex;gap:24px"><div style="flex:1;padding:24px;background:#f4f4f4">One</div><div style="flex:1;padding:24px;background:#f4f4f4">Two</div><div style="flex:1;padding:24px;background:#f4f4f4">Three</div></div>` },
  { id: "spacer", label: "Spacer", icon: Minus, content: `<div style="height:60px"></div>` },
  { id: "video", label: "Video", icon: Video, content: `<video controls style="max-width:100%"><source src=""/></video>` },
  { id: "form", label: "Form", icon: FormInput, content: `<form style="display:flex;flex-direction:column;gap:12px;max-width:400px"><input placeholder="Email" style="padding:12px;border:1px solid #ddd"/><button type="submit" style="padding:12px;background:#c8f000;border:0;font-weight:800;text-transform:uppercase">Submit</button></form>` },
  { id: "testimonial", label: "Testimonial", icon: MessageSquareQuote, content: `<blockquote style="padding:32px;border-left:4px solid #c8f000;background:#f8f8f8;font-style:italic">"This product changed our business."<footer style="margin-top:12px;font-style:normal;font-weight:700">— Happy Customer</footer></blockquote>` },
  { id: "cta", label: "CTA Banner", icon: Megaphone, content: `<section style="padding:60px 24px;background:#0a0a0a;color:#fff;text-align:center"><h2 style="font-size:36px;margin:0 0 12px">Ready to start?</h2><a href="#" style="display:inline-block;margin-top:16px;background:#c8f000;color:#0a0a0a;padding:14px 28px;font-weight:800;text-transform:uppercase;text-decoration:none">Get started</a></section>` },
];

const AI_BLOCKS: BlockDef[] = [
  { id: "ai-blog", label: "AI Blog Creator", icon: FileText, ai: true, content: `<div data-ai="blog" style="padding:32px;border:2px dashed #c8f000;text-align:center"><strong>AI Blog Creator</strong></div>` },
  { id: "ai-chatbot", label: "AI Chatbot", icon: Bot, ai: true, content: `<div data-ai="chatbot" style="padding:32px;border:2px dashed #c8f000;text-align:center"><strong>AI Chatbot</strong></div>` },
  { id: "ai-faq", label: "FAQ Block", icon: HelpCircle, ai: true, content: `<div data-ai="faq" style="padding:32px;border:2px dashed #c8f000"><strong>FAQ Block</strong></div>` },
  { id: "ai-paa", label: "People Also Ask", icon: Search, ai: true, content: `<div data-ai="paa" style="padding:32px;border:2px dashed #c8f000"><strong>People Also Ask</strong></div>` },
  { id: "ai-social", label: "Social Post Generator", icon: Share2, ai: true, content: `<div data-ai="social" style="padding:32px;border:2px dashed #c8f000"><strong>Social Post Generator</strong></div>` },
  { id: "ai-lead", label: "Lead Capture Bot", icon: UserPlus, ai: true, content: `<div data-ai="lead" style="padding:32px;border:2px dashed #c8f000"><strong>Lead Capture Bot</strong></div>` },
  { id: "ai-topic", label: "Topic Generator", icon: Lightbulb, ai: true, content: `<div data-ai="topic" style="padding:32px;border:2px dashed #c8f000"><strong>Topic Generator</strong></div>` },
  { id: "ai-review", label: "Review Request", icon: Star, ai: true, content: `<div data-ai="review" style="padding:32px;border:2px dashed #c8f000"><strong>Review Request</strong></div>` },
  { id: "ai-llm", label: "LLM Visibility", icon: BarChart3, ai: true, content: `<div data-ai="llm-visibility" style="padding:32px;border:2px dashed #c8f000"><strong>LLM Visibility Tracker</strong></div>` },
];

const BLANK_CANVAS = `<section style="min-height:80vh;display:flex;align-items:center;justify-content:center;background:#1a1a1a;margin:24px"><div style="border:2px dashed #c8f000;padding:80px 60px;text-align:center;max-width:640px;font-family:'Barlow Condensed',sans-serif"><div style="color:#c8f000;font-size:11px;letter-spacing:0.2em;margin-bottom:16px">FIGMASHIP</div><h1 style="color:#fff;font-size:36px;text-transform:uppercase;letter-spacing:0.05em;margin:0;font-weight:800;line-height:1.1">Your page starts here — drag a block from the left to begin</h1></div></section>`;

type LeftTab = "pages" | "blocks" | "layers" | "seo";
type SeoSubTab = "seo" | "aeo";

type PageRow = {
  id: string;
  name: string;
  slug: string;
  is_home: boolean;
  order_index: number;
  status: string;
  figma_design_reference_url: string | null;
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
}

function enableComponentDragging(editor: Editor | null) {
  if (!editor) return;
  try {
    const walk = (comp: any) => {
      comp.set({
        draggable: true,
        droppable: true,
        hoverable: true,
        selectable: true,
        removable: true,
        copyable: true,
        editable: true,
      });
      comp.components().each((c: any) => walk(c));
    };
    editor.getWrapper()?.components().each((c: any) => walk(c));
  } catch {
    /* ignore */
  }
}

function setEditorZoom(
  editor: Editor | null,
  setZoomFn: (z: number) => void,
  value: number,
) {
  if (!editor) return;
  const next = Math.max(25, Math.min(200, Math.round(value)));
  try {
    editor.Canvas.setZoom(next);
  } catch {
    /* ignore */
  }
  setZoomFn(next);
}

const CANVAS_PAGE_WIDTH = 1440;

// Clamp legacy/saved pages whose outermost element is wider than the page
// frame so they never overflow the editor container. Runs after setComponents.
function normalizeOversizedRoot(editor: Editor | null) {
  if (!editor) return;
  requestAnimationFrame(() => {
    try {
      const doc = editor.Canvas.getDocument();
      const body = doc?.body;
      if (!body) return;
      const candidates: HTMLElement[] = [];
      for (const el of Array.from(body.children)) {
        if (el instanceof HTMLElement) candidates.push(el);
      }
      // Also inspect first descendant when body wraps in <main>.
      if (candidates[0]?.tagName === "MAIN" && candidates[0].firstElementChild instanceof HTMLElement) {
        candidates.push(candidates[0].firstElementChild);
      }
      for (const el of candidates) {
        if (el.getBoundingClientRect().width > CANVAS_PAGE_WIDTH) {
          el.style.maxWidth = "100%";
          el.style.overflow = "hidden";
        }
      }
    } catch { /* ignore */ }
  });
}


function fitToWorkspace(
  editor: Editor | null,
  setZoomFn: (z: number) => void,
) {
  if (!editor) return;
  const run = () => {
    requestAnimationFrame(() => {
      try {
        const container = editor.getContainer();
        const canvasEl = container?.querySelector<HTMLElement>(".gjs-cv-canvas");
        if (!canvasEl) return;
        // Center the frame horizontally with dark gutters on both sides.
        canvasEl.style.display = "flex";
        canvasEl.style.justifyContent = "center";
        canvasEl.style.alignItems = "flex-start";

        const workspaceW = canvasEl.clientWidth;
        if (workspaceW <= 0) return;
        const frameEl = editor.Canvas.getFrameEl() as HTMLIFrameElement | null;
        const frameW = frameEl?.offsetWidth || CANVAS_PAGE_WIDTH;
        const z = Math.max(
          25,
          Math.min(150, Math.round((workspaceW * 0.95 / frameW) * 100)),
        );
        editor.Canvas.setZoom(z);
        setZoomFn(z);

        // Reset scroll to top-left so the page starts at the top.
        canvasEl.scrollTop = 0;
        canvasEl.scrollLeft = 0;
        try {
          editor.Canvas.getFrameEl()?.contentWindow?.scrollTo(0, 0);
        } catch { /* ignore */ }
      } catch {
        /* ignore */
      }
    });
  };
  try { editor.onReady(run); } catch { run(); }
}



function EditorPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const activePageIdRef = useRef<string | null>(null);

  const [name, setName] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [device, setDeviceState] = useState<"Desktop" | "Mobile">("Desktop");
  const [leftTab, setLeftTab] = useState<LeftTab>("pages");
  const [seoTab, setSeoTab] = useState<SeoSubTab>("seo");
  const [zoom, setZoom] = useState(100);
  const currentZoomRef = useRef(100);
  useEffect(() => { currentZoomRef.current = zoom; }, [zoom]);

  const [seo, setSeo] = useState<any>({
    title: "", description: "", ogTitle: "", ogDescription: "", canonical: "", robots: "index,follow",
    schemaType: "Organization", bizName: "", bizUrl: "", bizDescription: "", phone: "", address: "",
    socials: "", faqs: [{ q: "", a: "" }],
  });
  const [figmaRef, setFigmaRef] = useState<string | null>(null);
  const [figmaPanelOpen, setFigmaPanelOpen] = useState(false);

  const [pages, setPages] = useState<PageRow[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [newPageOpen, setNewPageOpen] = useState(false);

  // Load project + pages, init editor with the home page
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: proj }, { data: pageRows }] = await Promise.all([
        supabase.from("projects").select("name,seo").eq("id", id).single(),
        supabase.from("pages").select("id,name,slug,is_home,order_index,status,figma_design_reference_url,html,css,grapesjson").eq("project_id", id).order("order_index", { ascending: true }),
      ]);
      if (!mounted) return;
      if (proj) {
        setName(proj.name);
        if (proj.seo && typeof proj.seo === "object" && !Array.isArray(proj.seo)) {
          setSeo((s: any) => ({ ...s, ...(proj.seo as Record<string, any>) }));
        }
      }
      const rows = (pageRows || []) as any[];
      setPages(rows.map(r => ({
        id: r.id, name: r.name, slug: r.slug, is_home: r.is_home,
        order_index: r.order_index, status: r.status,
        figma_design_reference_url: r.figma_design_reference_url,
      })));

      const home = rows.find(r => r.is_home) || rows[0];
      if (!home || !ref.current) return;
      activePageIdRef.current = home.id;
      setActivePageId(home.id);
      if (home.figma_design_reference_url) {
        setFigmaRef(home.figma_design_reference_url);
        setFigmaPanelOpen(true);
      }

      const editor = grapesjs.init({
        container: ref.current,
        height: "100%",
        width: "100%",
        canvas: { scrollableCanvas: true },
        

        storageManager: false,
        fromElement: false,
        panels: { defaults: [] },
        components: home.html || BLANK_CANVAS,
        style: home.css || "",
        deviceManager: {
          devices: [
            { name: "Desktop", width: "1440px" },
            { name: "Mobile", width: "390px", widthMedia: "480px" },
          ],
        },
        blockManager: { appendTo: "#hidden-blocks", blocks: [] },
        layerManager: { appendTo: layersRef.current ?? undefined },
        styleManager: { appendTo: stylesRef.current ?? undefined },
      });
      if (home.grapesjson) {
        try { editor.loadProjectData(home.grapesjson as any); } catch { /* ignore */ }
      }
      // Center the converted page inside the canvas iframe with dark gutters.
      editor.on("load", () => {
        try {
          const doc = editor.Canvas.getDocument();
          if (!doc) return;
          if (doc.head.querySelector('style[data-figmaship-canvas="1"]')) return;
          const style = doc.createElement("style");
          style.setAttribute("data-figmaship-canvas", "1");
          style.textContent = `
            html, body { margin: 0; background: #fff; min-height: 100%; }
            body { width: 100%; overflow-x: hidden; }
            
            img, video { max-width: 100%; height: auto; }
          `;
          doc.head.appendChild(style);
        } catch { /* ignore */ }
        try {
          editorRef.current?.Canvas.getFrameEl()?.contentWindow?.scrollTo(0, 0);
          editorRef.current?.Canvas.getFrames().forEach((f: any) => f.view?.el?.scrollTo?.(0, 0));
        } catch { /* ignore */ }
      });
      editor.on("canvas:frame:load:body", () => {
        enableComponentDragging(editor);
        normalizeOversizedRoot(editor);
        fitToWorkspace(editor, setZoom);
      });

      editor.on("component:add", () => enableComponentDragging(editor));

      editor.on("canvas:zoom", () => {
        const z = Number(editor.Canvas.getZoom()) || 100;
        setZoom(Math.round(z));
      });
      editorRef.current = editor;
      fitToWorkspace(editor, setZoom);
    })();

    return () => {
      mounted = false;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      editorRef.current?.destroy();
    };
  }, [id]);

  async function saveActivePage(showToast = false) {
    const ed = editorRef.current; const pageId = activePageIdRef.current;
    if (!ed || !pageId) return;
    if (showToast) setSaving(true);
    const html = ed.getHtml();
    const css = ed.getCss();
    const json = ed.getProjectData();
    const { error } = await supabase
      .from("pages")
      .update({ html, css: css ?? "", grapesjson: json as any })
      .eq("id", pageId);
    // Persist project-level SEO
    await supabase.from("projects").update({ seo }).eq("id", id);
    if (showToast) {
      setSaving(false);
      if (error) toast.error(error.message); else toast.success("Saved");
    }
  }

  async function switchPage(pageId: string) {
    if (pageId === activePageIdRef.current) return;
    await saveActivePage(false);
    const { data, error } = await supabase
      .from("pages").select("html,css,grapesjson,figma_design_reference_url")
      .eq("id", pageId).single();
    if (error || !data) { toast.error("Couldn't load page"); return; }
    const ed = editorRef.current; if (!ed) return;
    ed.setComponents(data.html || BLANK_CANVAS);
    ed.setStyle(data.css || "");
    if (data.grapesjson) { try { ed.loadProjectData(data.grapesjson as any); } catch { /* ignore */ } }
    enableComponentDragging(ed);
    normalizeOversizedRoot(ed);
    requestAnimationFrame(() => fitToWorkspace(ed, setZoom));

    activePageIdRef.current = pageId;
    setActivePageId(pageId);
    setFigmaRef(data.figma_design_reference_url || null);
  }

  async function refreshPages() {
    const { data } = await supabase
      .from("pages").select("id,name,slug,is_home,order_index,status,figma_design_reference_url")
      .eq("project_id", id).order("order_index", { ascending: true });
    setPages((data || []) as PageRow[]);
  }

  // Actions
  async function setHome(pageId: string) {
    await supabase.from("pages").update({ is_home: false }).eq("project_id", id);
    await supabase.from("pages").update({ is_home: true }).eq("id", pageId);
    await refreshPages();
    toast.success("Home page updated");
  }

  async function renamePage(pageId: string, currentName: string) {
    const next = window.prompt("Rename page", currentName);
    if (!next || next === currentName) return;
    await supabase.from("pages").update({ name: next }).eq("id", pageId);
    await refreshPages();
  }

  async function deletePage(pageId: string) {
    if (pages.length <= 1) return toast.error("Can't delete the last page.");
    if (!window.confirm("Delete this page? This cannot be undone.")) return;
    await supabase.from("pages").delete().eq("id", pageId);
    if (activePageIdRef.current === pageId) {
      const remaining = pages.filter(p => p.id !== pageId);
      const next = remaining.find(p => p.is_home) || remaining[0];
      if (next) await switchPage(next.id);
    }
    await refreshPages();
  }

  async function duplicatePage(pageId: string) {
    const { data } = await supabase.from("pages").select("*").eq("id", pageId).single();
    if (!data) return;
    let base = slugify(`${data.name}-copy`);
    let candidate = base; let n = 2;
    const slugs = new Set(pages.map(p => p.slug));
    while (slugs.has(candidate)) candidate = `${base}-${n++}`;
    const order_index = (pages.reduce((m, p) => Math.max(m, p.order_index), -1)) + 1;
    await supabase.from("pages").insert({
      project_id: id, name: `${data.name} (copy)`, slug: candidate,
      html: data.html, css: data.css, grapesjson: data.grapesjson,
      figma_design_reference_url: data.figma_design_reference_url,
      figma_metadata: data.figma_metadata,
      order_index, is_home: false, status: "ready",
    });
    await refreshPages();
  }

  async function createBlankPage(name: string) {
    let base = slugify(name);
    let candidate = base; let n = 2;
    const slugs = new Set(pages.map(p => p.slug));
    while (slugs.has(candidate)) candidate = `${base}-${n++}`;
    const order_index = (pages.reduce((m, p) => Math.max(m, p.order_index), -1)) + 1;
    const { data, error } = await supabase.from("pages").insert({
      project_id: id, name, slug: candidate, html: BLANK_CANVAS, css: "",
      order_index, is_home: pages.length === 0, status: "ready",
    }).select("id").single();
    if (error || !data) return toast.error(error?.message || "Couldn't create page");
    await refreshPages();
    setNewPageOpen(false);
    await switchPage(data.id);
  }

  function addBlock(b: BlockDef) {
    const ed = editorRef.current; if (!ed) return;
    ed.addComponents(b.content);
    toast.success(`Added ${b.label}`);
  }

  function setDevice(d: "Desktop" | "Mobile") {
    setDeviceState(d);
    editorRef.current?.setDevice(d);
    fitToWorkspace(editorRef.current, setZoom);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] relative" style={{ background: "#0a0a0a" }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: "#0a0a0a", borderColor: "#1e1e1e" }}>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-white hover:text-[var(--accent)]"><ArrowLeft size={16} /></Link>
          <div>
            <div className="font-display uppercase tracking-widest" style={{ fontSize: 10, color: "#555" }}>Editor</div>
            <div className="font-display font-bold uppercase truncate max-w-[220px]" style={{ fontSize: 14, color: "#fff", letterSpacing: "0.05em" }}>{name || "untitled"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => editorRef.current?.UndoManager.undo()} className="p-2 text-white hover:text-[var(--accent)]" title="Undo"><Undo2 size={16} /></button>
          <button onClick={() => editorRef.current?.UndoManager.redo()} className="p-2 text-white hover:text-[var(--accent)]" title="Redo"><Redo2 size={16} /></button>
          <div className="w-px h-6 mx-2" style={{ background: "#2a2a2a" }} />
          <DeviceBtn active={device === "Desktop"} onClick={() => setDevice("Desktop")} icon={<Monitor size={14} />} label="Desktop" />
          <DeviceBtn active={device === "Mobile"} onClick={() => setDevice("Mobile")} icon={<Smartphone size={14} />} label="Mobile" />
          <div className="w-px h-6 mx-2" style={{ background: "#2a2a2a" }} />
          <button onClick={() => setEditorZoom(editorRef.current, setZoom, zoom - 10)} className="p-2 text-white hover:text-[var(--accent)]" title="Zoom out"><ZoomOut size={16} /></button>
          <input
            type="number"
            min={25}
            max={200}
            value={zoom}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setZoom(v);
            }}
            onBlur={(e) => setEditorZoom(editorRef.current, setZoom, Number(e.target.value) || 100)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditorZoom(editorRef.current, setZoom, Number((e.target as HTMLInputElement).value) || 100);
            }}
            className="w-14 bg-transparent border border-[#2a2a2a] rounded text-white text-center text-[11px] py-1 focus:outline-none focus:border-[var(--accent)]"
            title="Zoom %"
          />
          <span className="font-display text-[10px] text-[#888]">%</span>
          <button onClick={() => setEditorZoom(editorRef.current, setZoom, zoom + 10)} className="p-2 text-white hover:text-[var(--accent)]" title="Zoom in"><ZoomIn size={16} /></button>
          <button onClick={() => fitToWorkspace(editorRef.current, setZoom)} className="p-2 text-white hover:text-[var(--accent)]" title="Fit to screen"><Maximize2 size={16} /></button>
          {figmaRef && (
            <>
              <div className="w-px h-6 mx-2" style={{ background: "#2a2a2a" }} />
              <button onClick={() => setFigmaPanelOpen(o => !o)} title="Show original Figma design" className="p-2" style={{ color: figmaPanelOpen ? "#c8f000" : "#fff" }}>
                <Figma size={16} />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => saveActivePage(true)} disabled={saving}
            className="font-display uppercase tracking-widest flex items-center gap-2 px-3 py-2 text-xs border"
            style={{ background: "#111", borderColor: "#2a2a2a", color: "#fff" }}>
            <Save size={13} /> {saving ? "Saving…" : "Save Draft"}
          </button>
          <button onClick={() => setPublishOpen(true)}
            className="font-display uppercase tracking-widest flex items-center gap-2 px-3 py-2 text-xs"
            style={{ background: "#c8f000", color: "#0a0a0a", fontWeight: 800 }}>
            <Rocket size={13} /> Publish
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className="flex flex-col" style={{ width: 240, background: "#111", borderRight: "1px solid #1e1e1e" }}>
          <div className="flex" style={{ borderBottom: "1px solid #1e1e1e" }}>
            {([
              { k: "pages", label: "Pages", icon: PageIcon },
              { k: "blocks", label: "Blocks", icon: Layout },
              { k: "layers", label: "Layers", icon: Layers },
              { k: "seo", label: "SEO+AEO", icon: Globe },
            ] as const).map(t => {
              const active = leftTab === t.k;
              return (
                <button key={t.k} onClick={() => setLeftTab(t.k)}
                  className="flex-1 py-3 font-display uppercase tracking-widest text-[10px] flex items-center justify-center gap-1 transition-colors"
                  style={{ color: active ? "#c8f000" : "#555", borderBottom: `2px solid ${active ? "#c8f000" : "transparent"}`, background: active ? "#161616" : "transparent" }}>
                  <t.icon size={11} /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-auto">
            {leftTab === "pages" && (
              <PagesPanel
                pages={pages}
                activePageId={activePageId}
                onSwitch={switchPage}
                onSetHome={setHome}
                onRename={renamePage}
                onDelete={deletePage}
                onDuplicate={duplicatePage}
                onNew={() => setNewPageOpen(true)}
              />
            )}
            {leftTab === "blocks" && <BlocksPanel onAdd={addBlock} />}
            {leftTab === "layers" && (
              <div className="p-2">
                <div className="font-display uppercase tracking-widest text-[10px] px-2 py-2" style={{ color: "#555" }}>Layers</div>
                <div ref={layersRef} className="text-xs text-white" />
              </div>
            )}
            {leftTab === "seo" && <SeoPanel seo={seo} setSeo={setSeo} sub={seoTab} setSub={setSeoTab} />}
          </div>
        </aside>

        <div className="flex-1 min-w-0 relative" style={{ flex: 1, position: "relative", overflow: "hidden", minWidth: 0, background: "#0a0a0a" }}>
          <div ref={ref} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }} />
          <button
            onClick={() => setChatOpen(true)}
            className="absolute bottom-6 right-6 flex items-center justify-center shadow-xl z-30 transition-transform hover:scale-105"
            style={{ width: 52, height: 52, borderRadius: "50%", background: "#c8f000", color: "#fff" }}
            title="AI Design Assistant"
          >
            <Sparkles size={22} />
          </button>
          <div id="hidden-blocks" style={{ display: "none" }} />
        </div>

        {figmaRef && figmaPanelOpen && (
          <aside className="flex flex-col" style={{ width: "30vw", minWidth: 280, background: "#0d0d0d", borderLeft: "1px solid #1e1e1e" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #1e1e1e" }}>
              <div className="font-display uppercase tracking-widest text-[10px] flex items-center gap-2" style={{ color: "#c8f000" }}>
                <Figma size={11} /> Figma Reference
              </div>
              <button onClick={() => setFigmaPanelOpen(false)} className="text-[#555] hover:text-white"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <img src={figmaRef} alt="Original Figma design" style={{ width: "100%", height: "auto", display: "block" }} />
            </div>
          </aside>
        )}

        <aside className="flex flex-col" style={{ width: 280, background: "#111", borderLeft: "1px solid #1e1e1e" }}>
          <div className="px-4 py-3 font-display uppercase tracking-widest text-[10px]" style={{ color: "#555", borderBottom: "1px solid #1e1e1e" }}>
            Style Manager
          </div>
          <div className="flex-1 overflow-auto p-2">
            <div ref={stylesRef} />
            <div className="text-center px-4 py-12 font-display uppercase tracking-widest text-[10px]" style={{ color: "#444" }}>
              Select an element to edit its styles
            </div>
          </div>
        </aside>
      </div>

      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} projectId={id} figmaReference={figmaRef} />
      <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} projectId={id} onSave={() => saveActivePage(true)} />

      {newPageOpen && (
        <NewPageModal
          onClose={() => setNewPageOpen(false)}
          onCreateBlank={createBlankPage}
          onAddFromFigma={() => nav({ to: "/upload", search: {} })}
        />
      )}
    </div>
  );
}

function PagesPanel({
  pages, activePageId, onSwitch, onSetHome, onRename, onDelete, onDuplicate, onNew,
}: {
  pages: PageRow[];
  activePageId: string | null;
  onSwitch: (id: string) => void;
  onSetHome: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onNew: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  return (
    <div className="p-2 flex flex-col h-full">
      <div className="font-display uppercase tracking-widest text-[10px] px-2 py-2" style={{ color: "#555" }}>
        {pages.length} page{pages.length === 1 ? "" : "s"}
      </div>
      <div className="space-y-1 flex-1 overflow-auto">
        {pages.map(p => {
          const active = p.id === activePageId;
          return (
            <div key={p.id} className="relative">
              <button
                onClick={() => onSwitch(p.id)}
                className="w-full text-left flex items-center gap-2 p-2 rounded transition-colors"
                style={{
                  background: active ? "rgba(200,240,0,0.10)" : "transparent",
                  border: `1px solid ${active ? "#c8f000" : "transparent"}`,
                }}
              >
                <PageIcon size={12} style={{ color: active ? "#c8f000" : "#666", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate text-white">{p.name}</div>
                  <div className="text-[9px] text-[#555] truncate">/{p.slug}</div>
                </div>
                {p.is_home && (
                  <Home size={10} style={{ color: "#c8f000", flexShrink: 0 }} />
                )}
                {p.status === "building" && (
                  <span className="text-[9px] font-display uppercase" style={{ color: "#c8f000" }}>Building…</span>
                )}
                {p.status === "failed" && (
                  <span className="text-[9px] font-display uppercase" style={{ color: "#ff6b6b" }}>Failed</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id); }}
                  className="p-1 text-[#555] hover:text-white"
                >
                  <MoreVertical size={12} />
                </button>
              </button>
              {menuFor === p.id && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded shadow-xl"
                  style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", minWidth: 140 }}
                  onMouseLeave={() => setMenuFor(null)}>
                  {[
                    { label: "Rename", fn: () => { onRename(p.id, p.name); setMenuFor(null); } },
                    { label: "Set as home", fn: () => { onSetHome(p.id); setMenuFor(null); }, hide: p.is_home },
                    { label: "Duplicate", fn: () => { onDuplicate(p.id); setMenuFor(null); } },
                    { label: "Delete", fn: () => { onDelete(p.id); setMenuFor(null); }, danger: true },
                  ].filter(i => !i.hide).map(item => (
                    <button key={item.label} onClick={item.fn}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[#161616]"
                      style={{ color: item.danger ? "#ff6b6b" : "#fff" }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={onNew}
        className="mt-2 w-full py-2 font-display uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
        style={{ background: "#c8f000", color: "#0a0a0a", fontWeight: 800, borderRadius: 4 }}>
        <Plus size={12} /> New page
      </button>
    </div>
  );
}

function NewPageModal({
  onClose, onCreateBlank, onAddFromFigma,
}: {
  onClose: () => void;
  onCreateBlank: (name: string) => void;
  onAddFromFigma: () => void;
}) {
  const [tab, setTab] = useState<"figma" | "blank">("blank");
  const [name, setName] = useState("New page");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(10,10,10,0.85)" }}>
      <div className="w-full max-w-md mx-4 rounded p-6" style={{ background: "#111", border: "1px solid #2a2a2a" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-display uppercase">New page</h3>
          <button onClick={onClose} className="text-[#555] hover:text-white"><X size={16} /></button>
        </div>
        <div className="flex mb-4" style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4 }}>
          {(["blank", "figma"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-2 font-display uppercase tracking-widest text-[10px]"
              style={{ background: tab === t ? "#c8f000" : "transparent", color: tab === t ? "#0a0a0a" : "#555", fontWeight: tab === t ? 800 : 700 }}>
              {t === "blank" ? "Blank page" : "From Figma"}
            </button>
          ))}
        </div>
        {tab === "blank" ? (
          <>
            <label className="font-display uppercase tracking-widest text-[10px] text-[#888] block mb-1">Page name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full mb-4" autoFocus
              style={{ background: "#161616", border: "1px solid #2a2a2a", color: "#fff", padding: "8px 10px", fontSize: 12, borderRadius: 4, outline: "none" }} />
            <button onClick={() => name.trim() && onCreateBlank(name.trim())}
              className="w-full py-2 font-display uppercase tracking-widest text-[10px]"
              style={{ background: "#c8f000", color: "#0a0a0a", fontWeight: 800, borderRadius: 4 }}>
              Create blank page
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[#888] mb-4">
              Pick more pages from your Figma file. You'll go to the import screen — convert there, then they'll appear in this project.
            </p>
            <button onClick={onAddFromFigma}
              className="w-full py-2 font-display uppercase tracking-widest text-[10px]"
              style={{ background: "#c8f000", color: "#0a0a0a", fontWeight: 800, borderRadius: 4 }}>
              Open Figma importer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DeviceBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className="font-display uppercase tracking-widest flex items-center gap-1.5 px-2 py-1.5 text-[10px] border"
      style={{ borderColor: active ? "#c8f000" : "#2a2a2a", color: active ? "#c8f000" : "#555", background: "transparent" }}>
      {icon} {label}
    </button>
  );
}

function BlocksPanel({ onAdd }: { onAdd: (b: BlockDef) => void }) {
  return (
    <div className="p-2 space-y-4">
      <BlockGroup title="Layout & Content" blocks={LAYOUT_BLOCKS} onAdd={onAdd} />
      <BlockGroup title="AI Widgets" blocks={AI_BLOCKS} onAdd={onAdd} />
    </div>
  );
}

function BlockGroup({ title, blocks, onAdd }: { title: string; blocks: BlockDef[]; onAdd: (b: BlockDef) => void }) {
  return (
    <div>
      <div className="font-display uppercase tracking-widest text-[10px] px-1 py-2" style={{ color: "#555" }}>{title}</div>
      <div className="grid grid-cols-2 gap-2">
        {blocks.map(b => {
          const Icon = b.icon;
          return (
            <button key={b.id} onClick={() => onAdd(b)}
              className="relative flex flex-col items-center justify-center gap-2 p-3 text-center transition-colors"
              style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", minHeight: 72 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#c8f000")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
            >
              {b.ai && (
                <span className="absolute top-1 right-1 flex items-center justify-center" style={{ width: 14, height: 14, background: "#c8f000", borderRadius: 3 }}>
                  <Zap size={9} color="#0a0a0a" />
                </span>
              )}
              <Icon size={18} />
              <span className="font-display uppercase tracking-widest" style={{ fontSize: 9, lineHeight: 1.1 }}>{b.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = score < 40 ? "#ff3b30" : score < 70 ? "#ffb020" : "#c8f000";
  const pct = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="28" stroke="#2a2a2a" strokeWidth="6" fill="none" />
        <circle cx="36" cy="36" r="28" stroke={color} strokeWidth="6" fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 36 36)" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display font-bold" style={{ color, fontSize: 18 }}>{pct}</div>
    </div>
  );
}

function FieldLabel({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <div className="font-display uppercase tracking-widest text-[10px] mb-1 flex justify-between" style={{ color: warn ? "#ff3b30" : "#888" }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  background: "#161616", border: "1px solid #2a2a2a", color: "#fff",
  padding: "8px 10px", fontSize: 12, width: "100%", borderRadius: 4, outline: "none", fontFamily: "Barlow, sans-serif",
};

function SeoPanel({ seo, setSeo, sub, setSub }: { seo: any; setSeo: (fn: any) => void; sub: SeoSubTab; setSub: (s: SeoSubTab) => void }) {
  const update = (k: string, v: any) => setSeo((s: any) => ({ ...s, [k]: v }));
  const titleLen = (seo.title || "").length;
  const descLen = (seo.description || "").length;
  const seoScore = useMemo(() => {
    let s = 0;
    if (titleLen > 0 && titleLen <= 60) s += 25;
    if (descLen > 0 && descLen <= 160) s += 25;
    if (seo.ogTitle) s += 15;
    if (seo.ogDescription) s += 15;
    if (seo.canonical) s += 10;
    if (seo.robots) s += 10;
    return s;
  }, [seo, titleLen, descLen]);
  const aeoScore = useMemo(() => {
    let s = 0;
    if (seo.bizName) s += 20;
    if (seo.bizUrl) s += 15;
    if (seo.bizDescription) s += 15;
    if (seo.phone) s += 10;
    if (seo.address) s += 10;
    if (seo.socials) s += 10;
    if (seo.faqs?.some((f: any) => f.q && f.a)) s += 20;
    return s;
  }, [seo]);
  return (
    <div className="p-3">
      <div className="flex mb-3" style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4 }}>
        {(["seo", "aeo"] as const).map(t => (
          <button key={t} onClick={() => setSub(t)}
            className="flex-1 py-2 font-display uppercase tracking-widest text-[10px]"
            style={{ background: sub === t ? "#c8f000" : "transparent", color: sub === t ? "#0a0a0a" : "#555", fontWeight: sub === t ? 800 : 700 }}>
            {t === "seo" ? "SEO" : "AEO/Schema"}
          </button>
        ))}
      </div>
      <div className="flex justify-center mb-4"><ScoreGauge score={sub === "seo" ? seoScore : aeoScore} /></div>
      {sub === "seo" ? (
        <div className="space-y-3">
          <div>
            <FieldLabel warn={titleLen > 60}><span>Page Title</span><span>{titleLen}/60</span></FieldLabel>
            <input style={inputStyle} value={seo.title || ""} onChange={e => update("title", e.target.value)} />
          </div>
          <div>
            <FieldLabel warn={descLen > 160}><span>Meta Description</span><span>{descLen}/160</span></FieldLabel>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={seo.description || ""} onChange={e => update("description", e.target.value)} />
          </div>
          <div><FieldLabel>OG Title</FieldLabel><input style={inputStyle} value={seo.ogTitle || ""} onChange={e => update("ogTitle", e.target.value)} /></div>
          <div><FieldLabel>OG Description</FieldLabel><input style={inputStyle} value={seo.ogDescription || ""} onChange={e => update("ogDescription", e.target.value)} /></div>
          <div><FieldLabel>Canonical URL</FieldLabel><input style={inputStyle} value={seo.canonical || ""} onChange={e => update("canonical", e.target.value)} /></div>
          <div>
            <FieldLabel>Robots</FieldLabel>
            <select style={inputStyle} value={seo.robots} onChange={e => update("robots", e.target.value)}>
              <option value="index,follow">index, follow</option>
              <option value="noindex,follow">noindex, follow</option>
              <option value="index,nofollow">index, nofollow</option>
              <option value="noindex,nofollow">noindex, nofollow</option>
            </select>
          </div>
          <button className="w-full mt-2 py-2 font-display uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
            style={{ background: "#c8f000", color: "#0a0a0a", fontWeight: 800, borderRadius: 4 }}
            onClick={() => toast("AI fix coming soon")}>
            <Sparkles size={12} /> AI Fix SEO
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <FieldLabel>Schema Type</FieldLabel>
            <select style={inputStyle} value={seo.schemaType} onChange={e => update("schemaType", e.target.value)}>
              <option>Organization</option><option>LocalBusiness</option><option>FAQPage</option><option>Article</option>
            </select>
          </div>
          <div><FieldLabel>Business Name</FieldLabel><input style={inputStyle} value={seo.bizName || ""} onChange={e => update("bizName", e.target.value)} /></div>
          <div><FieldLabel>URL</FieldLabel><input style={inputStyle} value={seo.bizUrl || ""} onChange={e => update("bizUrl", e.target.value)} /></div>
          <div><FieldLabel>Description</FieldLabel><textarea style={{ ...inputStyle, minHeight: 50 }} value={seo.bizDescription || ""} onChange={e => update("bizDescription", e.target.value)} /></div>
          <div><FieldLabel>Phone</FieldLabel><input style={inputStyle} value={seo.phone || ""} onChange={e => update("phone", e.target.value)} /></div>
          <div><FieldLabel>Address</FieldLabel><input style={inputStyle} value={seo.address || ""} onChange={e => update("address", e.target.value)} /></div>
          <div><FieldLabel>Social Profile Links (one per line)</FieldLabel><textarea style={{ ...inputStyle, minHeight: 50 }} value={seo.socials || ""} onChange={e => update("socials", e.target.value)} /></div>
          <div>
            <FieldLabel>FAQ Pairs</FieldLabel>
            <div className="space-y-2">
              {(seo.faqs || []).map((f: any, i: number) => (
                <div key={i} className="space-y-1 p-2" style={{ border: "1px solid #2a2a2a", borderRadius: 4 }}>
                  <input style={inputStyle} placeholder="Question" value={f.q} onChange={e => {
                    const faqs = [...seo.faqs]; faqs[i] = { ...faqs[i], q: e.target.value }; update("faqs", faqs);
                  }} />
                  <textarea style={{ ...inputStyle, minHeight: 40 }} placeholder="Answer" value={f.a} onChange={e => {
                    const faqs = [...seo.faqs]; faqs[i] = { ...faqs[i], a: e.target.value }; update("faqs", faqs);
                  }} />
                </div>
              ))}
              <button onClick={() => update("faqs", [...(seo.faqs || []), { q: "", a: "" }])}
                className="w-full py-2 font-display uppercase tracking-widest text-[10px]"
                style={{ background: "#161616", border: "1px solid #2a2a2a", color: "#fff", borderRadius: 4 }}>
                + Add FAQ Pair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
