import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult, unauthenticatedResult } from "../supabase";

export default defineTool({
  name: "publish_project",
  title: "Publish project",
  description: "Mark one of the signed-in user's FigmaShip projects as published.",
  inputSchema: {
    projectId: z.string().describe("The project ID to publish."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();

    try {
      const { data, error } = await supabaseForUser(ctx)
        .from("projects")
        .update({ is_published: true })
        .eq("id", projectId)
        .select("id, name, is_published, updated_at")
        .maybeSingle();

      if (error) return errorResult(error.message);
      if (!data) return errorResult("Project not found or not accessible.");

      return textResult(`Published ${data.name}.`, { project: data });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Could not publish project.");
    }
  },
});
