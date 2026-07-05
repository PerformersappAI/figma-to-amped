import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Rocket } from "lucide-react";
import { Puck, type Data } from "@measured/puck";
import puckCssRaw from "@measured/puck/puck.css?raw";
import { supabase } from "@/integrations/supabase/client";
import { puckConfig, EMPTY_PUCK_DATA, ACCENT } from "@/lib/puck-config";
import { PuckChatPanel } from "@/components/PuckChatPanel";

// Strip the remote @import that lightningcss can't resolve during build.
const puckCss = (puckCssRaw as string).replace(/@import\s+["']https?:\/\/[^"']+["'];?/g, "");

export const Route = createFileRoute("/_authenticated/projects/$id/puck-editor")({
  head: () => ({
    links: [
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
    ],
    styles: [{ children: puckCss }],
  }),
  component: PuckEditorPage,
});

const EMPTY_DATA: Data = EMPTY_PUCK_DATA;



// ---------------- Page component ----------------

function PuckEditorPage() {
  const { id } = Route.useParams();
  
  const [projectName, setProjectName] = useState<string>("");
  const [pageId, setPageId] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<Data | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: proj } = await supabase.from("projects").select("name").eq("id", id).maybeSingle();
      if (!cancelled && proj) setProjectName(proj.name || "Untitled");

      const { data: pages } = await supabase
        .from("pages")
        .select("id, puck_data, is_home, order_index")
        .eq("project_id", id)
        .order("is_home", { ascending: false })
        .order("order_index", { ascending: true })
        .limit(1);

      if (cancelled) return;

      const target = pages?.[0];
      if (target) {
        setPageId(target.id);
        const pd = (target as any).puck_data;
        const loaded = pd && typeof pd === "object" && Array.isArray(pd.content) ? (pd as Data) : EMPTY_DATA;
        _latestData.current = loaded;
        setInitialData(loaded);
      } else {
        // No pages yet — create one so Puck has somewhere to save
        const { data: created } = await supabase
          .from("pages")
          .insert({
            project_id: id,
            name: "Home",
            slug: "home",
            is_home: true,
            order_index: 0,
            status: "ready",
          })
          .select("id")
          .single();
        if (created) setPageId(created.id);
        _latestData.current = EMPTY_DATA;
        setInitialData(EMPTY_DATA);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveDraft(data: Data) {
    if (!pageId) return toast.error("No page to save to");
    setSaving(true);
    const { error } = await supabase
      .from("pages")
      .update({ puck_data: data as any })
      .eq("id", pageId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Draft saved");
  }

  async function publish(data: Data) {
    await saveDraft(data);
    const { error } = await supabase.from("projects").update({ is_published: true }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Published");
  }

  if (!initialData) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-65px)]" style={{ background: "#0a0a0a", color: "#888" }}>
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)]" style={{ background: "#0a0a0a" }}>
      <Puck
        config={puckConfig}
        data={initialData}
        onChange={(d) => { _latestData.current = d; }}
        onPublish={publish}
        headerTitle={projectName || "Untitled"}
        overrides={{
          header: ({ actions }: any) => (
            <div
              className="flex items-center justify-between px-4 py-2 border-b"
              style={{ background: "#0a0a0a", borderColor: "#1e1e1e" }}
            >
              <div className="flex items-center gap-3">
                <Link to="/dashboard" className="text-white hover:text-[var(--accent)]">
                  <ArrowLeft size={16} />
                </Link>
                <div>
                  <div
                    className="font-display uppercase tracking-widest"
                    style={{ fontSize: 10, color: "#555" }}
                  >
                    Puck Editor
                  </div>
                  <div
                    className="font-display font-bold uppercase truncate max-w-[260px]"
                    style={{ fontSize: 14, color: "#fff", letterSpacing: "0.05em" }}
                  >
                    {projectName || "untitled"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PuckSaveButtons saving={saving} onSave={saveDraft} onPublish={publish} />
                {actions}
              </div>
            </div>
          ),
        }}
      />
    </div>
  );
}

function PuckSaveButtons({
  saving,
  onSave,
  onPublish,
}: {
  saving: boolean;
  onSave: (d: Data) => void;
  onPublish: (d: Data) => void;
}) {
  // Puck's dispatch context isn't easily reachable outside — read current data
  // via the appState it stores in a nearby element. Use Puck's onPublish hook
  // for the Publish button (routed through the built-in Publish action) by
  // proxying through the `actions` slot. For Save Draft, use the exposed
  // window helper Puck sets via onChange when available; otherwise fall back
  // to reading document state.
  //
  // Simplest reliable approach: rely on Puck's own change tracking via a ref
  // through onChange. We use a small module-scope cache.
  return (
    <>
      <button
        onClick={() => onSave(_latestData.current || EMPTY_DATA)}
        disabled={saving}
        className="flex items-center gap-1 px-3 py-1.5 border rounded font-display uppercase tracking-widest text-[11px]"
        style={{
          background: "transparent",
          borderColor: "#2a2a2a",
          color: "#fff",
          fontWeight: 800,
        }}
      >
        <Save size={13} />
        {saving ? "Saving…" : "Save Draft"}
      </button>
      <button
        onClick={() => onPublish(_latestData.current || EMPTY_DATA)}
        className="flex items-center gap-1 px-3 py-1.5 rounded font-display uppercase tracking-widest text-[11px]"
        style={{ background: ACCENT, color: "#0a0a0a", fontWeight: 800 }}
      >
        <Rocket size={13} />
        Publish
      </button>
    </>
  );
}

// Module-scope ref to bridge Puck's onChange -> header save buttons
const _latestData: { current: Data | null } = { current: null };

// Patch: wire Puck's onChange to _latestData via a wrapper component
// Because Puck accepts onChange, we route it through the main component above.
// Redefining PuckEditorPage's Puck usage below via monkey patching is avoided;
// instead we set onChange inline. See the actual usage: we add onChange={...}.
