import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created");
          nav({ to: "/onboarding" });
        } else {
          toast.success("Check your email to confirm your account.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        nav({ to: "/dashboard" });
      }
    } catch (err: any) {
      toast.error(err.message || "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-5 border-b border-border">
        <Link to="/" className="font-display text-xl tracking-wider">
          FIGMA<span style={{ color: "var(--accent)" }}>SHIP</span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="panel w-full max-w-md p-8">
          <h1 className="text-3xl mb-2">{mode === "signin" ? "Sign in" : "Create account"}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin" ? "Welcome back to Amped — FigmaShip." : "Start shipping designs in minutes."}
          </p>
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email" required placeholder="you@company.com"
              value={email} onChange={e => setEmail(e.target.value)}
              className="input-brand"
            />
            <input
              type="password" required minLength={6} placeholder="Password (min 6 chars)"
              value={password} onChange={e => setPassword(e.target.value)}
              className="input-brand"
            />
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          >
            {mode === "signin" ? "Don't have an account? Sign up →" : "Already have an account? Sign in →"}
          </button>
        </div>
      </main>
    </div>
  );
}
