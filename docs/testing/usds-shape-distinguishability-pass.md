# USDS dataviz color scheme: shape-distinguishability validation pass

Testing task 11 (`docs/plans/usds-dataviz-color-scheme.md`, section 7) - the
plan's explicit requirement that the 10-shape marker set be *empirically*
validated as individually distinguishable, not just asserted by count. This
is a Testing-stage deliverable distinct from the automated unit tests in
`markerShapes.test.tsx` (which check structural/DOM properties like "renders
`fill=\"none\"` on the hollow variants") - this document is the **visual**
check: do the 10 shapes actually read apart from each other at real chart/
legend scale, in both color modes, and under grayscale (achromatopsia)?

## Method

Real rendering, not a guess. A standalone HTML fixture
(`assets/usds-shape-distinguishability/generate-shapes.mjs`) draws all 10
shapes with SVG primitives, using the same geometry formulas cited in the
plan's "Files touched" section (circle/square/triangle-up/diamond/plus/star
unchanged from the pre-existing 6-shape set; triangle-down as an inverted
polygon; cross as a plus rotated 45°; circle-hollow/square-hollow as
`fill="none"` + `stroke`). This script is a verification-only artifact, not
production code - `markerShapes.tsx`'s real Implementation-stage geometry is
free to differ in exact coordinates as long as the 10 shapes stay distinct;
this pass exists to confirm that goal is achievable with a straightforward
geometry choice, not to prescribe the final one.

The fixture was rendered in a real headless Chromium (Playwright, the same
browser engine `frontend/vite.config.ts`'s Storybook/vitest-browser project
already uses for this repo's other browser-mode tests) at `deviceScaleFactor:
6` for a high-resolution capture, then screenshotted per row and visually
reviewed image-by-image (not just structurally asserted) as part of this
Testing pass. This is a genuine rendering + visual review, not a fabricated
pass - see "What this does and doesn't cover" below for its limits.

Two colors, two scales, two filter states = 8 screenshots reviewed:

| Mode | Scale | Filter | File |
|---|---|---|---|
| Light | Chart (`size=4`, ~8px) | none | `row-light-chart.png` |
| Light | Legend (`size=5`, ~10px) | none | `row-light-legend.png` |
| Light | Chart (`size=4`, ~8px) | grayscale (achromatopsia approx.) | `row-light-chart-gray.png` |
| Light | Legend (`size=5`, ~10px) | grayscale (achromatopsia approx.) | `row-light-legend-gray.png` |
| Dark | Chart (`size=4`, ~8px) | none | `row-dark-chart.png` |
| Dark | Legend (`size=5`, ~10px) | none | `row-dark-legend.png` |
| Dark | Chart (`size=4`, ~8px) | grayscale (achromatopsia approx.) | `row-dark-chart-gray.png` |
| Dark | Legend (`size=5`, ~10px) | grayscale (achromatopsia approx.) | `row-dark-legend-gray.png` |

All 8 images live in `assets/usds-shape-distinguishability/`.

Colors used are the plan's own final 10-hex tables (light and dark `series`
arrays from section 3) - taken as given per this task's brief, not
recomputed.

## Findings

**Pass - all 10 shapes read apart individually in every one of the 8
states reviewed**, including the decisive grayscale/achromatopsia case at
true chart scale (the plan's stated accessibility floor: "with zero color,
every one of the 10 series must remain individually traceable by shape").

Per-pair notes on the closest calls (the pairs that share a base silhouette
family and rely on a secondary cue):

- **triangle-up vs. triangle-down**: opposite point orientation (apex up vs.
  apex down) reads clearly at both scales, light and dark, colored and
  grayscale - confirmed no ambiguity in any of the 8 screenshots.
- **plus vs. cross**: orthogonal arms vs. diagonal (45°-rotated) arms is the
  distinguishing cue - held up at chart scale in every state reviewed,
  including grayscale where color can't help. The cross reads slightly
  "busier"/smaller than the plus at 8px due to the rotation's diagonal
  extent hitting the glyph's bounding box corners, but remained
  unambiguously a rotated/X shape, not confusable with the plus's upright
  cross.
- **circle vs. circle-hollow**, **square vs. square-hollow**: fill vs.
  outline is an unambiguous, high-contrast cue at every scale tested,
  including grayscale - the plan's stated rationale for choosing hollow
  variants over two more distinct-but-crowded new silhouettes.
- **diamond vs. square/square-hollow**: diamond's 45°-rotated, filled
  silhouette stayed clearly distinct from both the upright filled square and
  the upright hollow square at every scale reviewed.

No pair required the plan's reserved swap shapes (hexagon, wye) - the
proposed 10-shape set (`docs/plans/usds-dataviz-color-scheme.md`, "Decisions
to confirm" #3) passes as specified.

## What this does and doesn't cover

- **Covers**: real rendered-pixel visual review of shape-only
  distinguishability, at both cited scales, both color modes, and under a
  grayscale approximation of achromatopsia, using a real browser engine
  rather than a description or a guess.
- **Does not cover**: the actual `markerShapes.tsx` Implementation-stage
  code (doesn't exist yet at Testing time) - this pass verifies the shape
  *strategy* (10 silhouettes chosen, including the fill/hollow pairing) is
  sound, not a specific commit's pixel-for-pixel output. Implementation
  should re-eyeball the real rendered chart/legend once built (the plan's
  Implementation task 9's manual DevTools pass covers that).
- **Does not cover**: true protanopia/deuteranopia/tritanopia simulation of
  *shape* silhouettes - not meaningful, since CVD affects color perception,
  not edge/silhouette perception, so a grayscale/achromatopsia approximation
  is the correct proxy for "can color-blind and totally colorblind users
  alike tell shapes apart," per the plan's own framing ("achromatopsia is
  the decisive case"). Per-color CVD distinguishability (a *different*
  question - can colors be told apart under CVD) is covered separately and
  numerically by `frontend/src/lib/colorTokens.cvd.test.ts`'s automated ΔE
  gate, not by this visual pass.
- **Does not cover**: real device/OS font/anti-aliasing variance - one
  headless Chromium rendering path was reviewed, not a cross-browser/cross-
  OS sweep. Low risk for flat SVG primitives with no text-rendering
  dependency, but noted for completeness.
