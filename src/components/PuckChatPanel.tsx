import { useEffect, useRef, useState } from "react";
import type { Data } from "@measured/puck";
import { Sparkles, Send, PanelLeftClose, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ACCENT } from "@/lib/puck-config";

type Msg = {
  role: "user" | "assistant";
  text: string;
  snapshot?: Data; // for AI messages, the data before this change (to undo)
  applied?: boolean;
};

const ALLOWED = new Set(["Section", "Heading", "Paragraph", "Image", "Button", "Navbar", "Hero", "CardGrid", "Footer"]);

function extractJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();
  // Strip markdown fences
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // If there's still surrounding prose, try to grab the outermost {...}
  if (!s.startsWith("{")) {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function validatePuckData(x: any): x is Data {
  if (!x || typeof x !== "object") return false;
  if (!Array.isArray(x.content)) return false;
  for (const c of x.content) {
    if (!c || typeof c !== "object") return false;
    if (typeof c.type !== "string" || !ALLOWED.has(c.type)) return false;
    if (c.props && typeof c.props !== "object") return false;
  }
  if (!x.root || typeof x.root !== "object") x.root = { props: {} };
  return true;
}

export function PuckChatPanel({
  open,
  onToggle,
  getCurrentData,
  applyData,
}: {
  open: boolean;
  onToggle: () => void;
  getCurrentData: () => Data;
  applyData: (d: Data) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function send(text: string) {
    const instruction = text.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: instruction }]);

    const snapshot = getCurrentData();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/ai-puck-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ puckData: snapshot, instruction }),
      });

      if (res.status === 429) throw new Error("Rate limit — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      if (!res.ok) throw new Error(`AI error (${res.status})`);
      const data = (await res.json()) as { raw?: string };
      const parsed = extractJson(data.raw || "");
      if (!validatePuckData(parsed)) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "I couldn't apply that change, try rephrasing." },
        ]);
        return;
      }
      applyData(parsed);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Done. Preview updated — click Save Draft to keep it.",
          snapshot,
          applied: true,
        },
      ]);
    } catch (err: any) {
      toast.error(err.message || "AI request failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "I couldn't apply that change, try rephrasing." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function undo(index: number) {
    const msg = messages[index];
    if (!msg?.snapshot) return;
    applyData(msg.snapshot);
    setMessages((m) =>
      m.map((x, i) => (i === index ? { ...x, applied: false, text: x.text + " (undone)" } : x)),
    );
    toast.success("Reverted");
  }

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded font-display uppercase tracking-widest text-[11px]"
        style={{ background: ACCENT, color: "#0a0a0a", fontWeight: 800 }}
        title="Open AI chat"
      >
        <Sparkles size={13} /> AI Chat
      </button>
    );
  }

  return (
    <aside
      className="flex flex-col h-full border-r"
      style={{ width: 340, background: "#0f0f0f", borderColor: "#1e1e1e" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: "#1e1e1e" }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: ACCENT }} />
          <div>
            <div
              className="font-display uppercase tracking-widest"
              style={{ fontSize: 9, color: "#555" }}
            >
              AI Assistant
            </div>
            <div style={{ fontSize: 12, color: "#fff" }}>Edit with prompts</div>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:text-white"
          title="Collapse"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div style={{ color: "#666", fontSize: 12, padding: "24px 8px", textAlign: "center" }}>
            Try: <em>"change the hero title to Dive Into Adventure"</em>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              style={{
                maxWidth: "88%",
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 13,
                whiteSpace: "pre-wrap",
                background: m.role === "user" ? "#fff" : "#1e1e1e",
                color: m.role === "user" ? "#0a0a0a" : "#fff",
              }}
            >
              {m.text}
              {m.role === "assistant" && m.applied && m.snapshot && (
                <button
                  onClick={() => undo(i)}
                  className="mt-2 flex items-center gap-1 px-2 py-1 border rounded"
                  style={{
                    borderColor: "#2a2a2a",
                    color: ACCENT,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <Undo2 size={11} /> Undo
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 13,
                background: "#1e1e1e",
                color: "#888",
              }}
            >
              Thinking…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t p-2 flex gap-2 items-end"
        style={{ borderColor: "#1e1e1e" }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Tell me what to change..."
          className="flex-1 resize-none rounded px-2 py-1.5"
          style={{
            background: "#0a0a0a",
            color: "#fff",
            border: "1px solid #2a2a2a",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded p-2 disabled:opacity-50"
          style={{ background: ACCENT, color: "#0a0a0a" }}
          title="Send"
        >
          <Send size={14} />
        </button>
      </form>
    </aside>
  );
}
