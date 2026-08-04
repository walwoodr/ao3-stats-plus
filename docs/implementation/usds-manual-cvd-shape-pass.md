# USDS dataviz color scheme: Implementation-stage manual CVD + shape-distinguishability sign-off

Implementation task 9 / task-list #67 (`docs/plans/usds-dataviz-color-scheme.md`,
section 7 "Implementation," and the plan's CVD verification mechanism §2
"Manual sign-off pass"). Testing's own artifact
(`docs/testing/usds-shape-distinguishability-pass.md`) explicitly reviewed
**illustrative geometry**, not this project's real `markerShapes.tsx` —
this pass re-confirms distinguishability against the actual shipped
implementation, per that document's own "does not cover" section and per
the Implementation-agent brief that launched this stage.

## Method

Real rendering of the actual shipped code, not a re-implementation or a
guess:

1. `renderMarkerShape` was imported directly from the real
   `frontend/src/lib/markerShapes.tsx` (the same function
   `MultiSeriesTrendChart` and `ComparisonLegend` call), along with the real
   `SERIES_STYLE_SLOTS` (`seriesStyles.ts`) and the real `LIGHT_COLOR_TOKENS`/
   `DARK_COLOR_TOKENS.series` (`colorTokens.ts`) — bundled with esbuild and
   rendered to static HTML via `react-dom/server`'s `renderToStaticMarkup`,
   at chart scale (`size=4`, ~8px) and legend scale (`size=5`, ~10px), for
   both light and dark palettes. This is the actual production geometry, not
   Testing's illustrative reproduction script.
2. The resulting real-geometry rows were wrapped in a real headless
   Chromium page (Playwright, `deviceScaleFactor: 6`) under 5 filter states
   per row:
   - Baseline (no filter)
   - **Achromatopsia approximation** (CSS `grayscale(1)`) — the plan's
     stated decisive case: with zero color, all 10 shapes must remain
     individually traceable by silhouette alone.
   - Protanopia, deuteranopia, tritanopia — each an SVG `feColorMatrix`
     filter built from the **same Machado-2009 coefficients** already
     hardcoded (and tagged `EXTERNAL-UNVERIFIED`, per TECH_DEBT.md) in
     `frontend/src/lib/colorTokens.cvd.test.ts`. This is the standard
     CSS/SVG-filter technique Chrome DevTools' "Emulate vision
     deficiencies" panel is documented to use internally, applied directly
     to sRGB (not linearized) — a visual approximation of that panel, run
     without requiring a live interactive DevTools session in this
     environment. It is a *different* pipeline from the automated gate's
     linear-light + Lab ΔE math (that numeric gate is
     `colorTokens.cvd.test.ts`, unaffected by and not duplicated by this
     visual pass).
3. Each of the 4 rows (light/dark × chart/legend scale) × 5 filter states
   was screenshotted and visually reviewed image-by-image (not just
   structurally asserted).

Reproduction script: `assets/usds-manual-cvd-shape-pass/build-filtered-page.mjs`
(takes the real-geometry `shapes.html` — produced by bundling a small
`render-grid.tsx` entry that imports the three real modules above and calls
`renderToStaticMarkup` — and wraps each row in the filter defs). Screenshots:
`assets/usds-manual-cvd-shape-pass/{light,dark}-{chart,legend}-scale.png`.

## Findings

**Pass — all 10 shapes (circle, square, triangle-up, diamond, plus, star,
triangle-down, cross, circle-hollow, square-hollow) read apart individually
in every state reviewed**: baseline, achromatopsia (grayscale), protanopia,
deuteranopia, and tritanopia, at both chart scale (~8px) and legend scale
(~10px), in both light and dark mode. This matches Testing's illustrative-
pass finding and confirms it holds for the actual shipped
`markerShapes.tsx` geometry, not just the strategy.

Per-pair notes (the pairs sharing a base silhouette family):

- **triangle-up vs. triangle-down**: apex-up vs. apex-down orientation reads
  clearly in every filter state and both scales, including grayscale.
- **plus vs. cross**: orthogonal vs. 45°-rotated arms remained clearly
  distinct at chart scale in every filter state, including grayscale, where
  color offers no help.
- **circle vs. circle-hollow**, **square vs. square-hollow**: fill vs.
  outline is unambiguous at every scale and filter tested, including
  grayscale.
- **diamond**: the 45°-rotated filled silhouette stayed clearly distinct
  from both the upright filled square and the upright hollow square in
  every state.

No pair required the plan's reserved swap shapes (hexagon, wye); no color
swap was needed either. The shipped 10-shape/10-color scheme passes as
specified, with the automated CVD gate (`colorTokens.cvd.test.ts`) green
and this manual pass confirming the achromatopsia floor holds for the real
implementation.

## What this does and doesn't cover

- **Covers**: real rendered-pixel review of the actual shipped
  `markerShapes.tsx` geometry (not illustrative code) under achromatopsia
  and all three dichromacy types, at both cited scales, both color modes.
- **Does not cover**: a live interactive Chrome DevTools "Emulate vision
  deficiencies" session — this environment has no such live browser UI
  access; the SVG-filter approximation above uses the same published
  Machado-2009 coefficients that panel is documented to use, applied via
  the standard CSS/SVG-filter technique, as the closest available
  substitute. See the `EXTERNAL-UNVERIFIED` tag on those coefficients in
  `colorTokens.cvd.test.ts`/`TECH_DEBT.md` (left for Review, not resolved
  here).
- **Does not cover**: cross-browser/cross-OS rendering variance — one
  headless Chromium path was reviewed. Low risk for flat SVG primitives.
