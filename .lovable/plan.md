## What's actually broken

The converter in `src/lib/figma-convert.ts` produces HTML that looks fine in the editor at desktop widths but collapses into the overlapping mess you screenshotted. Three concrete bugs:

### 1. Root frame uses `width: 100%` + `max-width` instead of fixed width

```text
<main>
  <div class="root" style="width:100%; max-width:1440px; min-height:Hpx; position:relative">
    <div style="position:absolute; left:1180px; top:60px;">  ← child positioned at Figma coords
```

When the editor / preview iframe is narrower than 1440px, the root collapses but children are still absolutely positioned at the original Figma X/Y. Anything past the viewport width slides on top of earlier content. That's why the coral image sits on top of "TRAVEL".

**Fix:** root gets `width: ${frameWidth}px` (no `max-width`, no `100%`). The outer iframe/canvas can scroll or zoom, but coordinates always line up.

### 2. Absolute-positioned wrapper has no width/height

```text
<div style="position:absolute; left:Xpx; top:Ypx;">${childHtml}</div>
```

The wrapper has no size, so the child renders at its *natural* size. For a TEXT node that means the paragraph wraps at whatever width the browser feels like — usually much wider than the original Figma text box. That's why "Local Dive Events and Trips…" runs the full page width and crashes through the image.

**Fix:** the wrapper takes the child's bbox dimensions:
```text
style="position:absolute; left:Xpx; top:Ypx; width:Wpx; height:Hpx;"
```

### 3. TEXT nodes have no width/height of their own

`textStyle()` only sets font properties — never `width` or `height`. Even with the wrapper fix above, text inside an auto-layout parent (no absolute wrapper) still has no constrained width. "TRAVEL" renders at the browser's default headline behavior (no wrap, full natural width) so it bleeds across the page.

**Fix:** in `textStyle`, also emit `width: ${bbox.width}px` and (for non-auto-sizing text) a min-height. Set `word-wrap: break-word` so long words don't bleed.

### 4. Bonus: root height

Root currently uses `min-height: Hpx` so it can grow. With absolute children that's fine, but auto-layout siblings can push it. Switch to `height: ${frameHeight}px; overflow: hidden` only when the frame uses no auto-layout (the common case for design files like Oceanwide).

## Files to change

Just one — `src/lib/figma-convert.ts`. Specifically:

- `nodeStyle(node, ctx, isRoot=true)` branch — replace the `width: 100% / max-width` block with a fixed `width: ${frameWidth}px` and add `overflow: hidden` for non-auto-layout root frames.
- `textStyle(node)` — accept the node's `absoluteBoundingBox`, emit `width`, `min-height`, and `word-wrap: break-word`.
- `convertNode` — when emitting the absolute-position wrapper, include `width` and `height` from the child's bbox.

No backend, schema, API, or pipeline changes. No re-conversion required for *future* pages — but existing failed/ugly pages need to be re-rendered. The cheapest path: from the upload screen, hit the existing "Retry" affordance which calls `runRenderStep` again (no Figma fetch, no asset re-download, no Claude pass needed for short HTML).

## Out of scope for this fix

- Responsive behavior (the original Figma is desktop-only at 1440px — making it adapt to mobile is a separate, larger effort).
- Claude cleanup pass logic — it's already preserving layout.
- Vector / image fidelity — that's Phase 2.2 territory and works.

## Test plan

1. Re-render the Oceanwide HP page and confirm: "TRAVEL" stays in its own column, paragraphs wrap inside their original text boxes, the two photos stay in their own slots, no overlap.
2. Re-render the Contact - Mobile page and confirm the mobile layout still looks correct (it was a 375px frame, so the fixed-width fix should *help* not hurt).
3. Open the editor and click on a paragraph — confirm GrapesJS still treats it as a selectable, editable element.

After approval I'll make the edits, then ping you to retry the render step on one Oceanwide page so we can compare.