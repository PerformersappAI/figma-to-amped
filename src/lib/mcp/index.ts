import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProjectTool from "./tools/get-project";
import listProjectsTool from "./tools/list-projects";
import publishProjectTool from "./tools/publish-project";
import updatePagePuckTool from "./tools/update-page-puck";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "figmaship-mcp",
  title: "FigmaShip",
  version: "0.1.0",
  instructions:
    "Tools for FigmaShip projects. Use these tools to list a user's projects, inspect pages, update Puck layouts, and publish projects. Always act only on the signed-in user's accessible projects.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjectsTool, getProjectTool, updatePagePuckTool, publishProjectTool],
});
