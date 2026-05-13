import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { convertFigmaFrame, refreshFigmaTokenIfNeeded } from "@/lib/figma-convert.server";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/figma/convert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") || "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return json({ error: "Unauthorized" }, 401);

          const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: u, error: uErr } = await supa.auth.getUser(token);
          if (uErr || !u.user) return json({ error: "Unauthorized" }, 401);
          const userId = u.user.id;

          const body = (await request.json()) as { fileKey?: string; nodeId?: string; projectId?: string };
          if (!body.fileKey || !body.nodeId) return json({ error: "Missing fileKey or nodeId" }, 400);

          const { data: conn } = await supabaseAdmin
            .from("figma_connections")
            .select("access_token, refresh_token, expires_at")
            .eq("user_id", userId)
            .maybeSingle();
          if (!conn) return json({ error: "Connect Figma first." }, 400);

          let accessToken: string;
          try { accessToken = await refreshFigmaTokenIfNeeded(userId, conn); }
          catch { return json({ error: "Your Figma session expired. Please reconnect Figma." }, 401); }

          const result = await convertFigmaFrame({
            accessToken,
            fileKey: body.fileKey,
            nodeId: body.nodeId,
            userId,
            projectId: body.projectId ?? null,
          });

          return json({
            html: result.html,
            css: result.css,
            designReference: result.designReference,
            metadata: {
              frameName: result.frameName,
              originalDimensions: { width: result.width, height: result.height },
              usedClaude: result.usedClaude,
              cost: result.cost,
            },
          });
        } catch (e: any) {
          console.error("figma convert error", e);
          return json({ error: e?.message || "Server error" }, 500);
        }
      },
    },
  },
});
