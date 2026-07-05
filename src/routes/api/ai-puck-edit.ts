import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are an expert page editor for FigmaShip. You receive the current Puck page data (JSON) plus a natural-language instruction, and you MUST return ONLY the complete updated Puck data as a single JSON object — no prose, no markdown fences, no commentary.

Rules:
- Preserve the exact shape: { "content": [...], "root": { "props": {} }, "zones"?: {...} }.
- Only use these component "type" values: Section, Heading, Paragraph, Image, Button, Navbar, Hero, CardGrid, Footer.
- Preserve every component's "props" schema. Only change the fields the user asked to change; keep every other prop intact.
- Preserve each component's existing "props.id" if present. Do not invent new ids unless adding a new component (use a short unique string like "ai-1", "ai-2").
- If the instruction is impossible or unclear, return the input JSON unchanged.
- Output MUST parse as JSON. No trailing commas. No comments. No explanation.`;

export const Route = createFileRoute("/api/ai-puck-edit")({
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

          const body = (await request.json()) as { puckData?: unknown; instruction?: string };
          const instruction = (body.instruction || "").trim();
          const puckData = body.puckData;
          if (!instruction) return json({ error: "Missing instruction" }, 400);
          if (!puckData || typeof puckData !== "object") return json({ error: "Missing puckData" }, 400);

          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

          const userMsg = `Current Puck data:\n\n\`\`\`json\n${JSON.stringify(puckData)}\n\`\`\`\n\nInstruction: ${instruction}\n\nReturn ONLY the full updated Puck data JSON.`;

          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5",
              max_tokens: 8192,
              system: SYSTEM_PROMPT,
              messages: [{ role: "user", content: userMsg }],
            }),
          });

          if (r.status === 429) return json({ error: "Rate limit" }, 429);
          if (r.status === 402) return json({ error: "Credits exhausted" }, 402);
          if (!r.ok) {
            const t = await r.text();
            console.error("Anthropic error", r.status, t);
            return json({ error: `AI error: ${r.status}` }, 500);
          }
          const data = (await r.json()) as any;
          const raw: string = data?.content?.[0]?.text || "";
          return json({ raw });
        } catch (err: any) {
          console.error("ai-puck-edit error", err);
          return json({ error: err.message || "Server error" }, 500);
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
