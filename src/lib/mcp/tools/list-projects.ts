import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, supabaseForUser, textResult, unauthenticatedResult } from "../supabase";

export default defineTool({
  name: "list_projects",
  title: "List projects",
  description: "List the signed-in user's FigmaShip projects.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticatedResult();

    try {
      const { data, error } = await supabaseForUser(ctx)
        .from("projects")
        .select("id, name, is_published, updated_at, created_at, thumbnail_url")
        .order("updated_at", { ascending: false })
        .limit(25);

      if (error) return errorResult(error.message);

      const projects = data ?? [];
      const summary = projects.length
        ? projects
            .map((project) => `- ${project.name} (${project.id}) — ${project.is_published ? "published" : "draft"}`)
            .join("\n")
        : "No projects found for this account.";

      return textResult(summary, { projects });
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Could not list projects.");
    }
  },
});
