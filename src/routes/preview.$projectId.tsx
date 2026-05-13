import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/preview/$projectId")({ component: RedirectToHome });

function RedirectToHome() {
  const { projectId } = Route.useParams();
  const nav = useNavigate();
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("pages").select("slug,is_home").eq("project_id", projectId).order("order_index", { ascending: true });
      const home = (data || []).find(p => p.is_home) || (data || [])[0];
      if (home) nav({ to: "/preview/$projectId/$pageSlug", params: { projectId, pageSlug: home.slug }, replace: true });
    })();
  }, [projectId, nav]);
  return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
}
