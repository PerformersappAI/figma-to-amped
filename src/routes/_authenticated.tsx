import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  if (loading || !user) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link to="/dashboard" className="font-display text-xl tracking-wider">
          FIGMA<span style={{ color: "var(--accent)" }}>SHIP</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
          <button
            onClick={async () => { await signOut(); nav({ to: "/login" }); }}
            className="btn-ghost text-xs !py-2 !px-3"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  );
}
