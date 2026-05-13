import { createFileRoute } from "@tanstack/react-router";
import { ConvertPhaseError, getOwnedPage, markPageFailed, requireFigmaAuth, runRenderStep } from "@/lib/figma-convert.server";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/figma/render")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let pageId = "";
        try {
          const { userId } = await requireFigmaAuth(request);
          const body = (await request.json()) as { pageId?: string };
          pageId = body.pageId || "";
          if (!body.pageId) return json({ error: "Missing pageId" }, 400);
          const page = await getOwnedPage(body.pageId, userId);
          const result = await runRenderStep({ page });
          return json(result);
        } catch (e: any) {
          const message = e?.message || "Server error";
          const phase = e instanceof ConvertPhaseError ? e.phase : "render";
          if (pageId) await markPageFailed(pageId, message);
          console.error("figma render error", phase, message, e?.stack);
          return json({ error: message, phase }, phase === "auth" ? 401 : 500);
        }
      },
    },
  },
});
