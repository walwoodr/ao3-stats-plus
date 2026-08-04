# USDS dataviz color scheme: same-day shape-set correction — distinguishability pass

Maintenance correction (2026-08-04) to the just-shipped "USDS-modeled data-viz
color scheme + expanded marker set" feature
(`docs/plans/usds-dataviz-color-scheme.md`, addendum). The user rejected the
originally shipped plus/star/cross markers (slots 4/5/7) as not "basic
geometric shapes" and asked for outlines of the existing diamond,
triangle-up, and triangle-down instead. This pass re-validates
distinguishability for the **corrected** 10-shape set.

Scoped per the maintenance brief: color was never shape-dependent, so the
CVD/color-distance numbers already verified in
`docs/implementation/usds-manual-cvd-shape-pass.md` and the automated
`colorTokens.cvd.test.ts` gate remain valid unchanged and are **not**
re-derived here. This pass covers the shape-silhouette question only.

## Method

Same methodology as the Implementation-stage pass this supersedes for the
shape question — real rendering of the actual shipped code, not a
re-implementation or a guess:

1. `renderMarkerShape` imported directly from the real, corrected
   `frontend/src/lib/markerShapes.tsx`, along with the real
   `SERIES_STYLE_SLOTS` (`seriesStyles.ts`, now carrying `diamond-hollow`,
   `triangle-hollow`, `triangle-down-hollow` at slots 4/5/7) and the real
   `LIGHT_COLOR_TOKENS`/`DARK_COLOR_TOKENS.series` (`colorTokens.ts`,
   unchanged) — rendered to static HTML via `react-dom/server`'s
   `renderToStaticMarkup`, at chart scale (`size=4`, ~8px) and legend scale
   (`size=5`, ~10px), for both light and dark palettes.
2. The resulting real-geometry rows were wrapped in a real headless
   Chromium page (Playwright, `deviceScaleFactor: 6`, for a legible
   screenshot without changing true relative on-screen size) under 2 filter
   states per row:
   - Baseline (no filter)
   - **Achromatopsia approximation** (CSS `grayscale(1)`) — the decisive
     case per this project's established methodology: with zero color, all
     10 shapes must remain individually traceable by silhouette alone.

   (Protanopia/deuteranopia/tritanopia filters are intentionally not
   re-run here — those exercise the *color* channel, which this
   shape-only correction does not touch; they're already covered by the
   Implementation-stage pass and remain valid.)
3. All 8 resulting images (2 modes × 2 scales × 2 filter states) were
   screenshotted and **each one individually viewed and visually reviewed**
   by the reviewer (not just structurally asserted or assumed from the
   baseline case) before writing the finding below.

Reproduction script: `frontend/.tmp-shape-pass/build-and-shoot.mjs` (scratch,
not committed — takes the real-geometry `shapes.html`, produced by bundling
`render-grid.tsx`, and wraps each row in the baseline/grayscale filter
states). Screenshots:
`assets/usds-shape-set-correction-distinguishability-pass/row-{light,dark}-{chart,legend}-{baseline,grayscale-achromatopsia}.png`.

## Findings

**Pass — all 10 shapes (circle, square, triangle-up, diamond,
diamond-hollow, triangle-hollow, triangle-down, triangle-down-hollow,
circle-hollow, square-hollow) read apart individually** in both baseline
and achromatopsia (grayscale) states, at both chart scale (~8px) and legend
scale (~10px), in both light and dark mode. No plus, star, or cross remain
anywhere in the set.

Per-pair notes, focused on the shape-family cluster most at risk from this
correction (indices 2–7: the triangle/diamond/triangle-down family, now
containing three new hollow siblings):

- **triangle-up vs. triangle-down (filled and hollow)**: apex-up vs.
  apex-down orientation reads clearly in both filter states and both
  scales, including grayscale — matches the pre-existing filled pair's
  already-validated behavior.
- **triangle-up-filled vs. triangle-up-hollow**, **triangle-down-filled
  vs. triangle-down-hollow**: fill vs. outline is unambiguous at every
  scale and filter tested, including grayscale, consistent with the
  existing circle/circle-hollow and square/square-hollow pairs.
- **diamond (filled) vs. diamond-hollow**: the 45°-rotated silhouette
  stays clearly distinct in its own right, and fill vs. outline further
  separates the two — no confusion with each other or with the upright
  square/square-hollow pair at either scale.
- **diamond-hollow vs. circle-hollow vs. square-hollow** (the three
  hollow-outline shapes, now sitting closer together in slot order at
  4/8/9 than the original plan's more spread-out 4/5/7↔8/9 layout): pointed
  vertices (diamond) vs. no corners (circle) vs. right-angle corners
  (square) remain individually distinct in every state reviewed, including
  grayscale at chart scale — the smallest, hardest case.

No pair required the plan's reserved swap shapes (hexagon, wye). The
corrected 10-shape set passes as specified.

## What this does and doesn't cover

- **Covers**: real rendered-pixel review of the actual corrected
  `markerShapes.tsx`/`seriesStyles.ts` geometry (not illustrative code)
  under baseline and achromatopsia, at both cited scales, both color
  modes — every one of the 8 images individually viewed.
- **Does not cover** (by design, per the maintenance brief's scope limit):
  protanopia/deuteranopia/tritanopia re-verification — colors are
  unchanged by this correction, so the Implementation-stage pass's
  findings for those three filter states remain valid and are not
  duplicated here.
- **Does not cover**: a live interactive Chrome DevTools "Emulate vision
  deficiencies" session — same environment constraint as the
  Implementation-stage pass; the CSS `grayscale(1)` filter is the standard
  achromatopsia approximation.
- **Does not cover**: cross-browser/cross-OS rendering variance — one
  headless Chromium path was reviewed. Low risk for flat SVG primitives,
  consistent with the Implementation-stage pass's own scoping.
