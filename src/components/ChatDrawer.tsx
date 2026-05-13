import { useEffect, useRef, useState } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; message: string; id?: string };

const QUICK_ACTIONS = [
  "Fix my fonts",
  "Improve spacing",
  "Make it mobile-friendly",
  "Check brand colors",
  "Add a call to action",
];

export function ChatDrawer({ open, onClose, projectId, figmaReference }: { open: boolean; onClose: () => void; projectId: string; figmaReference?: string | null }) {
  // figmaReference is stored for future agentic edits (Phase 3); currently unused in prompts.
  void figmaReference;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("chat_history")
        .select("id,role,message")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as Msg[]);
    })();
  }, [open, projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    const userMsg: Msg = { role: "user", message: text };
    setMessages(m => [...m, userMsg]);
    setInput("");

    // Persist user msg
    await supabase.from("chat_history").insert({ project_id: projectId, role: "user", message: text });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai-design-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.message })),
        }),
      });

      if (res.status === 429) throw new Error("Rate limit hit. Give it a moment and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted. Top up to keep chatting.");
      if (!res.ok) throw new Error(`AI error (${res.status})`);

      const data = await res.json();
      const reply = data.reply as string;
      setMessages(m => [...m, { role: "assistant", message: reply }]);
      await supabase.from("chat_history").insert({ project_id: projectId, role: "assistant", message: reply });
    } catch (err: any) {
      toast.error(err.message || "AI request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] z-50 transform transition-transform duration-300 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--accent)" }} />
            <div>
              <div className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">AI Assistant</div>
              <div className="text-sm">Design help</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Hey 👋 Ask me anything about your design. I'll keep your brand looking sharp.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] px-3 py-2 rounded text-sm whitespace-pre-wrap"
                style={
                  m.role === "user"
                    ? { background: "#fff", color: "#0a0a0a", borderRadius: "8px 8px 2px 8px" }
                    : { background: "#1e1e1e", color: "#fff", borderRadius: "8px 8px 8px 2px" }
                }
              >
                {m.message}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded text-sm" style={{ background: "#1e1e1e", color: "#888" }}>
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map(q => (
              <button
                key={q} onClick={() => send(q)} disabled={busy}
                className="text-[10px] font-display uppercase tracking-widest px-2 py-1 border transition-colors disabled:opacity-50"
                style={{ borderColor: "var(--border-strong)", color: "var(--muted-foreground)" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              >
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={e => { e.preventDefault(); send(input); }}
            className="flex gap-2 items-end"
          >
            <textarea
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={2}
              placeholder="Describe a change…"
              className="input-brand flex-1 resize-none !py-2 text-sm"
            />
            <button
              type="submit" disabled={busy || !input.trim()}
              className="btn-primary !py-2 !px-3"
            ><Send size={16} /></button>
          </form>
        </div>
      </aside>
    </>
  );
}
