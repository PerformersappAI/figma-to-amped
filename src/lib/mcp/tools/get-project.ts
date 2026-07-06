import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult, unauthenticatedResult } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Get project",
  description: "Get a project and its pages for the signed-in user.",
  inputSchema: {
    projectId: z.string().describe("The project ID to inspect."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();

    try {
      const supabase = supabaseForUser(ctx);
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, name, is_published, updated_at, created_at, thumbnail_url, figma_design_reference, figma_metadata")
        .eq("id", projectId)
        .maybeSingle();

      if (projectError) return errorResult(projectError.message);
      if (!project) return errorResult("Project not found or not accessible.");

      const { data: pages, error: pagesError } = await supabase
        .from("pages")
        .select("id, name, slug, is_home, order_index, status, updated_at, thumbnail_url, puck_data")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });

      if (pagesError) return errorResult(pagesError.message);

      const pageSummary = (pages ?? [])
        .map((page) => `- ${page.name} (${page.id}) /${page.slug}${page.is_home ? " — home" : ""}`)
        .join("\n");

      return textResult(`Project: ${project.name}\nPages:\n${pageSummary || "No pages found."}`, {
        project,
        pages: pages ?? [],
      });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Could not load project.");
    }
  },
});
