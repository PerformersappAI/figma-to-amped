import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

export function unauthenticatedResult() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated. Connect with OAuth and try again." }],
    isError: true,
  };
}

export function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

export function errorResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

export function supabaseForUser(ctx: ToolContext) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Backend credentials are not configured.");
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
