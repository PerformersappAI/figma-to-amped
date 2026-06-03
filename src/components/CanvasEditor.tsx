import { useCallback, useEffect, useRef, useState } from "react";

const IFRAME_WIDTH = 1440;
const IFRAME_HEIGHT = 900;

export default function CanvasEditor() {
  const [urlInput, setUrlInput] = useState("");
  const [loadedUrl, setLoadedUrl] = useState<string>("");
  const [scale, setScale] = useState(1);
  const [editMode, setEditMode] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  const computeFitScale = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return 1;
    const availableW = el.clientWidth;
    const availableH = el.clientHeight;
    const s = Math.min(availableW / IFRAME_WIDTH, availableH / IFRAME_HEIGHT);
    return Math.max(0.05, s);
  }, []);

  const fitToScreen = useCallback(() => {
    setScale(computeFitScale());
  }, [computeFitScale]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(() => fitToScreen());
    ro.observe(canvasRef.current);
    fitToScreen();
    return () => ro.disconnect();
  }, [fitToScreen, loadedUrl]);

  const handleLoad = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    let url = urlInput.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setLoadedUrl(url);
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.1, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.1, 0.05));

  const scaledW = IFRAME_WIDTH * scale;
  const scaledH = IFRAME_HEIGHT * scale;

  return (
    <div className="flex h-screen w-full flex-col bg-[#1a1a1a] text-white">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 bg-[#2a2a2a] px-4 py-3 border-b border-black/40">
        <form onSubmit={handleLoad} className="flex flex-1 min-w-[260px] gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste a website URL (e.g. https://example.com)"
            className="flex-1 rounded-md bg-[#1a1a1a] border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="rounded-md bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium transition"
          >
            Load
          </button>
        </form>

        <div className="flex items-center gap-1 rounded-md bg-[#1a1a1a] border border-white/10 px-1 py-1">
          <button
            onClick={zoomOut}
            className="w-8 h-8 rounded hover:bg-white/10 text-lg leading-none"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-[52px] text-center text-sm tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="w-8 h-8 rounded hover:bg-white/10 text-lg leading-none"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>

        <button
          onClick={fitToScreen}
          className="rounded-md border border-white/10 bg-[#1a1a1a] hover:bg-white/5 px-3 py-2 text-sm"
        >
          Fit to Screen
        </button>

        <button
          onClick={() => setEditMode((v) => !v)}
          className={`rounded-md px-3 py-2 text-sm transition ${
            editMode
              ? "bg-purple-600 hover:bg-purple-500"
              : "border border-white/10 bg-[#1a1a1a] hover:bg-white/5"
          }`}
        >
          {editMode ? "Edit Mode: On" : "Edit Mode: Off"}
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden bg-[#1a1a1a]"
      >
        {loadedUrl ? (
          <div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: scaledW,
              height: scaledH,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              style={{
                width: IFRAME_WIDTH,
                height: IFRAME_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                background: "#fff",
              }}
            >
              <iframe
                src={loadedUrl}
                title="Canvas preview"
                style={{
                  width: IFRAME_WIDTH,
                  height: IFRAME_HEIGHT,
                  border: "0",
                  pointerEvents: editMode ? "auto" : "none",
                  display: "block",
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40 text-sm">
            Paste a URL above and click Load to preview a website.
          </div>
        )}
      </div>
    </div>
  );
}
