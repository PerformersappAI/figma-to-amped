import { createFileRoute } from "@tanstack/react-router";
import GrapesEditor from "@/components/GrapesEditor";

export const Route = createFileRoute("/canvas-editor")({
  component: GrapesEditor,
});
