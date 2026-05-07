import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

function Onboarding() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && !user) {
    nav({ to: "/login" });
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ company }).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("All set");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="panel w-full max-w-md p-8">
        <div className="text-xs font-display uppercase tracking-widest mb-2" style={{ color: "var(--accent)" }}>
          One quick thing
        </div>
        <h1 className="text-3xl mb-6">What's your company name?</h1>
        <form onSubmit={save} className="space-y-4">
          <input
            value={company} onChange={e => setCompany(e.target.value)}
            placeholder="Amped Marketing" className="input-brand" required
          />
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Saving…" : "Continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}
