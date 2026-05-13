import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { convertFigmaFrame, refreshFigmaTokenIfNeeded, slugify } from "@/lib/figma-convert.server";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/figma/convert-batch")({
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

          const body = (await request.json()) as {
            fileKey?: string;
            fileName?: string;
            nodeIds?: string[];
            frames?: { nodeId: string; name: string }[];
            projectId?: string; // optional: append to existing project
          };
          if (!body.fileKey || !body.frames?.length) {
            return json({ error: "Missing fileKey or frames" }, 400);
          }
          const { fileKey, frames, fileName } = body;

          const { data: conn } = await supabaseAdmin
            .from("figma_connections")
            .select("access_token, refresh_token, expires_at")
            .eq("user_id", userId).maybeSingle();
          if (!conn) return json({ error: "Connect Figma first." }, 400);

          let accessToken: string;
          try { accessToken = await refreshFigmaTokenIfNeeded(userId, conn); }
          catch { return json({ error: "Your Figma session expired. Please reconnect Figma." }, 401); }

          // Find or create project
          let projectId = body.projectId || "";
          if (!projectId) {
            const { data: project, error: projErr } = await supabaseAdmin
              .from("projects")
              .insert({
                user_id: userId,
                name: fileName || "Figma project",
                figma_metadata: { fileKey, sourceFrames: frames.length },
              })
              .select("id").single();
            if (projErr || !project) throw projErr || new Error("Failed to create project");
            projectId = project.id;
          }

          // Compute starting order index (so re-runs append)
          const { data: existingPages } = await supabaseAdmin
            .from("pages").select("order_index, slug, is_home")
            .eq("project_id", projectId);
          const startOrder = (existingPages?.reduce((m, p) => Math.max(m, p.order_index ?? 0), -1) ?? -1) + 1;
          const hasHomeAlready = (existingPages || []).some(p => p.is_home);
          const usedSlugs = new Set((existingPages || []).map(p => p.slug));

          // Insert all rows up front as "pending" so the UI sees them immediately
          const pageIds: { pageId: string; nodeId: string }[] = [];
          for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            let base = slugify(f.name || `page-${i + 1}`);
            let candidate = base;
            let n = 2;
            while (usedSlugs.has(candidate)) { candidate = `${base}-${n++}`; }
            usedSlugs.add(candidate);

            const { data: page, error } = await supabaseAdmin
              .from("pages")
              .insert({
                project_id: projectId,
                name: f.name,
                slug: candidate,
                figma_node_id: f.nodeId,
                order_index: startOrder + i,
                is_home: !hasHomeAlready && i === 0,
                status: "pending",
              })
              .select("id").single();
            if (error || !page) {
              console.error("page insert failed", error);
              continue;
            }
            pageIds.push({ pageId: page.id, nodeId: f.nodeId });
          }

          // Process sequentially. Realtime page UPDATE events stream progress to the
          // client during this long-running request — no need for fire-and-forget.
          for (const { pageId, nodeId } of pageIds) {
            await supabaseAdmin.from("pages").update({ status: "building" }).eq("id", pageId);
            try {
              const result = await convertFigmaFrame({
                accessToken, fileKey, nodeId, userId, projectId,
              });
              await supabaseAdmin.from("pages").update({
                status: "ready",
                html: result.html,
                css: result.css,
                figma_design_reference_url: result.designReference,
                figma_metadata: {
                  frameName: result.frameName,
                  width: result.width,
                  height: result.height,
                  usedClaude: result.usedClaude,
                  cost: result.cost,
                },
                error_message: null,
              }).eq("id", pageId);
            } catch (e: any) {
              console.error("convert frame failed", nodeId, e);
              await supabaseAdmin.from("pages").update({
                status: "failed",
                error_message: e?.message || "Conversion failed",
              }).eq("id", pageId);
            }
          }

          return json({ projectId, pageIds: pageIds.map(p => p.pageId) });
        } catch (e: any) {
          console.error("convert-batch error", e);
          return json({ error: e?.message || "Server error" }, 500);
        }
      },
    },
  },
});
