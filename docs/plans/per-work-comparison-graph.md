# Plan: Per-work comparison graph (multi-select works, fandom bulk-select, time-range slider)

Status: **FINALIZED — both design decisions resolved by user 2026-08-02.**
(A) Chart series carry a **redundant categorical color channel** on top of shape+dash (not
ink-only). (B) The time-range slider uses **MUI `Slider` in range mode** (not two native range
inputs). Ready for Testing (stage 3), subject to the one dependency heads-up in "Resolved design
decisions → B" below (MUI is pre-approved in TECH_STACK.md but is not yet physically installed).

Scope: three ROADMAP items, planned together as one cohesive per-work chart area (confirmed by
user 2026-07-30):

1. Per-work stats as a graph with a control to select **multiple** works and graph them
   alongside one another, each work with a unique **line-and-point style**, up to a reasonable
   maximum.
2. The selection control offers "select all works within a fandom."
3. When there are **> 2 data points**, a two-thumb slider lets the user pick a time range from
   `earliestPostYear` to the current date.

This is **pure frontend work**. Confirmed by reading the resolvers/types (see "Backend: N/A"
below) — all data already exists and is already exposed via GraphQL.

---

## Backend / data model: N/A (verified, not assumed)

Read directly:

- `backend/app/graphql/types/stats_for_user_type.rb` — exposes `perWorkSeries: [PerWorkSeriesType!]!`
  and `earliestPostYear: Integer` (nullable).
- `backend/app/graphql/types/per_work_series_type.rb` — each work exposes `ao3WorkId: Int!`,
  `title: String!`, `fandoms: String!`, `points: [PerWorkPointType!]!` (each point
  `{capturedOn, hits, kudos}`, ordered `captured_on ASC`).
- `backend/app/graphql/stats_for_user_result.rb` — `per_work_series` returns the user's works;
  `earliest_post_year` comes off the `Ao3User`.
- `frontend/src/queries/useStatsForUser.ts` — the `StatsForUserData`/`PerWorkSeries` TS types
  already carry `fandoms: string` and `earliestPostYear: number | null`. The query already
  selects every field this feature consumes.

**`fandoms` shape confirmed:** it is a single comma-joined `String` at the API boundary, not a
list. `backend/app/services/snapshot_ingest_service.rb:129` builds it with
`Array(work_data["fandoms"]).join(", ")` and `backend/app/models/work.rb` documents it as a
comma-joined union. The delimiter is **`", "` (comma + space)**. The frontend will split on
`", "` to recover the fandom list (see Corner Cases for the lossy-split caveat and why it is an
accepted limitation rather than a backend change).

**Conclusion (Open Question 6):** no GraphQL/type/resolver/migration changes. The multi-select,
the fandom grouping, and the date-range filter are all pure client-side transforms over data
already in hand from the single existing `statsForUser` round trip.

---

## Resolved open questions (with reasoning)

**Q1 — Replace the single-work dropdown, or coexist?** → **Replace.** A multi-select that
defaults to exactly one selected work (the first, as today) fully subsumes the current
single-`<select>` behavior: with one work selected the comparison chart renders a single line,
i.e. visually today's view. A separate "single mode" would be redundant surface area for no new
capability. The current `PerWorkTrends` function in `DashboardPage.tsx` is removed and replaced
by `WorkComparisonSection`.

**Q2 — "Reasonable maximum" for simultaneous works.** → **6.** The binding constraint is the
**non-color primary differentiator**: this codebase distinguishes chart series by *style, not
color* (MASTER.md Chart Guidance; the roadmap's own words are "line-and-point **style**"). The
count of *unambiguously distinct* simple marker shapes at ~7px is about six — circle, square,
triangle, diamond, plus, star; a 7th/8th (X, wye, hexagon) start reading as one of the first six
at chart scale. Six is also where six overlapping lines stay individually traceable, the visible
legend stays compact, and the accessible wide data table stays navigable (1 date column + up to
6 value columns per metric). Beyond six, added lines degrade legibility for *every* series, not
just the new one. The cap is enforced everywhere works are added (individual checkboxes and
"select all in fandom" alike). The categorical palette (decision A) is exactly six swatches, one
per style slot, so the color count is bounded by the same cap.

**Q3 — Unique line-and-point scheme.** → Each selected work is assigned a **stable triple of
(marker shape, `stroke-dasharray`, categorical color)** — all three fixed together per work. The
**shape + dash pair is the accessibility-guaranteed, non-color channel** (a colorblind or
grayscale user still gets a unique marker shape and line texture per work), exactly the "line
style, never color alone" pattern the existing `TrendChart` lead-in uses. The **categorical
color is a redundant reinforcement channel** (decision A) that makes overlapping lines easier to
*trace* but is never the sole differentiator. A **visible legend** maps each work's title to its
glyph and describes the style in words ("solid wine line, circle marker") so the mapping survives
into the accessible table and for screen-reader users. Style assignment is **stable**: a
`workId → styleIndex` map assigns the lowest free index on add and releases it on remove, so a
work keeps its full (shape, dash, color) identity while other works are toggled. The six slots:

| slot | marker | stroke-dasharray | color role | light hex | dark hex |
|---|---|---|---|---|---|
| 1 | circle | solid | wine (brand accent) | `#9F1239` | `#E8879E` |
| 2 | square | `6 4` | teal | `#0F766E` | `#5EEAD4` |
| 3 | triangle | `2 3` | amber | `#B45309` | `#FBBF24` |
| 4 | diamond | `9 3 2 3` | indigo | `#4338CA` | `#A5B4FC` |
| 5 | plus | `4 4` | green (growth family) | `#4D7C5F` | `#8FBFA0` |
| 6 | star | `1 3` | purple | `#7E22CE` | `#D8B4FE` |

Palette derivation, hue choice, and contrast verification are in "Frontend design → Multi-series
categorical palette" below.

**Q4 — Fandom multi-select interaction model.** → **Additive bulk-select over one shared
selection set** (not replace, not a separate filter dimension). There is a single set of
selected works. Fandom is a convenience grouping in the picker: each fandom group has a "select
all in this fandom" affordance that *adds* that fandom's works to the current selection (up to
the cap), and a corresponding way to clear them. Rationale: "replace" would make cross-fandom
comparison impossible (a natural desire — "how do my Fandom A works stack up against my Fandom B
works"); a separate hide/show filter dimension conflicts with the core hand-pick interaction.
One selection set, one mental model. Items 1 and 2 of the roadmap collapse into a single
grouped picker control.

**Q5 — Slider threshold + lead-in boundary.**
- *Threshold:* the slider appears when the **union of distinct `capturedOn` dates across the
  currently-selected works is > 2** (i.e. ≥ 3), recomputed as the selection changes. With ≤ 2
  points there is no meaningful sub-range to pick (you would only be hiding one of two points).
- *Domain vs. axis:* the slider's *domain* is `[earliestPostYear .. current year]` per the
  roadmap. Its *effect* is to filter the point set to those whose `capturedOn` falls in the
  chosen window; the chart's x-axis stays the existing **categorical (index) axis** over the
  remaining points — MASTER.md explicitly says do **not** introduce a real date-scale axis. So a
  year-based control filtering a categorical-axis chart is the correct reconciliation, not a
  contradiction.
- *Lead-in — explicitly OUT of scope here.* The comparison charts get **no** synthetic
  zero-basis lead-in. The aggregate charts' lead-in uses the *user-level* `earliestPostYear`,
  which is semantically wrong for an *individual* work (a work first posted in 2020 must not
  baseline at the user's 2014 earliest). The correct per-work baseline is each work's own
  `published_on` (already a nullable field on `PerWorkSeriesType`), and giving each work a
  creation-date zero-basis baseline is a **separate, not-yet-built ROADMAP item**. This plan
  draws real points only. The boundary: *this* feature makes per-work start dates more visible
  and thereby motivates that separate item, but does not implement it. Keep them distinct.

**Q6 — Backend changes needed?** → **No.** See "Backend: N/A" above.

---

## Frontend design (the meat)

### Component tree (after)

```
DashboardPage
├─ (aggregate section: TrendChart ×2 + RatioChart)      ← unchanged
└─ WorkComparisonSection            ← REPLACES PerWorkTrends
   ├─ WorkPicker                    ← grouped-by-fandom checklist + per-fandom "select all"
   ├─ DateRangeSlider               ← MUI Slider (range mode), shown only when >2 union points
   ├─ ComparisonLegend              ← title → glyph (shape+dash+color) + worded style
   ├─ MultiSeriesTrendChart (hits)  ← NEW multi-line chart
   └─ MultiSeriesTrendChart (kudos)
```

### New vs. extended: build `MultiSeriesTrendChart`, keep `TrendChart` as-is

`TrendChart` is tightly built around one `value` series plus an optional `lead` series (custom
per-series dot renderers, a two-column table, hardcoded `ink`/`accent` dots). Retrofitting it to
N dynamic series would bloat it past the 500-line `.tsx` budget and risk regressing the aggregate
charts that depend on its exact current behavior. Decision: **new `MultiSeriesTrendChart`
component**; `TrendChart`/`RatioChart` are left untouched for the aggregate section. The new
component reuses the same accessibility skeleton (`figure role="img"`, `aria-hidden` Recharts
block, sr-only markers, sr-only data table) and `useChartColors()`.

### Files (all frontend)

New:
- `frontend/src/components/WorkComparisonSection.tsx` — orchestrates selection + range state;
  renders picker, slider, legend, and the two charts. Owns the derived data.
- `frontend/src/components/WorkPicker.tsx` — the grouped picker (fieldset per fandom).
- `frontend/src/components/DateRangeSlider.tsx` — thin wrapper around MUI `Slider` (range mode),
  themed to MASTER.md tokens (see Accessibility + "MUI Slider styling" below).
- `frontend/src/components/charts/MultiSeriesTrendChart.tsx` — the multi-line chart.
- `frontend/src/components/charts/ComparisonLegend.tsx` — visible legend (also feeds the a11y
  description). May live inside `MultiSeriesTrendChart.tsx` if small; kept separate if it grows.
- `frontend/src/lib/seriesStyles.ts` — the ordered 6-slot style table (Q3: shape + dash + color
  key) + stable `workId → styleIndex` assignment helper.
- `frontend/src/lib/markerShapes.tsx` — pure SVG-path renderers for the six marker shapes
  (used by both the chart dots and the legend glyphs, so they stay identical).
- `frontend/src/lib/groupWorksByFandom.ts` — split `fandoms` on `", "`, dedupe works across
  fandom groups, sort groups + works deterministically.
- `frontend/src/lib/comparisonSelection.ts` — pure selection/window transforms (add/remove work,
  select-all-in-fandom with cap, union-dates, `>2` gate, in-window point filter). Kept pure so
  Testing can unit-test the logic without rendering.
- Storybook stories + tests for each new component (per tech stack: Storybook + Vitest).

Changed:
- `frontend/src/lib/colorTokens.ts` — extend the `ColorTokens` interface with a
  `series: readonly string[]` field (length 6) and add the light/dark categorical palettes (see
  below). This keeps chart color resolution flowing through the existing `useChartColors()` seam.
- `frontend/src/routes/DashboardPage.tsx` — delete the `PerWorkTrends` function; render
  `<WorkComparisonSection perWorkSeries={perWorkSeries} earliestPostYear={earliestPostYear} />`
  behind the existing `perWorkSeries.length > 0` guard.
- `frontend/package.json` — add `@mui/material` + `@emotion/react` + `@emotion/styled` (see
  decision B dependency note).

### Multi-series categorical palette (decision A)

Six qualitative swatches, one locked to each style slot, chosen to (1) span the color wheel for
maximum mutual distinguishability, (2) stay in/near the wine–plum brand family at the anchor
(slot 1 reuses the existing `--color-accent`; slot 5 reuses the existing `--color-growth`), and
(3) meet **WCAG 2.1 SC 1.4.11 (non-text contrast, ≥3:1)** against the relevant `--color-card`
background in each mode — this is a *line/marker* color, a graphical object, so the 3:1 non-text
bar applies, not the 4.5:1 body-text bar (1.4.3).

Contrast computed with the WCAG relative-luminance formula against `--color-card` (light
`#FFFFFF`, L=1.000; dark `#2B232A`, L=0.0188):

| slot | light hex | CR vs light card (#FFFFFF) | dark hex | CR vs dark card (#2B232A) |
|---|---|---|---|---|
| 1 wine | `#9F1239` | 8.02:1 | `#E8879E` | 6.10:1 |
| 2 teal | `#0F766E` | 5.47:1 | `#5EEAD4` | 10.32:1 |
| 3 amber | `#B45309` | 5.02:1 | `#FBBF24` | 9.14:1 |
| 4 indigo | `#4338CA` | 7.90:1 | `#A5B4FC` | 7.66:1 |
| 5 green | `#4D7C5F` | 4.81:1 | `#8FBFA0` | 7.36:1 |
| 6 purple | `#7E22CE` | 6.98:1 | `#D8B4FE` | 8.63:1 |

All twelve clear 3:1 with comfortable margin (lowest is 4.81:1). Because differentiation is
guaranteed by shape+dash, color-to-color separation is a nice-to-have, not a gate; the six hues
(wine, teal, amber, indigo, green, purple) are nonetheless well spread on the wheel. This palette
is added to `colorTokens.ts` as `LIGHT_COLOR_TOKENS.series` / `DARK_COLOR_TOKENS.series` and
documented in MASTER.md (task below). `colorTokens.ts` already warns its hexes are a duplicated
source of truth with `index.css` + MASTER.md — the new `series` array follows the same rule
(re-verify all three stay in sync if the palette changes).

### MultiSeriesTrendChart internals

- One `<Line>` per selected work: `dataKey` = that work's id, `stroke` = the work's slot color
  from `useChartColors().series[styleIndex]`, `strokeDasharray` from its slot, custom `dot`
  drawing the slot's marker shape (via `markerShapes`) filled in the same slot color,
  `connectNulls={false}`, `isAnimationActive={false}`.
- `chartData` rows keyed by the **union** of capture dates; a work with no point at a given date
  contributes `null` for its key (missing-since-work-was-added — see Corner Cases).
- Recharts block stays `aria-hidden="true"`; colors via `useChartColors()` (MASTER.md's
  SVG-can't-read-CSS-vars note already handled by that hook, now also covering `series`).
- **Visible legend** above/below the plot: each selected work as `glyph (shape+dash+color) +
  title`.
- **sr-only per-series markers**: for each work, a labeled span per real point
  (`"<title> — <capturedOn>: <value> <metric>"`), preserving the existing non-color,
  screen-reader representation pattern.
- **sr-only accessible data table (wide format)**: header `Date | <Work A> | <Work B> | …`; one
  row per union date; empty cells rendered as an explicit "—" (no data for that work at that
  date). Capped at 6 works keeps the column count navigable. `aria-label` names the metric.

### DateRangeSlider — MUI `Slider` in range mode (decision B)

Rendered as a single MUI `<Slider value={[startYear, endYear]} onChange={...} />` with
`min={earliestPostYear}`, `max={currentYear}`, `step={1}`, `marks` at each year (or a sensible
subset for long ranges), and `valueLabelDisplay="auto"`. MUI's range mode gives the dual-thumb
behavior, thumb-crossover clamping, and keyboard handling out of the box (see Accessibility).
A visible mono-font readout ("2018 – 2026") accompanies it. Shown only when the `>2` union-point
gate passes (Q5); when the selection drops below the gate the slider unmounts and the window
resets to full.

### MUI Slider styling

MUI components do **not** take Tailwind utility classes; they style via the `sx` prop / a theme.
So `DateRangeSlider` themes the Slider to MASTER.md tokens explicitly rather than inheriting
them: track/thumb/active-rail in `--color-accent`, rail in a low-opacity `--color-ink`, focus
ring matching the `.input` focus treatment (`0 0 0 3px color-mix(... accent 15% ...)`), mono
value labels. Because MUI resolves colors at render (not via CSS custom properties reliably
across its emotion cache), pass the mode-resolved hex from `useChartColors()` (or read the CSS
var once) into `sx`, consistent with how the charts already resolve theme colors. This is a real
implementation task, not a drop-in — budgeted in the task list.

### State management

Local `useState` in `WorkComparisonSection` only:
- `selectedWorkIds: number[]` (order = add order; drives stable style assignment).
- `range: [number, number] | null` (null = full range / slider hidden).

This is ephemeral, view-local UI state consumed by exactly one subtree — **not** shared/global,
so **Zustand is not warranted** (in-stack, but wrong tool here). Server data continues to come
from the existing TanStack Query hook; no new query.

### Selection / derivation flow

1. `groupWorksByFandom(perWorkSeries)` → ordered groups `{ fandom, works[] }`; a multi-fandom
   work appears in each of its groups but is one underlying work (dedupe by `ao3WorkId`).
2. `selectedWorkIds` → resolve to `PerWorkSeries[]`, each paired with its stable style slot
   (shape + dash + color).
3. Union of `capturedOn` across selected works → the date axis + the `>2` gate for the slider.
4. If a range is set, filter each work's `points` to the window; the chart re-lays-out remaining
   points on the categorical axis (`connectNulls={false}`, so gaps stay gaps).
5. Two `MultiSeriesTrendChart`s: one for `hits`, one for `kudos`, each receiving named+styled
   series.

### Design-token consistency (cited against MASTER.md)

- Lines/markers use the six-slot palette above (decision A) as a redundant channel; shape+dash
  remain the primary non-color differentiator — still satisfying MASTER.md Chart Guidance
  ("differentiated by line style, never color alone"). This **extends** MASTER.md's prior
  single-series "every other line uses `--color-ink`, one accent spent once" stance for the new
  multi-series context; that extension is documented back into MASTER.md (task below). The
  lead-in `--color-accent` dot is **not** used here (no lead-in — Q5).
- Card/chart container: existing `.card` pattern — `bg-card`, `border-ink/12`, `rounded-lg`,
  `p-6`, `hover:border-ink/24`, 200ms color/border transition (MASTER.md Cards).
- Picker checkboxes: `.input` focus pattern — `focus:border-accent` +
  `focus:ring-[3px] focus:ring-accent/15` (MASTER.md Inputs; visible `--color-accent` focus ring).
  MUI Slider focus themed to the same accent ring via `sx` (see MUI Slider styling).
- Typography: `font-display` for the section `h2`, `font-mono` (IBM Plex Mono) for axis ticks /
  numeric table cells / slider value labels, `font-sans` for labels (MASTER.md Typography).
- Spacing: existing `gap-6`/`gap-8`, `p-8` page rhythm (MASTER.md Spacing).
- No drop shadows, no transform hovers, no emoji icons — marker glyphs are SVG (MASTER.md
  Anti-Patterns).

MASTER.md currently has **no** multi-select, range-slider, or categorical-palette spec (it
predates this feature). This plan establishes those patterns grounded in the existing token set;
a **new subsection is appended to `design-system/ao3-stats-plus/MASTER.md`** documenting: the
6-slot marker/dash/color scheme + the contrast table above, the grouped-picker pattern, and the
MUI-Slider-themed-to-tokens pattern. (Task listed below.)

---

## Corner cases (deviations from the happy path that are not errors)

- **0 works selected:** charts show an empty state ("Select at least one work to compare."), not
  an empty Recharts region; slider hidden.
- **1 work selected:** single line — visually equivalent to today's per-work view.
- **Work with a single point:** a lone marker, no line segment (`connectNulls={false}`).
- **Works added at different times → ragged history:** the union date axis has dates some works
  predate; those works get `null` (chart gap) and "—" (table). This is the common real case.
- **Multi-fandom work:** appears under each of its fandom groups in the picker; checking it in
  one group reflects as checked in all (one underlying `ao3WorkId`); "select all in fandom" for
  two overlapping fandoms never double-adds.
- **Work with empty `fandoms` string:** grouped under a "No fandom" bucket rather than dropped.
- **Lossy fandom split:** a fandom *name* containing `", "` would split into two pseudo-fandom
  groups. Harmless (the work is still listed and selectable under both fragments; worst case is
  an extra group heading). Accepted limitation, **not** a backend change — recorded as a
  `TECH_DEBT.md` candidate (proper fix = store fandoms as an array/jsonb, a data-model change out
  of scope here). Flagged, not silently swallowed.
- **Cap reached (6):** remaining unchecked checkboxes become `disabled` + `aria-disabled`; a
  `role="status"` live region announces "Maximum of 6 works reached." No silent no-op. (Six is
  also the color/shape/dash slot count — no 7th style exists to assign.)
- **"Select all in fandom" that would exceed the cap:** add works up to the cap, then announce
  "Added N of M works; 6-work maximum reached." (truncation is stated, not hidden).
- **Slider threshold crossing:** if the selection drops to ≤ 2 union points, the slider unmounts
  and the window resets to full (no stale filter left applied invisibly).
- **Window excludes all of a work's points:** that work stays in the legend/selection; its line
  is simply empty in-window and its table cells all "—". (Consider a small "no points in range"
  note next to its legend row.)
- **`earliestPostYear` is null:** fall back to the earliest `capturedOn` year across selected
  works for the slider's `min`; if there is still nothing to range over, the slider stays hidden.

---

## Error states

This feature adds **no new network calls** — all data comes from the existing `statsForUser`
query, whose loading / token-mismatch / network-error states are already handled in
`DashboardPage` and unchanged. Frontend-only error surface:

- **No `perWorkSeries`:** the section is not rendered (existing `perWorkSeries.length > 0`
  guard preserved).
- **Malformed/empty `points` on a work:** the pure transforms in `comparisonSelection.ts` treat
  a work with 0 points as contributing no dates (never throws); the chart degrades to the empty
  state rather than crashing (mirrors `TrendChart`'s existing empty-`chartData` guard).
- **Range state invariants:** `range` is always clamped to `[min, max]` and to `start ≤ end`
  before use; MUI Slider enforces this at the interaction level too, but the derivation layer
  re-clamps defensively so no out-of-range window can reach the charts.

No backend error handling / logging changes (no backend work).

---

## Accessibility (first-class)

- **WorkPicker:** an outer `<fieldset>` with `<legend>` "Works to compare"; one nested
  `<fieldset>`/`<legend>` per fandom group; native `<input type="checkbox">` + `<label>` per
  work (keyboard-operable for free, correct roles). "Select all in fandom" is a real
  `<button>` (or a group checkbox with `indeterminate` state) with an accessible name naming the
  fandom. At-cap disabled checkboxes carry `aria-disabled`; the cap and truncation messages go to
  a `role="status"` polite live region.
- **DateRangeSlider (MUI `Slider`, range mode):** MUI provides the ARIA slider pattern out of the
  box — each thumb is `role="slider"` with `aria-valuemin`/`aria-valuemax`/`aria-valuenow`,
  arrow-key operability (including Home/End/PageUp/PageDown), and thumb-crossover handling. This
  project's bar is met by supplying the props MUI needs rather than assuming: **`getAriaLabel`**
  (per-thumb label, e.g. "Range start (year)" / "Range end (year)"), **`getAriaValueText`**
  (spoken value, e.g. "2018"), and a visible associated label/heading for the control. Visible
  focus is **not** free — MUI's default focus style must be themed to this project's
  `--color-accent` focus ring via `sx` (see "MUI Slider styling"); the Testing/Review bar
  explicitly checks the thumb has a visible accent focus indicator on keyboard focus. A visible
  mono readout ("2018 – 2026") backs up the value-label bubbles.
- **MultiSeriesTrendChart:** Recharts SVG `aria-hidden`; the real accessible representation is
  (a) the visible legend mapping title → glyph → worded style, (b) the sr-only per-point markers
  per work, and (c) the sr-only wide data table — none color-dependent (identity is the work's
  **title text** for AT users; shape/dash/color are visual-only reinforcements, with color the
  most redundant of the three). This preserves the existing chart-a11y contract rather than
  regressing it.
- **Dynamic-content announcement:** a `role="status"` live region summarizes the current view on
  change ("Comparing 3 works, 2018 to 2026.") so selection/range changes are perceivable to
  screen-reader users without them hunting for what moved.
- **Contrast & focus:** every interactive element keeps the visible `--color-accent` focus ring
  (MASTER.md). Line/marker colors meet WCAG 1.4.11 (≥3:1) against card in both modes (palette
  table above). Ink-on-card chart chrome reuses the already-verified `ink/card` pairs.
- **Reduced motion:** `isAnimationActive={false}` on all lines (matches existing charts). MUI
  Slider's only motion is the thumb/value-label transition; confirm it respects
  `prefers-reduced-motion` (MUI honors it by default, but verify in Testing) and disable any
  non-essential transition via `sx` if needed.
- **Automated coverage:** component-level scans via Storybook `addon-a11y`; route-level via the
  existing `@axe-core/playwright` dashboard spec, extended for the new populated states
  (including the MUI slider present).

---

## Resolved design decisions (A and B)

- **A. Redundant color channel — RESOLVED: add it.** Chart series are differentiated by the
  stable **(shape, dash, color)** triple; color is a redundant reinforcement channel, never the
  sole differentiator, so the non-color accessibility guarantee holds. The concrete
  contrast-verified 6-swatch palette is specified above ("Multi-series categorical palette") and
  is added to `colorTokens.ts` + MASTER.md.
- **B. Slider — RESOLVED: MUI `Slider` (range mode).** TECH_STACK.md pre-approves MUI
  *specifically* for "complex components ... where building from scratch isn't worth it" — a
  dual-thumb range slider with correct ARIA + keyboard + crossover handling is a textbook fit for
  that carve-out, so this is an approved in-stack choice, **not** a general-layout MUI creep.
  - **Dependency heads-up (surface to user):** MUI is *pre-approved in TECH_STACK.md* but is
    **not currently installed** — verified: no `@mui`/`@emotion`/`mui` in `frontend/package.json`,
    nothing under `frontend/node_modules/@mui`, and zero `@mui`/`@emotion` imports in
    `frontend/src`. Adopting the Slider means the **first physical install** in this codebase of
    `@mui/material` **plus its mandatory Emotion peer dependencies** `@emotion/react` and
    `@emotion/styled`. Under the letter of TECH_STACK.md, `@mui/material` is already sanctioned so
    this does not trip the tech-stack guardrail; the Emotion packages are MUI's required peers
    rather than independently listed choices. Because it is nonetheless the project's first MUI
    footprint (three new packages, a new emotion styling runtime alongside Tailwind), it is called
    out here explicitly so the user can confirm the physical install before Implementation runs
    `npm install`. This is a heads-up on scope, not a claim that the option is out-of-stack.

---

## Task list — Testing (stage 3), Implementation (stage 4), Retrospective (stage 8)

### Testing (write failing tests first, against this plan)

Pure logic (Vitest, no render):
- `groupWorksByFandom`: splits `", "`; dedupes multi-fandom works; "No fandom" bucket for empty;
  deterministic ordering; lossy-split case documented as expected behavior.
- `comparisonSelection`: add/remove work; select-all-in-fandom additive + cap-capped +
  truncation signal; no double-add across overlapping fandoms; union-dates; the `>2` gate;
  in-window point filtering; window clamping + crossover.
- `seriesStyles`: stable `workId → styleIndex` (kept on others toggling), lowest-free-index
  reuse on release, cap boundary; each slot maps to the expected (shape, dash, color) triple.

Components (Vitest + Testing Library; Storybook stories as fixtures):
- `WorkPicker`: renders grouped checkboxes; per-fandom select-all; at-cap disables remaining +
  `role="status"` announcement; multi-fandom checked-state mirrors across groups.
- `DateRangeSlider` (MUI): renders only when >2 union points; two thumbs with `role="slider"`,
  `getAriaLabel`/`getAriaValueText` present; keyboard changes value; crossover clamped; visible
  accent focus ring on focus; mono readout matches state.
- `MultiSeriesTrendChart`: N lines with distinct shape+dash+color; empty state at 0 series;
  sr-only markers per work; wide table with "—" for missing points; `aria-hidden` on the SVG
  block; legend maps title→glyph; colors resolve from `useChartColors().series`.
- `WorkComparisonSection`: defaults to one selected work; 0/1/6-work states; slider gating tied
  to selection; both hits & kudos charts render.
- `DashboardPage`: `PerWorkTrends` replaced by `WorkComparisonSection`; still guarded by
  `perWorkSeries.length > 0`; aggregate section unchanged.

E2e / a11y (Playwright + `@axe-core/playwright`):
- Extend the dashboard a11y spec for the populated comparison view (multi-select, MUI slider
  shown, 6-work cap state) — no violations.
- Keyboard walkthrough: tab into picker, toggle works, operate both slider thumbs via arrows,
  reach cap.

Regression guard:
- Existing `TrendChart`/`RatioChart` tests untouched and still green (aggregate section
  unchanged).

### Implementation (make them pass, in this order)

1. Add the categorical palette to `frontend/src/lib/colorTokens.ts` (extend `ColorTokens` with
   `series: readonly string[]`; add the six light + six dark hexes) and mirror it into MASTER.md +
   confirm parity with `index.css`.
2. `lib/seriesStyles.ts` (6-slot shape+dash+color table + stable assignment) + `lib/markerShapes.tsx`.
3. `lib/groupWorksByFandom.ts` + `lib/comparisonSelection.ts`.
4. `components/charts/MultiSeriesTrendChart.tsx` (+ `ComparisonLegend`) + stories.
5. `components/WorkPicker.tsx` + stories.
6. Install + confirm MUI: add `@mui/material`, `@emotion/react`, `@emotion/styled` to
   `frontend/package.json` (**pending the user's dependency confirmation — see decision B**);
   build `components/DateRangeSlider.tsx` as an MUI `Slider` range wrapper themed to MASTER.md
   tokens (accent track/thumb, accent focus ring, mono value labels, `getAriaLabel`/
   `getAriaValueText`) + stories.
7. `components/WorkComparisonSection.tsx` + stories.
8. Wire into `routes/DashboardPage.tsx`; delete `PerWorkTrends`.
9. Append the multi-series (shape/dash/color scheme + contrast table), grouped-picker, and
   MUI-Slider-themed-to-tokens patterns to `design-system/ao3-stats-plus/MASTER.md`.
10. Add the lossy-fandom-split note to `TECH_DEBT.md`.

Standards: `.tsx` ≤ 500 lines, `.ts` ≤ 400 (CODE_STANDARDS.md) — the component split above keeps
each file well under budget. ESLint + Prettier clean. One commit per completed task item.

### Retrospective (evaluate against, once shipped)

- Does one selection set + additive fandom bulk-select actually serve cross-fandom comparison in
  use, or did users expect replace? (Q4 revisit.)
- Is 6 the right cap in practice — too few for large fandoms, or already too busy? (Q2 revisit.)
- Color-as-reinforcement (decision A): did the palette stay genuinely redundant (shape+dash still
  carrying identity for grayscale/colorblind users), and did the six hues remain distinguishable
  in real use / both modes?
- MUI Slider (decision B): was the range UX good; did MUI's first footprint cause bundle-size,
  emotion-vs-Tailwind styling, or theming friction worth noting? Was adding the three packages
  worth it vs. the native fallback we chose against?
- Coverage of the new frontend modules against the 85% baseline.
- Did the lossy fandom split bite anyone (TECH_DEBT item), warranting the array/jsonb data-model
  fix?
- Boundary held with the separate per-work `published_on` baseline item — no accidental
  scope-bleed?

---

## Cross-references

- `docs/plans/work-page-enrichment-data-model.md` — where `published_on`/`series`/`complete`
  came from; its "toggle-graph UI is out of scope, needs its own Planning pass" note is *this*
  plan. The per-work creation-date zero-basis baseline it hints at remains a **separate** future
  item (Q5).
- `design-system/ao3-stats-plus/MASTER.md` — cited throughout; to be extended (task 9).

Infra/hosting cost: **N/A** — no new paid infrastructure.
