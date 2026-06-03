## Goal

Make the GrapesJS canvas in the project editor span the full center workspace (between the left Pages/Blocks sidebar and the right Style Manager) and auto-fit the page width on load and when the window resizes, so the user sees the whole site at a glance and can scroll vertically through it like a real browser window.

## What's wrong today

In `src/routes/_authenticated/projects/$id/editor.tsx`:

1. The GrapesJS iframe (`.gjs-frame`) keeps an intrinsic pixel width (1440px for desktop). When the workspace is wider than that, the iframe still renders at 1440px and sits in the top-left of the workspace, leaving a large empty strip on the right (the red arrow in your screenshot).
2. The injected canvas body CSS uses `display:flex; justify-content:center; padding:24px` plus `body > * { flex: 0 0 auto; ... }`. That locks each section to its original Figma width and prevents stretching to fill the workspace.
3. `fitToViewport` only runs once on first body load. When the browser window resizes (or the right Style Manager mounts and changes available width), the canvas does not refit, so the page stays small on the left.
4. The 78% zoom in the first screenshot is `fitToViewport` computing scale against a tiny canvas width measured before the workspace had finished laying out.

## Fix

Edit only the editor route file and `src/styles.css` (presentation only, no business logic changes).

### 1. Stretch the GrapesJS canvas to fill the workspace

In `src/styles.css`, replace the current `.gjs-cv-canvas` / `.gjs-frame-wrapper` / `.gjs-frame` overrides with:

```css
.gjs-cv-canvas {
  background: #0a0a0a !important;
  width: 100% !important;
  height: 100% !important;
  overflow: auto !important;
}
.gjs-frame-wrapper { width: 100% !important; max-width: none !important; }
.gjs-frame {
  width: 100% !important;
  max-width: none !important;
  min-height: 100% !important;
  border: 0 !important;
  display: block !important;
}
```

This removes the hard pixel width on the iframe and lets it expand to the workspace.

### 2. Stop centering / clipping content inside the iframe

In `editor.on("load", ...)` (around line 273), change the injected `<style data-figmaship-canvas="1">` to:

```css
html, body { margin: 0; background: #fff; min-height: 100%; }
body { width: 100%; overflow-x: hidden; }
body > * { max-width: 100% !important; }
img, video { max-width: 100%; height: auto; }
```

This drops the flex/centering rules so each section fills the iframe width and the page scrolls vertically like a normal browser window.

### 3. Refit and rescale when the workspace resizes

In the editor `useEffect`, after the editor is initialized, attach a `ResizeObserver` on the workspace `div` (the parent of `ref.current`) that calls `fitToViewport(editor, setZoom)` on every size change (debounced via `requestAnimationFrame`). Tear it down in the cleanup callback alongside `editor.destroy()`.

Also call `fitToViewport` once more after `editor.on("load", ...)` so the first measurement happens after the body has injected styles, not before.

### 4. Loosen the `fitToViewport` width clamp

In `fitToViewport` (line 124) the `scalePct` is currently capped at `100`. Raise that cap to `400` (matching `applyZoom`) so when the workspace is wider than the content the canvas zooms up to fill it instead of staying at 100% in the top-left corner.

### 5. Confirm the workspace container

The center column at line 525 should remain:

```tsx
<div className="flex-1 min-w-0 relative"
  style={{ flex: 1, position: "relative", overflow: "hidden",
           minWidth: 0, maxWidth: "none", width: "100%",
           height: "100%", background: "#0a0a0a" }}>
  <div ref={ref} style={{ position: "absolute", inset: 0 }} />
  ...
```

Switch the inner workspace from `overflowY: "auto"` back to `overflow: "hidden"` — GrapesJS handles its own scrolling on `.gjs-cv-canvas`, and a second scrollbar on the outer div is what produced the duplicated scroll behavior you saw.

## Files changed

- `src/routes/_authenticated/projects/$id/editor.tsx` — canvas-body CSS, ResizeObserver, fit clamp, workspace overflow
- `src/styles.css` — `.gjs-frame` / `.gjs-cv-canvas` width rules

## Out of scope

- No changes to Pages, Blocks, Layers, SEO sidebars, top toolbar, save/publish flow, or any data/business logic.
- No layout changes to the right Style Manager panel beyond what naturally results from the canvas filling the remaining space.
