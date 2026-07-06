import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult, unauthenticatedResult } from "../supabase";

function isPuckData(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray((value as { content?: unknown }).content) &&
    (value as { root?: unknown }).root !== null &&
    typeof (value as { root?: unknown }).root === "object"
  );
}

export default defineTool({
  name: "update_page_puck_data",
  title: "Update page layout",
  description: "Replace a page's Puck layout JSON for the signed-in user.",
  inputSchema: {
    projectId: z.string().describe("The project that owns the page."),
    pageId: z.string().describe("The page ID to update."),
    puckData: z.any().describe("A complete Puck data object with content and root."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, pageId, puckData }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();
    if (!isPuckData(puckData)) {
      return errorResult("Invalid Puck data. Expected an object with a content array and root object.");
    }

    try {
      const { data, error } = await supabaseForUser(ctx)
        .from("pages")
        .update({ puck_data: puckData })
        .eq("project_id", projectId)
        .eq("id", pageId)
        .select("id, name, slug, updated_at")
        .maybeSingle();

      if (error) return errorResult(error.message);
      if (!data) return errorResult("Page not found or not accessible.");

      return textResult(`Updated ${data.name}.`, { page: data });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Could not update page layout.");
    }
  },
});
