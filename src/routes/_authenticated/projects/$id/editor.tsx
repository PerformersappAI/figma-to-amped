import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Rocket, Sparkles, Monitor, Smartphone, Undo2, Redo2 } from "lucide-react";
import grapesjs, { Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import { supabase } from "@/integrations/supabase/client";
import { ChatDrawer } from "@/components/ChatDrawer";
import { PublishModal } from "@/components/PublishModal";

export const Route = createFileRoute("/_authenticated/projects/$id/editor")({ component: EditorPage });

function EditorPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [name, setName] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("name,html_content,css_content,grapesjson")
        .eq("id", id).single();
      if (!mounted || !data || !ref.current) return;
      setName(data.name);

      const editor = grapesjs.init({
        container: ref.current,
        height: "100%",
        width: "auto",
        storageManager: false,
        fromElement: false,
        components: data.html_content || "<section style='padding:80px;text-align:center'><h1>Start editing</h1></section>",
        style: data.css_content || "",
        deviceManager: {
          devices: [
            { name: "Desktop", width: "" },
            { name: "Mobile", width: "390px", widthMedia: "480px" },
          ],
        },
        blockManager: {
          blocks: [
            { id: "section", label: "Section", category: "Layout", content: `<section style="padding:60px 24px"><h2>Section</h2></section>` },
            { id: "hero", label: "Hero", category: "Layout", content: `<section style="padding:100px 24px;text-align:center;background:#0a0a0a;color:#fff"><h1 style="font-size:48px;margin:0">Big Hero Title</h1><p style="margin-top:12px;color:#888">Subtitle goes here.</p></section>` },
            { id: "text", label: "Text", category: "Basic", content: `<p>Lorem ipsum dolor sit amet.</p>` },
            { id: "image", label: "Image", category: "Basic", content: { type: "image" } },
            { id: "button", label: "Button", category: "Basic", content: `<a href="#" style="display:inline-block;background:#c8f000;color:#0a0a0a;padding:12px 24px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;text-decoration:none">Click me</a>` },
            { id: "columns", label: "Columns", category: "Layout", content: `<div style="display:flex;gap:24px"><div style="flex:1;padding:24px;background:#f4f4f4">Column 1</div><div style="flex:1;padding:24px;background:#f4f4f4">Column 2</div></div>` },
            { id: "spacer", label: "Spacer", category: "Layout", content: `<div style="height:60px"></div>` },
            { id: "video", label: "Video", category: "Basic", content: { type: "video" } },
            { id: "form", label: "Form", category: "Basic", content: `<form style="display:flex;flex-direction:column;gap:12px;max-width:400px"><input placeholder="Email" style="padding:12px;border:1px solid #ddd"/><button type="submit" style="padding:12px;background:#c8f000;border:0;font-weight:800;text-transform:uppercase">Submit</button></form>` },
          ],
        },
      });

      if (data.grapesjson) {
        try { editor.loadProjectData(data.grapesjson as any); } catch { /* fall back to html/css already loaded */ }
      }

      editorRef.current = editor;
    })();
    return () => { mounted = false; editorRef.current?.destroy(); };
  }, [id]);

  async function save() {
    const ed = editorRef.current; if (!ed) return;
    setSaving(true);
    const html = ed.getHtml();
    const css = ed.getCss();
    const json = ed.getProjectData();
    const { error } = await supabase
      .from("projects")
      .update({ html_content: html, css_content: css ?? "", grapesjson: json as any })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Draft saved");
  }

  function setDevice(d: "Desktop" | "Mobile") {
    editorRef.current?.setDevice(d);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] relative">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Editor</div>
            <div className="text-sm truncate max-w-[200px]">{name}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => editorRef.current?.UndoManager.undo()} className="btn-ghost text-xs !py-2 !px-2" title="Undo"><Undo2 size={14} /></button>
          <button onClick={() => editorRef.current?.UndoManager.redo()} className="btn-ghost text-xs !py-2 !px-2" title="Redo"><Redo2 size={14} /></button>
          <div className="w-px h-6 bg-border mx-1" />
          <button onClick={() => setDevice("Desktop")} className="btn-ghost text-xs !py-2 !px-2" title="Desktop"><Monitor size={14} /></button>
          <button onClick={() => setDevice("Mobile")} className="btn-ghost text-xs !py-2 !px-2" title="Mobile"><Smartphone size={14} /></button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="btn-ghost text-xs !py-2 !px-3">
            <Save size={14} /> {saving ? "Saving…" : "Save draft"}
          </button>
          <button onClick={() => setPublishOpen(true)} className="btn-primary text-xs !py-2 !px-3">
            <Rocket size={14} /> Publish
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <div ref={ref} style={{ height: "100%" }} />
      </div>

      {/* Floating chat button */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-40 transition-transform hover:scale-105"
        style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
        title="Ask the AI assistant"
      >
        <Sparkles size={24} />
      </button>

      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} projectId={id} />
      <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} projectId={id} onSave={save} />
    </div>
  );
}
