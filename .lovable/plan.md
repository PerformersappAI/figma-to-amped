# Fix editor layout: center page + resolve overlapping logo

Two separate issues are visible in the screenshot:

1. **Page is not centered in the editor canvas.** The Figma frame is 1440px wide and the GrapesJS iframe body has no centering, so the page sits flush-left and gets clipped on the right (logo touches the sidebar, no breathing room, no scroll).
2. **The wave logo and "EANWIDE OUTFITTERS" wordmark overlap.** In Figma these two layers are intentionally arranged because one of them is a clipping/alpha mask on the wordmark. Our converter ignores `isMask` / `MASK` layers entirely, so both render at full size and stack on top of each other.

Neither is a backend / pipeline issue — both fixes live in the deterministic converter and the editor shell. No re-fetch from Figma is needed; existing pages just need to be re-rendered (Step 3) via the existing retry path, and the editor change is live for any open project.

## Scope

### 1. Center the page inside the GrapesJS canvas
File: `src/routes/_authenticated/projects/$id/editor.tsx`

After `grapesjs.init({...})`, inject a stylesheet into the canvas iframe so that:

- `html, body { margin: 0; background: #2a2a2a; min-height: 100%; }`
- `body { display: flex; justify-content: center; align-items: flex-start; padding: 24px; box-sizing: border-box; overflow-x: auto; }`
- `body > * { flex: 0 0 auto; box-shadow: 0 8px 40px rgba(0,0,0,0.4); background: #fff; }`

Use `editor.Canvas.getDocument()` to append a `<style>` tag once the canvas is ready (`editor:load` event). This keeps the converted `<main>` (which we now size to the true frame width, e.g. 1440px) horizontally centered with a dark gutter on each side, and gives a small scroll if the user shrinks the panel. WYSIWYG dragging is unaffected — we only style the iframe chrome, not the page contents.

### 2. Honor Figma masks in the converter
File: `src/lib/figma-convert.ts`

When walking children in `convertNode`, detect mask layers:

- A child node has `isMask === true` (Figma marks the mask layer this way).
- Or its `type === "BOOLEAN_OPERATION"` with `booleanOperation === "INTERSECT"` acting as a mask wrapper.

For the simplest correct fix, when iterating `node.children`:

- Find the first child with `isMask === true`. The mask layer itself should NOT render as a visible element. Instead:
  - Drop the mask layer from the output entirely (don't emit its `<img>` / `<div>`).
  - Apply its bounding box to its parent as `overflow: hidden` clipping (or, if its shape is an ellipse, set `border-radius: 50%` on the parent), so the siblings that were intended to be clipped are visually contained.
- Subsequent siblings keep rendering normally — they are now clipped by the parent instead of bleeding over the wordmark.

This is a minimal, conservative fix: it removes the duplicated wave that overlays the wordmark, and any frame that uses a mask now clips its contents rather than rendering both layers stacked. More sophisticated mask compositing (SVG `<mask>`, `clip-path: path()`) is out of scope.

### 3. Re-render existing pages
No DB migration. The user re-runs the existing retry on the affected page (HP, Mobile, etc.) — `runRenderStep` regenerates HTML/CSS from the cached `figma_node_tree` using the new converter logic. No Figma fetch, no asset re-download, no Claude pass for short HTML.

## Test plan

1. Re-render the Oceanwide HP page from upload screen.
2. Open it in the editor: page sits centered in the canvas with dark gutters on each side; resize browser → page scrolls horizontally inside the canvas instead of clipping under the sidebar.
3. The wave logo and "OCEANWIDE OUTFITTERS" wordmark no longer overlap — only the wordmark (or only the wave, depending on which layer Figma marked as mask) is visible in that slot.
4. Click any heading or paragraph in the editor — still selectable and draggable in GrapesJS.
5. Re-render the Contact - Mobile page (375px frame): centered in canvas, narrower gutters, still editable.

## Out of scope

- Anything in the Step 1/2/4 pipeline (Figma fetch, asset processing, Claude cleanup).
- Any DB schema change.
- Auto-layout / flexbox refactor of converter output (still using absolute positioning fallback).
- Full SVG mask compositing.
