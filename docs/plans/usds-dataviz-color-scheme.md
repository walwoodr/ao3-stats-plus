# Plan: USDS-modeled data-viz color scheme + expanded marker set (raise cap to 10)

Status: **FINALIZED — both decisions confirmed by user 2026-08-04.** (1)
"series lines go solid" is consolidated into this plan, subsuming the sibling
dash-restyle ROADMAP item (marked resolved in ROADMAP.md). (2) CVD mechanism:
the no-new-dependency hardcoded-matrices approach, confirmed. Ready for
Testing (stage 3).

Source: Discovery (conversational, no persisted doc per this project's
convention). This plan replaces the current 6-slot (shape, dash, color)
series-style scheme with a 10-slot USDS-inspired-but-project-verified scheme,
adds 4 marker shapes (10 total), raises `MAX_SELECTED_WORKS` 6 → 10 with all
its UI copy/logic sites, and adds a formal colorblind (CVD) verification step.
Every color and CVD number below was computed directly (WCAG relative-luminance
contrast; Machado-2009 CVD simulation + CIE76 ΔE), not adopted on faith — see
"Palette derivation & verification."

This is **pure frontend work** (design tokens + a few components). Verified: no
backend/GraphQL/data-model change — the series palette is JS-only in
`colorTokens.ts` and the cap is a frontend constant; nothing in `backend/`
references either.

Resolved by the user during Discovery (do not relitigate): target cap ~10;
redesign all slots from scratch (do not preserve the existing 6 identities);
cap raise coupled into this change; add a formal CVD requirement.

---

## 1. Happy path

1. An author with ≥10 works opens the dashboard; `statsForUser` resolves (no
   query change).
2. `WorkComparisonSection` renders the grouped `WorkPicker`. The author selects
   works one at a time and/or via "select all in fandom." The cap is now **10**:
   the 10th selection is allowed; at 10, remaining checkboxes disable and the
   live region announces "Maximum of 10 works reached."
3. Each selected work is assigned the lowest free **style slot** (0–9) via the
   existing stable `workId → styleIndex` map. Each slot is a `(shape, color)`
   pair drawn from the new 10-slot table; lines are **solid** (dash is no longer
   a per-series channel — see §3, "Dash decision").
4. `MultiSeriesTrendChart` (hits and kudos) draws one solid line per work in the
   slot color, with the slot's SVG marker shape as its dots. `ComparisonLegend`
   maps each work's title → glyph + worded description ("wine circle marker").
5. Overlapping/crossing lines stay individually traceable by **shape** (the
   guaranteed non-color channel, validated 10-way distinct), reinforced —
   redundantly — by color. A colorblind or grayscale user still reads all 10
   apart by shape alone.
6. The already-shipped per-work zero-basis lead-in (dashed `inkSoft` segment) is
   unchanged — it owns its own hardcoded dash and never read the slot table's
   dash, so removing per-series dash does not touch it.

## 2. Data model (backend): N/A (verified, not assumed)

No schema, model, migration, GraphQL type, or resolver change. The `series`
palette lives only in `frontend/src/lib/colorTokens.ts` (JS-only, no CSS custom
property, no backend field); `MAX_SELECTED_WORKS` is a frontend constant in
`comparisonSelection.ts`. `grep` over `backend/` finds neither. The comparison
graph consumes data already served by the single existing `statsForUser` round
trip (confirmed in `docs/plans/per-work-comparison-graph.md`, "Backend: N/A").

## 3. Frontend design (the meat)

### The new 10-slot style table

Distinctness now rests on **shape × color** (no dash). Shape is the
accessibility-guaranteed non-color channel; color is redundant reinforcement.

| slot | marker shape | hue role | light hex | CR vs `#FFFFFF` | dark hex | CR vs `#2B232A` |
|---|---|---|---|---|---|---|
| 0 | circle (filled) | wine (brand) | `#9F1239` | 8.02:1 | `#E8879E` | 6.10:1 |
| 1 | square (filled) | orange | `#C2410C` | 5.18:1 | `#FDBA74` | 9.05:1 |
| 2 | triangle-up (filled) | amber/ochre | `#854D0E` | 6.85:1 | `#FCD34D` | 10.58:1 |
| 3 | diamond (filled) | green | `#15803D` | 5.02:1 | `#86EFAC` | 10.86:1 |
| 4 | plus (filled) | teal | `#0F766E` | 5.47:1 | `#5EEAD4` | 10.31:1 |
| 5 | star (filled) | azure | `#0369A1` | 5.93:1 | `#7DD3FC` | 9.15:1 |
| 6 | triangle-down (filled) | indigo | `#4338CA` | 7.90:1 | `#818CF8` | 5.11:1 |
| 7 | cross / X (filled) | magenta | `#A21CAF` | 6.32:1 | `#F0ABFC` | 8.67:1 |
| 8 | circle (hollow/outline) | slate | `#334155` | 10.35:1 | `#CBD5E1` | 10.28:1 |
| 9 | square (hollow/outline) | brown | `#7C2D12` | 9.37:1 | `#D2B48C` | 7.73:1 |

All 20 clear **WCAG 2.1 SC 1.4.11 non-text contrast (≥3:1)** against the mode's
`--color-card` — the correct bar for a graphical object (chart line/marker), not
the 4.5:1 body-text bar. Lowest is 5.02:1 (light) / 5.11:1 (dark), comfortable
margin.

The two hollow variants (slots 8, 9) deliberately reuse the circle/square
silhouettes and add the **fill vs. outline** channel; each is paired with a
color far from its filled twin (wine↔slate, orange↔brown) so the pair is
distinguished by both fill and hue. Hollow markers render `fill="none"` +
`stroke=color`, which also lets crossing lines show through — a bonus in dense
charts.

### USDS provenance (inspired, then re-verified — not raw-adopted)

The hue families echo USDS Data Design Standards (teal, orange, azure/blue,
navy→slate) plus this project's brand wine and its growth-green/indigo/purple.
USDS's raw hexes were **not** adopted: several (e.g. teal `#26C6DA`, light-orange
`#FFBEA9`) fall well below 3:1 on this project's white card, and USDS's own bar
is 4.5:1 text/interactive against USDS backgrounds, not 3:1 against
`--color-card`. Every value above is a project-tuned darkened (light) / lightened
(dark) variant verified against the actual `colorTokens.ts` card tokens. USDS
explicitly does **not** guarantee CVD safety; that guarantee is this project's
own addition (§ CVD verification).

### Dash decision (explicit, per Discovery's ask)

**Recommendation: design for shape × color only; per-series lines become
solid.** Rationale:
- At 10 slots, 10 mutually distinguishable `stroke-dasharray` patterns do not
  exist, so dash cannot remain a per-series *identifier* regardless — the cap
  raise forces this, it is not opportunistic scope-grab.
- The non-color accessibility guarantee migrates cleanly from "shape + dash" to
  "shape alone (validated 10-way distinct)." Dash was always redundant *with*
  shape (both non-color), so dropping it does not weaken the non-color channel.
- The already-shipped zero-basis lead-in owns dash (`4 4`, inkSoft, hardcoded in
  `MultiSeriesTrendChart`, not read from the slot table). Making series lines
  solid keeps dash meaning exactly one thing on the chart — "pre-data lead-in" —
  which is precisely the end-state the sibling dash-restyle ROADMAP item was
  going to reach. See "Decisions to confirm" #1 for the consolidation this
  implies.

### Palette derivation & verification (how the numbers were reached)

A verification script (WCAG contrast + Machado-2009 protan/deutan/tritan
simulation + CIE76 ΔE) was run over candidate palettes. Findings:
- A naive "pretty" rainbow palette collapses to ΔE ~1–2 under CVD (indigo≈purple
  under protanopia; violet≈magenta under deuteranopia) — a fail.
- Pure maximin optimization pushes worst-case CVD ΔE to ~9–12 but produces
  three-purples/three-browns (light) and garish neon limes (dark) that break
  MASTER.md's "dark mode = same product at night" rule — rejected.
- The **balanced final palette above** keeps genuine hue variety and brand
  coherence while clearing a **ΔE ≥ 3.0 (CIE76) floor** — the just-noticeable-
  difference threshold, i.e. no two colors become literally identical — under
  all three CVD types in both modes. Measured worst-case minimum pairwise ΔE:

  | mode | protanopia | deuteranopia | tritanopia | floor |
  |---|---|---|---|---|
  | light | 4.6 | 3.8 | 5.5 | **3.8** |
  | dark | 12.6 | 3.7 | 10.5 | **3.7** |

Because **shape guarantees identity**, color separation is a reinforcement
target, not the accessibility floor; the ΔE ≥ 3 bar ensures color rarely
actively misleads, and shape covers the rest.

### CVD verification mechanism & pass/fail bar (the new required step)

Two complementary parts:

1. **Automated gate — no new dependency.** A Vitest spec
   (`frontend/src/lib/colorTokens.cvd.test.ts`) hardcodes the standard
   Machado-2009 CVD matrices + sRGB→Lab conversion (~60 self-contained lines,
   the same math Chrome DevTools uses; no library) and asserts, for the 10
   series colors in each mode: (a) each clears 3:1 vs its card [hard gate];
   (b) for each of protanopia/deuteranopia/tritanopia, the **minimum pairwise
   CIE76 ΔE ≥ 3.0**. Deterministic, regression-proof, re-runs on any palette
   edit. Verified above to pass with headroom (worst 3.7).
2. **Manual sign-off pass.** A one-time documented pass in Chrome DevTools
   Rendering → "Emulate vision deficiencies" (protanopia, deuteranopia,
   tritanopia, **achromatopsia/grayscale**) on the Storybook 10-work
   `MultiSeriesTrendChart` story, both light and dark; screenshots attached to
   the PR. **Achromatopsia is the decisive case**: with zero color, every one of
   the 10 series must remain individually traceable by **shape** — this is the
   real accessibility floor and what makes color-channel imperfections
   acceptable. Pass bar: all 10 traceable by shape under grayscale; automated
   gate green.

Dependency note per policy: the hardcoded-matrix approach adds **no** package. A
library alternative (e.g. `color-blind`, `culori`) would be a new dependency and
is **not** proposed — flagged as the alternative in "Decisions to confirm" #2 in
case the user prefers it.

### Files touched (all frontend)

| File | Change |
|---|---|
| `src/lib/colorTokens.ts` | `LIGHT_COLOR_TOKENS.series` / `DARK_COLOR_TOKENS.series` grow 6 → 10 hexes (tables above). |
| `src/lib/seriesStyles.ts` | `MarkerShapeName` union gains `triangle-down`, `cross`, `circle-hollow`, `square-hollow`. `SERIES_STYLE_SLOTS` rebuilt to 10 `(shape, colorRole)` slots. Drop the `dash` and `dashLabel` fields (lines now solid); update the "all 6 taken" comment to 10. Assignment helpers are length-driven and adapt automatically. |
| `src/lib/markerShapes.tsx` | Add renderers for the 4 new shapes: `triangle-down` (inverted polygon), `cross` (plus rotated 45°, or two diagonal rects), `circle-hollow` (`<circle fill="none" stroke>`), `square-hollow` (`<rect fill="none" stroke>`). Hollow stroke width scales with `size` (chart `size:4`, legend `size:5`). |
| `src/lib/comparisonSelection.ts` | `MAX_SELECTED_WORKS` 6 → 10; update the doc-comment rationale ("count of distinct marker shapes" → 10). |
| `src/components/WorkPicker.tsx` | Cap copy: "Maximum of **10** works reached." and "…; **10**-work maximum reached." (lines 45, 68). Disable/`aria-disabled` logic already keys off `MAX_SELECTED_WORKS`, no change. |
| `src/components/charts/MultiSeriesTrendChart.tsx` | Remove `strokeDasharray={slot.dash ?? undefined}` on the per-series `<Line>` (now solid). Lead-in line/dot unchanged. Reads `SERIES_STYLE_SLOTS[styleIndex]` + `colors.series[styleIndex]` as today — auto-picks up 10. |
| `src/components/charts/ComparisonLegend.tsx` | Worded description drops the dash word: `"{colorRole} {shape} marker"` (e.g. "wine circle marker", "slate hollow-circle marker"). |
| `design-system/ao3-stats-plus/MASTER.md` | Replace the "Multi-Series Comparison Charts → 6-slot shape/dash/color scheme" subsection: new 10-slot shape+color table, new contrast table, new **CVD verification** subsection + result table, cap language 6 → 10, dash-reserved-for-lead-in note. Also fix the two "six-swatch/six-slot" references (the global "Series palette" note ~L104 and "Six is the cap" ~L292). |

Stories/tests for every touched module update alongside (§7). No new component
files, no new dependencies.

### Design-token consistency (cited against MASTER.md)

- Series lines/markers use the new 10-slot palette as reinforcement; **shape is
  the primary non-color differentiator** — still satisfies MASTER.md Chart
  Guidance ("differentiated by line style, never color alone") and its
  Multi-Series subsection's "shape is the accessibility-guaranteed channel."
- Dark palette values are **lightened tonal variants of the same 10 light hues**
  (wine→rose, orange→peach, slate→light-slate, …), per MASTER.md's explicit rule
  that dark mode is tonal variants of one hue identity, never inversion, and
  "reads as this same product at night" — not a second, unrelated palette.
- Colors resolve through the existing `useChartColors()` seam (MASTER.md's
  "Recharts needs a real hex, not a CSS var" note) — the `series` array already
  flows through it; length change is transparent.
- Marker glyphs stay SVG primitives (MASTER.md Anti-Patterns: no emoji icons).
  Card/typography/spacing/focus tokens unchanged.

## 4. Corner cases (deviations from happy path, not errors)

- **7th–10th work selected:** now allowed (previously capped at 6). Slots 6–9
  (triangle-down/cross/hollow-circle/hollow-square) are exercised for the first
  time — the empirical shape-distinguishability pass must cover the full 10, not
  just the original 6.
- **Cap reached (10):** remaining checkboxes `disabled` + `aria-disabled`; live
  region "Maximum of 10 works reached." (unchanged behavior, new number).
- **"Select all in fandom" exceeding 10:** "Added N of M works; 10-work maximum
  reached." (unchanged behavior, new number).
- **Fewer than 10 works available:** no cap ever hit; only the first K slots
  used — unchanged.
- **Stable slot reuse across toggles:** unchanged; a released slot's shape+color
  is reclaimed lowest-first by the next add (existing `seriesStyles` behavior,
  now over 10 slots).
- **Hollow marker on an overlapping crossing line:** the outline may be visually
  crossed by another line; still distinguishable by silhouette + color. Called
  out for the manual visual pass.
- **Grayscale / achromatopsia:** all 10 read apart by shape alone (the sign-off
  case).

## 5. Error states

Frontend-only; no network/backend paths added or changed.
- **Palette/slot index out of range:** cannot occur — `MAX_SELECTED_WORKS` (10)
  equals `SERIES_STYLE_SLOTS.length` (10) equals `series.length` (10); a
  regression test asserts all three stay equal so a future edit to one can't
  desync (a real risk given three separate literals).
- **`styleIndex` fallback:** `MultiSeriesTrendChart`/`ComparisonLegend` already
  fall back to slot 0 (`?? 0`) if an assignment is missing — unchanged.
- Existing `useStatsForUser` loading/error/token-mismatch handling in
  `DashboardPage` untouched.

## 6. Accessibility (first-class)

- **Non-color guarantee = shape, validated.** With dash gone, shape is the sole
  non-color channel. The 10 shapes MUST be validated individually
  distinguishable at chart scale (~8px, `size:4`) and legend scale (~10px,
  `size:5`), in both modes, **and under grayscale/achromatopsia** — an explicit
  Testing gate. If any pair collides, swap a shape (e.g. hexagon or wye as
  reserves) rather than shipping an indistinct pair. Count-is-10 is validated,
  not assumed (Discovery's requirement).
- **CVD:** the automated ΔE gate + manual DevTools pass above; color is
  reinforcement only, so a near pair degrades reinforcement, never identity.
- **Legend** keeps the worded description (now "{color} {shape} marker") so the
  mapping survives for screen-reader users and into the sr-only table; the glyph
  stays `aria-hidden` (its accessible name is the words).
- **sr-only markers + wide data table:** now up to 10 value columns per metric.
  Confirm the table stays navigable at 10 columns (it is sr-only; header cells
  name each work). No color dependence — identity is the work's **title text**.
- **Cap live region:** the `role="status"` announcement copy updates to "10";
  behavior unchanged.
- **Contrast:** every series color ≥3:1 vs card, both modes (table above);
  ink-on-card chrome reuses already-verified pairs.
- **Reduced motion:** `isAnimationActive={false}` unchanged.
- **Automated coverage:** Storybook `addon-a11y` (component) + the existing
  `@axe-core/playwright` dashboard spec (route) extended for the 10-work state.

## 7. Task list (one commit per completed item, per CODE_STANDARDS.md)

### Testing (stage 3 — write failing tests first, against this plan)

1. `colorTokens` palette shape: `series` has length 10 in both light and dark;
   each hex clears 3:1 vs its card (recompute in-test, don't hardcode the ratio).
2. `colorTokens.cvd.test.ts` (new): hardcoded Machado matrices + Lab; assert min
   pairwise CIE76 ΔE ≥ 3.0 for protan/deutan/tritan in both modes. (Red until
   the palette lands.)
3. `seriesStyles`: `SERIES_STYLE_SLOTS` length 10; pin the new (shape, colorRole)
   per slot in order; every slot has a distinct shape; every slot a distinct
   colorRole. **Remove** the old "distinct dash pattern" and `dashLabel` tests
   (dash is gone). Assignment: lowest-free-index up to 10; no 11th slot; stable
   across toggles; lowest-free reuse on release — extend the existing loops 6→10.
4. `markerShapes`: `renderMarkerShape` returns the expected primitive for each of
   the 10 shapes incl. the 4 new ones; hollow variants render `fill="none"` +
   stroke; `MarkerGlyph` renders each at legend size.
5. `comparisonSelection`: `MAX_SELECTED_WORKS === 10`; refuses an 11th; select-
   all truncates at 10 with the "N of M … 10-work maximum" signal. Update the
   existing `toBe(6)` / "7th" / "6-work" assertions to 10 / "11th" / "10-work".
6. Invariant test: `MAX_SELECTED_WORKS === SERIES_STYLE_SLOTS.length ===
   LIGHT.series.length === DARK.series.length` (guards against future desync).
7. `WorkPicker`: at-cap (10) disables remaining + `role="status"` "Maximum of 10
   works reached"; select-all truncation says "10-work maximum reached". Update
   the four "6" assertions (lines 160/200/208/222).
8. `ComparisonLegend`: worded description reads "{color} {shape} marker" with no
   dash word; renders correct glyph per slot for all 10.
9. `MultiSeriesTrendChart`: renders N solid lines (no `strokeDasharray` on series
   lines) with distinct shape+color; 10-series state; colors from
   `useChartColors().series`; lead-in line/dot behavior unchanged (regression).
10. `WorkComparisonSection`: update "6 works"/"7th" cap tests to 10/11th; 10-work
    state renders both charts + full legend.
11. Shape-distinguishability validation artifact: a documented pass (see §6) that
    all 10 shapes are distinct at 8px/10px in both modes and under grayscale;
    record method + result (this is the empirical count-is-10 check Discovery
    required, not arithmetic).
12. Stories: extend `WorkComparisonSection.stories`, `WorkPicker.stories`,
    `MultiSeriesTrendChart.stories` with a full 10-work fixture; add/extend a
    marker-shapes and legend story showing all 10 glyphs. Playwright axe scan +
    keyboard walkthrough extended to the 10-work populated state.

### Implementation (stage 4 — make them pass, in this order)

1. `colorTokens.ts`: add the 10 light + 10 dark hexes to `series`.
2. `seriesStyles.ts`: extend `MarkerShapeName`; rebuild `SERIES_STYLE_SLOTS`
   (10 shape+color slots, no dash/dashLabel); update comments.
3. `markerShapes.tsx`: implement the 4 new shape renderers (+ hollow stroke
   scaling).
4. `comparisonSelection.ts`: `MAX_SELECTED_WORKS` → 10 (+ comment).
5. `MultiSeriesTrendChart.tsx`: drop series-line `strokeDasharray`.
6. `ComparisonLegend.tsx`: new worded description.
7. `WorkPicker.tsx`: cap copy → 10.
8. `MASTER.md`: rewrite the Multi-Series subsection (10-slot table, contrast
   table, CVD subsection + results, cap 10, dash-reserved-for-lead-in); fix the
   two "six" references. Confirm `colorTokens.ts` ↔ MASTER.md parity per the
   file's own duplicated-source-of-truth warning.
9. Run the manual CVD DevTools pass + the shape-distinguishability pass; attach
   screenshots; swap any colliding shape and re-verify if needed.

Standards: `.tsx` ≤ 500, `.ts` ≤ 400; ESLint + Prettier clean; RuboCop N/A
(no Ruby). One commit per item.

### Retrospective (stage 8 — evaluate against, once shipped)

- Is 10 the right cap in practice, or does a 10-line chart read as too busy
  despite distinct shapes? (Q2 revisit — was 6, now 10.)
- Did the shape × color (no dash) scheme hold up: were all 10 shapes genuinely
  distinguishable in real use at chart scale and under grayscale?
- Did the CVD gate stay green and did the manual/automated split prove worth the
  extra step, or was one redundant?
- Coverage of the changed frontend modules against the 85% baseline.
- Did consolidating the sibling dash-restyle item into this plan (Decision #1)
  leave any loose ends in the ROADMAP or MASTER.md?

## 8. Infra / hosting cost estimate

**N/A** — no new paid infrastructure; frontend-only, deployed through the
existing pipeline.

## Decisions to confirm (before Testing)

1. **Consolidate "series lines go solid" into this plan.** A 10-slot table makes
   per-series dash impossible, so this plan necessarily sets series lines solid —
   which is largely the end-state the *separate* sibling dash-restyle ROADMAP
   item ("remove dash as a per-series differentiator; reserve dash for the
   lead-in") was going to produce. Recommend: absorb the per-series-line part
   here, and update the ROADMAP so the sibling item either closes or narrows to
   any residual (e.g. formally documenting "dash === lead-in only" — already
   done in MASTER.md by this plan). Confirm this consolidation rather than
   leaving two items that would collide.
2. **CVD mechanism: hardcoded matrices (no new dependency) vs. a library.**
   Recommend the no-dependency hardcoded Machado-matrix Vitest gate + manual
   DevTools pass (above). A library (`color-blind`/`culori`) would be a new
   out-of-stack dependency requiring approval; only pursue if you'd rather not
   maintain ~60 lines of color math in-repo.
3. **Shape set (informational — swap reserves exist).** Proposed 10: circle,
   square, triangle-up, diamond, plus, star, triangle-down, cross/X,
   hollow-circle, hollow-square. If the distinguishability pass flags a pair,
   hexagon and wye (Y) are held in reserve as swaps.

## Addendum (2026-08-04, Maintenance, same-day shape-set correction)

The shape set as originally shipped (this plan's §3 table above, and "Decisions to confirm" #3)
included **plus, star, and cross** at slots 4, 5, and 7. On review of the shipped feature, the
user rejected these three as not "basic geometric shapes" and asked for outlines of the
already-present diamond, triangle-up, and triangle-down instead — "adding outlines of the
existing diamond, triangle-up and triangle-down should sufficiently handle this." This addendum
records the correction rather than silently rewriting the table above, per this project's
convention for dated corrections.

**Resolved slot→shape reassignment** (colors untouched — shape was never color-dependent, so
the hex/contrast/CVD numbers in §3 and "Palette derivation & verification" below remain valid
as-is, indexed by slot):

| slot | old shape (rejected) | new shape | color role (unchanged) |
|---|---|---|---|
| 4 | plus | diamond (hollow/outline) | teal |
| 5 | star | triangle-up (hollow/outline) | azure |
| 7 | cross / X | triangle-down (hollow/outline) | magenta |

Rationale for this particular slot→shape pairing (one of several valid orderings — documented
per the maintenance brief's request, not the only defensible choice): each hollow shape keeps
the color role its slot already had, so this is a pure shape swap with zero downstream color/
contrast/CVD re-derivation. The three hollow shapes were assigned to slots 4/5/7 in the same
order their filled counterparts already appear in the table (diamond at slot 3, triangle-up at
slot 2, triangle-down at slot 6) — a simple, arbitrary-but-consistent mapping, not one chosen to
maximize index-distance from each shape's filled twin (unlike the original circle/square hollow
pair at slots 8/9, which sit maximally far from their filled twins at 0/1). Index-distance from
a shape's own filled twin has no bearing on distinguishability between *different* works' glyphs
(work-to-slot assignment is by selection order, not shape family), so this wasn't treated as a
hard constraint.

Final 10-shape set: **circle, square, triangle-up, diamond, triangle-down — each filled and
hollow/outline (5 × 2 = 10)**. No plus, star, or cross anywhere. The `MarkerShapeName` union
names the three new hollow variants `diamond-hollow`, `triangle-hollow`, and
`triangle-down-hollow` (matching the existing `circle-hollow`/`square-hollow` naming pattern —
note the codebase's filled triangle-up shape is itself named `"triangle"`, not `"triangle-up"`,
so its hollow variant follows suit as `"triangle-hollow"` rather than `"triangle-up-hollow"`;
this plan's own prose above already used "triangle-up" loosely as a synonym for the same shape).

Both prior distinguishability artifacts (`docs/testing/usds-shape-distinguishability-pass.md`,
Testing's illustrative-geometry pass, and `docs/implementation/usds-manual-cvd-shape-pass.md`,
Implementation's real-component manual CVD/grayscale pass) reviewed the **old** shape set
including plus/star/cross and are now stale for the shape-silhouette question specifically (the
CVD/color-distance numbers in both remain valid — colors didn't change). A fresh
shape-distinguishability-only pass for the corrected 10-shape set is recorded at
`docs/maintenance/usds-shape-set-correction-distinguishability-pass.md`.

No functional, color, or contrast/CVD impact — this is a same-day shape-only correction, not a
new decision requiring re-approval of the consolidated dash/CVD-mechanism decisions above.

## Addendum (2026-08-06, post-Retrospective, color-only correction)

The 2026-08-06 Retrospective (`docs/retros/2026-08-06-consultation-gaps-and-comparison-graph-cycle.md`)
flagged that the original §3 series palette (wine/orange/amber/green/teal/azure/indigo/magenta/
slate/brown) had been finalized without the Review-cycle color options the user's standing
consultation expectations called for — the palette shipped as a single proposal, never presented
alongside alternatives. Per the user's explicit request ("the final decision on the USDS colors
should have gone through a review cycle, ideally with a few presented options, and I would like
to do that post-retrospective"), a dedicated post-retrospective re-review was run. This addendum
records that re-review and its outcome. **Shape is entirely unaffected** — this is a color-only
correction; the 10-slot shape table (post the 2026-08-04 addendum above) is unchanged.

**Process:** two new candidate palettes were generated alongside the shipped one and presented
via a live, theme-aware visual comparison (real marker-shape swatches against actual app card
backgrounds in both light and dark mode, plus illustrative mini chart mockups), each independently
WCAG-contrast- and Machado-2009-CVD-ΔE-verified using the same methodology as the original
palette (§"Palette derivation & verification" above) before being shown. The user selected
"Muted Archive" for light mode. For dark mode, the user asked for the paired dark variant to move
"towards a more white-grey pastel that better matches with the muted colors in light mode" than
the first proposal — a further paler pastel alternative was computed and verified, then, per the
user's follow-up ("can we hit about halfway between the first proposal and recommended
options?"), a third "Halfway" variant was computed as a genuine midpoint saturation (not an
eyeballed lightening) between the two and verified again. The user confirmed this final pairing
("yes, go with halfway and muted").

**Resolved slot→color reassignment** (shape untouched — color role names also changed, since the
new palette's hues don't map onto the old role names):

| slot | old color role (retired) | old light hex | new color role | new light hex | new dark hex |
|---|---|---|---|---|---|
| 0 | wine (brand) | `#9F1239` | slate-blue | `#727F8C` | `#B2CCE6` |
| 1 | orange | `#C2410C` | teal | `#4F7074` | `#ABE1E7` |
| 2 | amber/ochre | `#854D0E` | sage | `#74918D` | `#8BC7BF` |
| 3 | green | `#15803D` | pine | `#4D5D52` | `#6FAE86` |
| 4 | teal | `#0F766E` | olive | `#6C6D58` | `#D5D8A0` |
| 5 | azure | `#0369A1` | clay | `#8C6441` | `#E2A46D` |
| 6 | indigo | `#4338CA` | dusty rose | `#A77A75` | `#F7CEC9` |
| 7 | magenta | `#A21CAF` | mauve | `#964F6B` | `#FAB2CC` |
| 8 | slate | `#334155` | muted violet | `#8F619C` | `#C98ED9` |
| 9 | brown | `#7C2D12` | indigo-slate | `#4B5882` | `#AEB7E1` |

**Contrast — reverified** (WCAG relative-luminance formula, ≥3:1 non-text-contrast bar, against
`--color-card`): all 20 pairs clear 3:1, lowest 3.40:1 (light, slot 2 "sage") and 5.87:1 (dark,
slot 3 "pine") — tighter margins than the original palette's, a disclosed tradeoff of choosing a
deliberately lower-chroma, muted palette, not an oversight. Full per-slot table in MASTER.md's
"Multi-Series Comparison Charts" section, which this addendum's numbers were computed to match
exactly (not independently estimated).

**CVD — reverified:** worst-case minimum pairwise CIE76 ΔE rose to **7.9 (light) / 8.0 (dark)**
(from the original palette's 3.7–3.8), comfortably clear of the 3.0 floor — the automated gate
(`frontend/src/lib/colorTokens.cvd.test.ts`) computes this directly against whichever palette is
live and needed no changes itself to cover the new values.

No shape, layout, or component-structure impact. Implementation: `frontend/src/lib/colorTokens.ts`
(`LIGHT_COLOR_TOKENS.series`/`DARK_COLOR_TOKENS.series`) and `frontend/src/lib/seriesStyles.ts`
(`SERIES_STYLE_SLOTS[*].colorRole`), plus the corresponding test files and MASTER.md.

## Cross-references

- `docs/plans/per-work-comparison-graph.md` — the parent feature (6-slot scheme,
  `MAX_SELECTED_WORKS`, `MultiSeriesTrendChart`, `WorkPicker`) this revises.
- `docs/plans/per-work-zero-basis-dates.md` — the shipped lead-in that owns the
  chart's only remaining dash; unaffected by removing per-series dash.
- `design-system/ao3-stats-plus/MASTER.md` — Multi-Series Comparison Charts
  subsection, rewritten by this plan (task 8).
