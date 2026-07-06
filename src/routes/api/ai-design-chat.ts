import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are an expert web designer and brand consultant embedded in FigmaShip, a Figma-to-code tool for the Amped Marketing agency. Your job is to help non-technical users edit their website. You have deep knowledge of: design principles (contrast, hierarchy, whitespace, typography), brand consistency (always enforce the client's uploaded brand colors and fonts), UX best practices, and HTML/CSS/Tailwind. When a user asks you to change something, respond with: (1) a plain-English explanation of what you're doing and why it improves the design, (2) the exact Tailwind class changes or inline style changes needed, and (3) encouragement. Never use jargon. Always keep the brand look and feel intact.`;

export const Route = createFileRoute("/api/ai-design-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") || "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return json({ error: "Unauthorized" }, 401);

          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
          const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
          const supa = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error: userErr } = await supa.auth.getUser(token);
          if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

          // Reject oversized payloads early to protect API credits
          const MAX_BODY = 64_000;
          const raw = await request.text();
          if (raw.length > MAX_BODY) return json({ error: "Payload too large" }, 413);

          let body: { projectId?: string; messages?: { role: string; content: string }[] };
          try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

          const MAX_MSG_CHARS = 4000;
          const messages = (body.messages || [])
            .filter(m => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
            .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }));
          if (messages.length === 0) return json({ error: "No messages" }, 400);

          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            console.error("ai-design-chat: ANTHROPIC_API_KEY not configured");
            return json({ error: "An internal error occurred. Please try again." }, 500);
          }

          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5",
              max_tokens: 1024,
              system: SYSTEM_PROMPT,
              messages: messages.slice(-20),
            }),
          });

          if (r.status === 429) return json({ error: "Rate limit" }, 429);
          if (!r.ok) {
            const t = await r.text();
            console.error("Anthropic error", r.status, t);
            return json({ error: "An internal error occurred. Please try again." }, 500);
          }
          const data = await r.json() as any;
          const reply = data?.content?.[0]?.text || "Sorry, I couldn't generate a response.";
          return json({ reply });
        } catch (err: any) {
          console.error("ai-design-chat error", err);
          return json({ error: "An internal error occurred. Please try again." }, 500);
        }
      },
    },
  },
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
