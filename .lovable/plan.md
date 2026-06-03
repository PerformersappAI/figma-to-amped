## Do I know what the issue is?
Yes.

The zoom control is shrinking the editor iframe, but the canvas is keeping a stale scroll/offset state. That is why 100%, 90%, 80%, etc. can show different vertical parts of the page instead of the same page from the top. The main files involved are:
- `src/routes/_authenticated/projects/$id/editor.tsx`
- `src/styles.css`

## Plan

### 1. Lock zoom to a top-anchored fit model
- Keep `100%` meaning “fit the full page width inside the editor.”
- Make every zoom level scale from that fit width instead of treating the page as a raw desktop-width canvas.
- Ensure the frame stays anchored to the top of the page so lowering zoom shows more of the same page, not a lower section.

### 2. Remove the scroll jump during zoom changes
- Update the zoom logic so toolbar +/- and manual % entry reset the canvas view to the top after applying the new scale.
- Prevent the canvas from preserving an old mid-page scroll position when the frame becomes smaller.
- Make the zoom behavior deterministic across 100, 90, 80, 70, 60, etc.

### 3. Stop resize/fit feedback from fighting the zoom controls
- Keep a stable intrinsic page size for the active page/device.
- Recompute the fit scale only when the workspace width, device mode, or page actually changes.
- Prevent resize handling from re-fitting the canvas in the middle of a zoom interaction.

### 4. Clean up the canvas container layout
- Align the GrapesJS canvas, frame wrapper, and editor workspace so there is one predictable scroll area.
- Remove any overflow/positioning combination that causes the iframe to appear shifted or clipped from the top.
- Preserve vertical scrolling for the page length while avoiding the current “jump to another section” effect.

### 5. Validate the exact behavior you asked for
- Verify that at `100%` the whole page width is visible in the editor.
- Verify that lowering zoom still shows the same page from the top, only smaller.
- Verify that the page can be scrolled vertically to inspect the full length.
- Verify that switching pages or device mode still lands at the top correctly.

## Technical details
- Primary changes will be in `src/routes/_authenticated/projects/$id/editor.tsx` for `applyZoom`, fit-scale calculation, resize handling, and canvas scroll reset behavior.
- A small supporting cleanup may be needed in `src/styles.css` for GrapesJS canvas/frame overflow behavior.
- No backend, data, auth, or publishing logic will be changed.