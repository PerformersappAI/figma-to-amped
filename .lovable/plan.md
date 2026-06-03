## Problem

In the editor, "100%" is being treated as the iframe's intrinsic pixel width (e.g. 1440px). When the workspace is narrower than that, the iframe overflows — the top/sides of the site get cut off and the canvas scrolls to the middle, so the page header is hidden (screenshots 2 + 5). Pressing + / − rescales the iframe but also forces `fitToViewport` to re-measure mid-zoom, which sometimes catches a stale scrollHeight while the body is still re-laying out. That makes the canvas snap to a different scroll position and look like it jumped to "another page" (screenshots 1, 3, 4).

Two root causes in `src/routes/_authenticated/projects/$id/editor.tsx`:

1. `applyZoom` and `fitToViewport` both write to `frame.style.width/height` and `transform: scale()`, and `fitToViewport` keeps re-running on every `ResizeObserver` tick and on a 300ms + 1200ms timer after load. That feedback loop is what causes the visual "jumping" while you click the zoom buttons.
2. The zoom number in the toolbar is the raw scale factor. When the workspace is 900px wide and the page is 1440px wide, "100%" literally renders at 1440px — wider than the workspace — so the top-left corner sits offscreen.

## Fix (presentation-only, no business logic)

Edit only `src/routes/_authenticated/projects/$id/editor.tsx`.

### 1. Redefine 100% as "fit width"

Track two numbers in state:

- `fitScale` — the scale at which the page exactly fills the workspace width (computed once per load and on workspace resize).
- `zoom` — the user-visible percentage where `100` means `fitScale` and `200` means `2 × fitScale`.

`applyZoom(editor, pct)` becomes:

```ts
const effective = (pct / 100) * fitScaleRef.current;
frame.style.transform = `scale(${effective})`;
frameWrapper.style.width  = `${baseW * effective}px`;
frameWrapper.style.height = `${baseH * effective}px`;
```

Result: 100% always shows the whole site width in the workspace (matches the user's "Fit to editor" choice), and +/− zoom from there without ever clipping the top.

### 2. Compute `fitScale` from a stable base width

Measure the content width ONCE per page-load, after `canvas:frame:load:body` has fired and after a single `requestAnimationFrame` settle:

```ts
const contentW = Math.max(doc.body.scrollWidth, doc.documentElement.scrollWidth, frame.offsetWidth);
baseWidthRef.current = contentW;            // never overwritten by zoom
fitScaleRef.current  = canvasEl.clientWidth / contentW;
applyZoom(editor, 100);                     // 100% = fit
```

Stop deleting `frame.dataset.baseWidth` on every zoom. The base width is the intrinsic page width, not a function of the current scale.

### 3. Tame the ResizeObserver

Replace the current ResizeObserver that calls `fitToViewport` on every tick with one that only recomputes `fitScale` (and only when the workspace width actually changes by more than 4px). It must NOT change the user's chosen zoom; if the user is at 100% it just rescales to fit the new width, if they're at 150% it stays 150% of the new fit. Drop both `setTimeout(..., 300)` and `setTimeout(..., 1200)` post-load refits — they're what's causing mid-interaction "jumps". One refit after `canvas:frame:load:body` is enough.

### 4. Reset scroll to top on zoom

After every `applyZoom`, set `canvasEl.scrollTop = 0` only when zoom changes via the toolbar (not on ResizeObserver fit). This guarantees the header is visible after the user zooms in/out, matching their expectation.

### 5. Restore the workspace container

Lines 561–562 currently have `overflowY: "auto"` on the wrapper plus `position: absolute; inset: 0` on the inner `ref` div. With GrapesJS handling its own scroll on `.gjs-cv-canvas`, the outer `overflowY: "auto"` adds a second scrollbar that scrolls the iframe out of view. Switch the wrapper to `overflow: "hidden"` and leave the inner div as `position: absolute; inset: 0`.

## Files changed

- `src/routes/_authenticated/projects/$id/editor.tsx` — zoom math (`applyZoom`, `fitToViewport`), `useEffect` ResizeObserver, removal of the 300/1200ms refits, workspace `overflow`.

## Out of scope

No changes to data loading, page CRUD, save/publish, Style Manager, Pages/Blocks/Layers/SEO sidebars, or `src/styles.css`.
