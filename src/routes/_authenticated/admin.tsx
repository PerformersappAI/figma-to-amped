import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield, Trash2, EyeOff, ExternalLink, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/use-admin";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });

type Project = {
  id: string; name: string; user_id: string;
  is_published: boolean; updated_at: string;
};
type Profile = { id: string; email: string | null; full_name: string | null; company: string | null; created_at: string };
type RoleRow = { user_id: string; role: string };

function AdminPage() {
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [pj, pf, rl] = await Promise.all([
      supabase.from("projects").select("id,name,user_id,is_published,updated_at").order("updated_at", { ascending: false }),
      supabase.from("profiles").select("id,email,full_name,company,created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    if (pj.error) toast.error(pj.error.message); else setProjects(pj.data as Project[]);
    if (pf.error) toast.error(pf.error.message); else setProfiles(pf.data as Profile[]);
    if (rl.error) toast.error(rl.error.message); else setRoles(rl.data as RoleRow[]);
    setLoading(false);
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast.error("Admin access required");
      nav({ to: "/dashboard" });
    }
  }, [roleLoading, isAdmin]);

  async function unpublish(id: string) {
    const { error } = await supabase.from("projects").update({ is_published: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Unpublished");
    load();
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project permanently?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Project deleted");
    load();
  }

  async function toggleAdmin(userId: string, currentlyAdmin: boolean) {
    if (currentlyAdmin) {
      if (!confirm("Revoke admin from this user?")) return;
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Admin revoked");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Admin granted");
    }
    load();
  }

  if (roleLoading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return null;

  const adminIds = new Set(roles.filter(r => r.role === "admin").map(r => r.user_id));
  const profileById = new Map(profiles.map(p => [p.id, p]));

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-display uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Shield size={14} style={{ color: "var(--accent)" }} /> Admin
          </div>
          <h1 className="text-4xl mt-1">Control panel</h1>
        </div>
      </div>

      <section>
        <h2 className="text-2xl mb-4">All users <span className="text-muted-foreground text-sm">({profiles.length})</span></h2>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => {
                const isUserAdmin = adminIds.has(p.id);
                return (
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">{p.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.company ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {isUserAdmin
                        ? <span className="text-xs uppercase tracking-widest" style={{ color: "var(--accent)" }}>● Admin</span>
                        : <span className="text-xs uppercase tracking-widest text-muted-foreground">User</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleAdmin(p.id, isUserAdmin)} className="btn-ghost !py-1 !px-3 text-xs">
                        {isUserAdmin ? "Revoke admin" : "Make admin"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl mb-4">All projects <span className="text-muted-foreground text-sm">({projects.length})</span></h2>
        {loading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const owner = profileById.get(p.user_id);
                  return (
                    <tr key={p.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{owner?.email ?? p.user_id.slice(0, 8)}</td>
                      <td className="px-4 py-3">
                        {p.is_published
                          ? <span className="text-xs uppercase tracking-widest" style={{ color: "var(--accent)" }}>● Live</span>
                          : <span className="text-xs uppercase tracking-widest text-muted-foreground">Draft</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link to="/projects/$id/puck-editor" params={{ id: p.id }} className="btn-ghost !py-1 !px-3 text-xs" title="Open editor">
                            <Pencil size={12} />
                          </Link>
                          {p.is_published && (
                            <>
                              <a href={`/preview/${p.id}`} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !px-3 text-xs" title="Open preview">
                                <ExternalLink size={12} />
                              </a>
                              <button onClick={() => unpublish(p.id)} className="btn-ghost !py-1 !px-3 text-xs" title="Unpublish">
                                <EyeOff size={12} />
                              </button>
                            </>
                          )}
                          <button onClick={() => deleteProject(p.id)} className="btn-ghost !py-1 !px-3 text-xs" title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
