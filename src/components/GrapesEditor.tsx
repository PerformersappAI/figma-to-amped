import { useEffect, useRef } from "react";
import grapesjs, { type Editor } from "grapesjs";
import presetWebpage from "grapesjs-preset-webpage";
import blocksBasic from "grapesjs-blocks-basic";
import "grapesjs/dist/css/grapes.min.css";

export default function GrapesEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: "100vh",
      width: "auto",
      fromElement: false,
      storageManager: false,
      plugins: [blocksBasic, presetWebpage],
      pluginsOpts: {
        [blocksBasic as unknown as string]: {},
        [presetWebpage as unknown as string]: {},
      },
      deviceManager: {
        devices: [
          { name: "Desktop", width: "" },
          { name: "Tablet", width: "768px", widthMedia: "992px" },
          { name: "Mobile", width: "375px", widthMedia: "480px" },
        ],
      },
    });

    editor.BlockManager.add("shopify-product", {
      label: "Shopify Product",
      category: "Commerce",
      media:
        '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 4h10l1 4H6l1-4Zm-1 6h12v10H6V10Zm4 2v2h4v-2h-4Z"/></svg>',
      content: `
        <div data-shopify-product-id="" style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;max-width:280px;font-family:system-ui,sans-serif;">
          <div style="background:#f3f4f6;height:180px;border-radius:8px;margin-bottom:12px;"></div>
          <h3 style="margin:0 0 4px;font-size:16px;">Product Title</h3>
          <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">$0.00</p>
          <button style="background:#111827;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;">Add to cart</button>
        </div>
      `,
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
}
