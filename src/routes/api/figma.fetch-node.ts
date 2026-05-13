import { createFileRoute } from "@tanstack/react-router";
import { ConvertPhaseError, getOwnedPage, markPageFailed, requireFigmaAuth, runFetchNodeStep } from "@/lib/figma-convert.server";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/figma/fetch-node")({
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
          const result = await runFetchNodeStep({ page, accessToken, fileKey: body.fileKey, nodeId: body.nodeId });
          return json(result);
        } catch (e: any) {
          const message = e?.message || "Server error";
          const phase = e instanceof ConvertPhaseError ? e.phase : "fetch_node";
          if (pageId) await markPageFailed(pageId, message);
          console.error("figma fetch-node error", phase, message, e?.stack);
          return json({ error: message, phase }, phase === "auth" ? 401 : 500);
        }
      },
    },
  },
});
