import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, ExternalLink, Trash2, Pencil, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/use-admin";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

type Project = {
  id: string; name: string; thumbnail_url: string | null;
  updated_at: string; is_published: boolean;
};

function Dashboard() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,thumbnail_url,updated_at,is_published")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setProjects(data as Project[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  async function del(id: string) {
    if (!confirm("Delete this project? This can't be undone.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Project deleted");
    load();
  }

  async function copyShare(p: Project) {
    if (!p.is_published) return toast.error("Publish the project first to share it.");
    const url = `${window.location.origin}/preview/${p.id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="text-xs font-display uppercase tracking-widest text-muted-foreground">Workspace</div>
          <h1 className="text-4xl mt-1">Your projects</h1>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link to="/admin" className="btn-ghost">
              <Shield size={16} /> Admin
            </Link>
          )}
          <button onClick={() => nav({ to: "/upload" })} className="btn-primary">
            <Plus size={18} /> New project
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="panel p-12 text-center">
          <h2 className="text-2xl mb-2">No projects yet</h2>
          <p className="text-muted-foreground mb-6">Drop in a Figma export to get started.</p>
          <button onClick={() => nav({ to: "/upload" })} className="btn-primary">
            <Plus size={18} /> New project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id} className="panel overflow-hidden group hover:[border-color:var(--accent)] transition-colors">
              <div className="aspect-video bg-[var(--surface-2)] flex items-center justify-center overflow-hidden">
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="font-display text-3xl text-muted-foreground/30">FS</div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg truncate">{p.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Updated {new Date(p.updated_at).toLocaleDateString()}
                      {p.is_published && <span className="ml-2 text-[10px] uppercase tracking-widest" style={{ color: "var(--accent)" }}>● Live</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Link
                    to="/projects/$id/editor" params={{ id: p.id }}
                    className="btn-primary flex-1 !py-2 !px-3 text-xs"
                  >
                    <Pencil size={14} /> Edit
                  </Link>
                  <button onClick={() => copyShare(p)} className="btn-ghost !py-2 !px-3 text-xs" title="Share">
                    <ExternalLink size={14} />
                  </button>
                  <button onClick={() => del(p.id)} className="btn-ghost !py-2 !px-3 text-xs" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
