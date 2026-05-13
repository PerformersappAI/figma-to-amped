import { createFileRoute } from "@tanstack/react-router";
import { ConvertPhaseError, getOwnedPage, markPageFailed, requireFigmaAuth, runProcessAssetsStep } from "@/lib/figma-convert.server";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/figma/process-assets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pageId = "";
        try {
          const { userId, accessToken } = await requireFigmaAuth(request);
          const body = (await request.json()) as { fileKey?: string; pageId?: string; nodeId?: string };
          pageId = body.pageId || "";
          if (!body.fileKey || !body.pageId || !body.nodeId) return json({ error: "Missing fileKey, pageId or nodeId" }, 400);
          const page = await getOwnedPage(body.pageId, userId);
          const result = await runProcessAssetsStep({ page, accessToken, fileKey: body.fileKey, userId, nodeId: body.nodeId });
          return json(result);
        } catch (e: any) {
          const message = e?.message || "Server error";
          const phase = e instanceof ConvertPhaseError ? e.phase : "process_assets";
          if (pageId) await markPageFailed(pageId, message);
          console.error("figma process-assets error", phase, message, e?.stack);
          return json({ error: message, phase }, phase === "auth" ? 401 : 500);
        }
      },
    },
  },
});
