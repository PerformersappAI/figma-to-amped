import { createFileRoute } from "@tanstack/react-router";
import CanvasEditor from "@/components/CanvasEditor";

export const Route = createFileRoute("/canvas-editor")({
  component: CanvasEditor,
});
