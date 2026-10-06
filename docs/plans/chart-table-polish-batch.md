# Plan: Chart & synced-data-table polish batch (7 items)

Status: **FINALIZED (2026-10-06) — OD-1, OD-2, and OD-2a all resolved by user.
No open or blocked decisions remain. Ready for Testing (stage 3).**

Branch: `feat/chart-table-polish` (off `main`, clean tree). Discovery was
skipped by user direction — the 7 asks are already concrete. This is a
frontend-only, UI-polish batch on an established codebase; no backend,
GraphQL, schema, or dependency change. No new paid infrastructure.

This batch extends, and must stay consistent with, the already-shipped work
in `docs/plans/chart-synced-data-table.md`,
`docs/plans/chart-axis-comparison-and-table-orientation-batch.md`,
`docs/plans/per-work-zero-basis-dates.md`,
`docs/plans/date-hierarchy-grouping.md`, and
`docs/plans/date-range-slider-month-granularity.md`. It also directly
addresses the 2026-09-25 `TECH_DEBT.md` entry on `MAX_REAL_AXIS_TICKS` being
a hardcoded-but-never-breakpoint-verified constant (item 7 below).

---

## 0. The 7 asks, mapped to concrete surfaces

| # | Ask | Primary surface |
|---|-----|-----------------|
| 1 | Comma thousands-separator on the table's comparison number | `pointComparison.ts` `deltaLabel` + the sr-only delta text in `SyncedDataTableCells.tsx` |
| 2 | Y-axis tick labels never show decimals (whole numbers only) | `YAxis` in the integer-count charts (`TrendChart`, `MultiSeriesTrendChart`); `RatioChart` excluded — see OD-1 |
| 3 | Chart is 75vh tall on tablet+ screens | `ResponsiveContainer` height wiring in all three chart components + `dateGroupingChartLayout.ts` |
| 4 | Dashed lead-in stays "cut off" at the left edge when its baseline is outside the selected date-range window | `computeLeadIn` gate in `WorkComparisonSection.tsx` + x-domain wiring in `MultiSeriesTrendChart.tsx` (tied to the date-range slider — see OD-2 / OD-2a, both resolved) |
| 5 | >30 data points ⇒ omit day-of-month from x-axis tick labels | `axisTickFormatter`/`formatTick` wiring in the three chart components |
| 6 | Never draw a marker dot on x-axis ticks | `LeadInXAxisTick.tsx` |
| 7 | >30 data points ⇒ one data-point marker dot per 20px of chart width, hardcoded per breakpoint; other points stay hoverable/clickable | new dot-density helper + a `useBreakpoint` hook; dot renderers in the three chart components |

**Scope across chart types.** Three chart components share this machinery:
`TrendChart` (aggregate hits/kudos/subscribers, numeric epoch x-axis),
`RatioChart` (kudos-to-hits ratio — a built/tested component **not currently
mounted in production**, but kept consistent with its siblings), and
`MultiSeriesTrendChart` (per-work comparison, the one chart fed by the
date-range slider). Items 3, 5, 6, 7 apply to **all three**. Item 1 is
table-only. Item 2 excludes `RatioChart` (OD-1). **Item 4 applies only to
`MultiSeriesTrendChart`**, because it is the only chart with a selectable
date-range window — see the item-4 detail and OD-2.

---

## Decisions resolved (user, 2026-10-06)

### OD-1 — item 2 (no Y-axis decimals) scope: **count charts only.** RESOLVED.
Whole-number-only Y ticks apply to the integer-count charts — the aggregate
`TrendChart`s (Total hits, Total kudos, Subscribers) and
`MultiSeriesTrendChart` (per-work hits/kudos/etc.). **`RatioChart` keeps its
decimal ticks:** the kudos-to-hits ratio is inherently fractional (~0.03–0.15)
and whole-number ticks would collapse its axis to just 0/1. (Confirms the
plan's original recommended default.)

### OD-2 — item 4 behavior: **domain-vs-rendered-range clipping, tied to the date-range slider.** RESOLVED (user verbatim):
> "when the baseline/zero-basis point is outside of the selected timeframe on
> the x axis, the zero-basis point should remain in the domain that drives
> rendering the lead in line, but as it will be outside of the rendered zone,
> only the line displays, but neither the point nor the label would display,
> as they are outside of the timeline being rendered."

This is **more specific** than the plan's original generic "decouple whether
the label renders from whether the line renders." The precise, verified
mechanism is in the item-4 detail (§4) and the corner cases (§5). In short:
the synthetic baseline point stays in the **data** that computes the dashed
line's trajectory, but the chart's **rendered x-range** is the selected
date-range window, so a baseline that falls before the window start is clipped
off the left edge — its dot and label don't render (off-range), while the
portion of the dashed line inside the window still renders, producing the
"cut off at the left edge" look.

---

## OD-2a — resolved (user, 2026-10-06): **Option B.**

The rendered x-domain of `MultiSeriesTrendChart` is
**`[windowStartEpoch, lastRealDataEpoch]`**: the **left** bound = the selected
window's start (converted to an epoch), so a baseline earlier than the window
start is clipped off the left edge and the dashed lead-in segment is visibly
cut off there; the **right** bound stays tight to the last real in-window data
point (today's behavior — no unexpected trailing whitespace). This satisfies
OD-2's clip precisely while keeping the right edge unchanged and avoiding a
drag-time scale jump.

Verified against the real code: today `MultiSeriesTrendChart` derives its
domain tightly from the **data it receives** (`[min, max]` over filtered points
+ lead-in) and has **no knowledge of the selected window** — the slider only
pre-filters points upstream in `WorkComparisonSection`. Option B therefore
requires `WorkComparisonSection` to pass the window's start epoch into the
chart and the chart to use it as the domain's left bound (keeping its existing
data-derived right bound). All of item 4 is now unblocked.

---

## 1. Happy path

A logged-in author opens their dashboard with a long capture history (say ~90
daily snapshots) and several works selected for comparison.

1. The aggregate **Total hits** chart renders. Its left (Y) axis shows clean
   whole-number gridline labels with comma grouping (e.g. `0 / 40,000 /
   80,000 / 120,000`) — never a fractional tick (item 2).
2. Because there are >30 points, the x-axis shows **no day-of-month numbers**;
   month/year context comes entirely from the existing `DateGroupingOverlay`
   month-span + year labels below the plot (item 5).
3. Still because there are >30 points, the plotted line shows a **thinned set
   of marker dots** — about one every 20px of chart width — rather than ~90
   crowded dots. The thinning count is a hardcoded value chosen by the current
   breakpoint, not a live measurement (item 7).
4. The author hovers anywhere along the line, including over a point that has
   **no visible dot**. The chart→table sync still fires (hover is resolved at
   the chart level, not per-dot), the matching table column tints, and the
   in-chart guide line + ring (`ActivePointOverlay`) still appears — every
   point remains hoverable/clickable (item 7).
5. In the **per-work comparison** section, the author drags the date-range
   slider to a window that starts *after* a work's publication date. That
   work's dashed lead-in line still renders, **clipped at the plot's left
   edge** — its baseline dot and label are off-screen (outside the rendered
   window), but the in-window portion of the dashed trajectory is drawn
   (item 4). No lead-in axis marker is drawn anywhere (item 6).
6. On a tablet or larger screen (≥768px, the project's `md` breakpoint), each
   chart is **75vh tall**; below that it keeps its current compact height
   (item 3).
7. The author pins a date and hovers another. Each table row's comparison
   delta chip reads with comma grouping (e.g. `+12,480`), as does its
   screen-reader text (item 1).

Corner/error deviations from this path are in §4 and §5.

---

## 2. Data model (backend)

**N/A.** No backend, GraphQL, schema, migration, or model change. Every value
is already present in the props the chart/table components receive. All seven
items are presentation-layer only.

---

## 3. Design-context consistency (MASTER.md)

Per `CLAUDE.md`'s "Design context" note, the existing dashboard frontend has
**not** migrated to the `design-system/ao3-stats-plus/MASTER.md` tokens — it
still uses the Bootstrap-era Tailwind utilities (`text-ink`, `text-ink-soft`,
`bg-card`, `border-ink/12`, `bg-accent/10`, `font-mono`, `useChartColors()`
hexes for Recharts). This batch is **polish on that existing surface**, so it
stays on the current utility approach and does **not** start a token
migration (same stance locked in `chart-synced-data-table.md` §1 non-goals).

Where the asks nonetheless touch visual decisions, they stay consistent with
MASTER.md's documented chart rules rather than inventing new ones:

- **Lead-in convention (items 4, 6):** MASTER.md's "signature element: the
  lead-in marker" and `.chart-leadin-connector` (dashed `--color-ink-soft`,
  `4 4`) describe the dashed connector. Item 6 removes the *axis-tick* marker
  glyph (a separate mark introduced later by `LeadInXAxisTick.tsx`), not the
  connector itself, and not the on-line lead-in dot. The dashed connector is
  unchanged; item 4 only changes whether its baseline endpoint falls inside
  the rendered range.
- **Axis tick text (items 2, 5):** stays `font-mono`, `12px`, `--color-ink-soft`
  — the existing tick styling. Item 5 removes *content* (the day number), not
  styling; item 2 changes the *number format*, not styling.
- **Data-point markers (item 7):** no change to the 10-slot shape+color
  scheme (`seriesStyles.ts`) or `renderMarkerShape`. Thinning only changes
  *how many* of a series' own markers draw, never their shape/color/size — so
  MASTER.md's "shape is the non-color channel" guarantee is untouched (every
  series still renders its own distinct shape wherever a dot draws, and the
  table row header's glyph+identityDescription still carries full per-series
  identity regardless of dot thinning).
- **Comparison delta (item 1):** the delta chip keeps its valence color
  (`text-growth`/`text-destructive`/`text-ink-soft`) and sign prefix — the
  non-color channel. Only the digit grouping changes.

No new UI surface of visual consequence is introduced (no new page, no new
component with novel layout), so no new design-context snapshot pass is
required — this augments existing, already-designed surfaces. Height (item 3)
is the one spatial change; see §4 item 3 for how it preserves the existing
axis-band layout.

---

## 4. Frontend design (file-level approach)

### 4.0 Component tree (unchanged shape)

```
DashboardPage
  ├─ MetricToggle → TrendChart           (aggregate hits / kudos / subscribers) ← items 2,3,5,6,7
  └─ WorkComparisonSection               ← item 4 (computeLeadIn gate + window→chart)
       ├─ DateRangeSlider                (the window source for item 4)
       └─ MetricToggle → MultiSeriesTrendChart (per-work compare)  ← items 2,3,4,5,6,7
            └─ SyncedDataTable → SyncedDataTableCells (DataCell)    ← item 1
(RatioChart: built/tested/storied but not mounted in production; gets items
 3,5,6,7 for consistency, excluded from item 2 per OD-1, N/A for item 4 — no
 window.)
```
No call site is removed. `MultiSeriesTrendChart` gains one new prop for item 4
(the rendered window, per OD-2a). One new hook (`useBreakpoint`) and one new
pure helper (dot-density sampling) are added under `frontend/src/lib/`.

### 4.1 New files

| File | Purpose | Budget |
|---|---|---|
| `frontend/src/lib/useBreakpoint.ts` | `useSyncExternalStore` + `matchMedia` hook returning the active tier (`"base" \| "md"`), mirroring `useChartColors.ts`'s exact subscribe/getSnapshot pattern. SSR/no-matchMedia safe (returns `"base"`). | `.ts` 400 |
| `frontend/src/lib/chartDotDensity.ts` | Pure helper: `selectVisibleDotIndices(pointCount, maxDots)` → `Set<number>` of evenly-sampled indices (edges always kept, same algorithm shape as `selectDisplayedTicks`); plus `PLOT_WIDTH_BY_BREAKPOINT` constants and `maxDotsFor(breakpoint)`. No React import — unit-testable in isolation. | `.ts` 400 |

Keeping item 7's logic in a standalone pure module (not inline) is a
deliberate file-length decision: `MultiSeriesTrendChart.tsx` is already at 478
of its 500-line `.tsx` budget (verified), and item 4 also adds to it.

### 4.2 Changed files

| File | Change |
|---|---|
| `frontend/src/lib/pointComparison.ts` | **Item 1.** `deltaLabel` formats the magnitude with comma grouping via the shared `formatNumber` (e.g. `+12,480` / `-1,205`), preserving the explicit sign. Import `formatNumber`. |
| `frontend/src/components/charts/SyncedDataTableCells.tsx` | **Item 1.** The sr-only delta text (`… ${valenceWord} of ${Math.abs(result.delta)}`) also uses `formatNumber(Math.abs(result.delta))` so the spoken number matches the visible chip. |
| `frontend/src/lib/formatNumber.ts` | **Item 2.** Add a sibling `formatWholeNumber(value)` = `Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 })`. Keep the existing `formatNumber` as-is (still used by cells and the ratio axis). |
| `frontend/src/components/charts/TrendChart.tsx` | Items 2, 3, 5, 7. (Item 4 N/A — no window; see item-4 detail.) |
| `frontend/src/components/charts/RatioChart.tsx` | Items 3, 5, 7. (Item 2 excluded per OD-1; item 4 N/A.) |
| `frontend/src/components/charts/MultiSeriesTrendChart.tsx` | Items 2, 3, 4, 5, 7 — new logic delegated to helpers to respect the 500-line budget. Gains a `windowStartEpoch` prop for item 4 (OD-2a = Option B). |
| `frontend/src/components/WorkComparisonSection.tsx` | **Item 4.** Relax `computeLeadIn`'s window-start drop-gate; pass the rendered window (per OD-2a) into `MultiSeriesTrendChart`. |
| `frontend/src/components/charts/multiSeriesDots.tsx` | **Item 7.** `createSeriesDot` gains a `visibleIndices` param. `createLeadInDot` unchanged. |
| `frontend/src/components/charts/LeadInXAxisTick.tsx` | **Item 6.** Remove the `<circle>` marker branch; drop the now-unused `markerColor` param. |
| `frontend/src/components/charts/chartTimeAxis.ts` | **Item 5.** Add `DAY_TICK_SUPPRESSION_THRESHOLD = 30` next to `MAX_REAL_AXIS_TICKS`; `formatDayTick` unchanged (suppression wired at call sites). |
| `frontend/src/components/charts/dateGroupingChartLayout.ts` | **Item 3.** Express the height so a responsive container can grow the plot while preserving the fixed axis-band reservation. |

### Item-by-item detail

**Item 1 — comma on the comparison (delta) number.**
Verified: the table's *cell values* already comma-group (via `formatCellValue`
→ `formatNumber`, `SyncedDataTableCells.tsx:31`). The gap is the
**pin-comparison delta chip**: `deltaLabel` (`pointComparison.ts:93`) returns
`` `+${delta}` `` with raw digits, and the sr-only text uses
`Math.abs(result.delta)` raw (`SyncedDataTableCells.tsx:240`). Both become
`formatNumber`-grouped. `deltaLabel` is a pure function with one caller
(`DataCell`), so the change is localized; its `pointComparison.test.ts`
expectations update (`+10` stays `+10`; `+12480` → `+12,480`).

**Item 2 — Y-axis whole numbers only (count charts; NOT ratio, per OD-1).**
A formatter alone is insufficient: Recharts generates the tick *values* from
the domain, so a small-max series yields fractional tick values
(`0, 1.25, 2.5, …`) a formatter would round to duplicate labels. Approach for
`TrendChart` and `MultiSeriesTrendChart`:
1. `YAxis tickFormatter={formatWholeNumber}` so no label shows a decimal.
2. `allowDecimals={false}` on the `<YAxis>` (verified public API in
   recharts@3.10.0) so Recharts' tick generator produces integer ticks only.
3. Cross-check during Testing that `allowDecimals={false}` composes cleanly
   with the explicit `domain={yDomain}` already set (the `niceCeiling` ceiling
   is already integer for count data).
`RatioChart` is **not changed** for item 2 — keeps `formatNumber` + decimals.

**Item 3 — 75vh on tablet+.**
`ResponsiveContainer` currently gets a fixed `height={CHART_CONTAINER_HEIGHT}`
(300px = 240 plot band + 60 axis band). To make the whole figure 75vh at ≥768px
while keeping the axis-band reservation intact:
- Wrap `<ResponsiveContainer>` in a `<div className="h-[300px] md:h-[75vh]">`
  (300px = today's compact total; `md:` = 768px, the project's existing
  tablet breakpoint — used in `WorkComparisonSection`'s `md:grid`; Tailwind v4
  default `md` = 48rem, no custom `--breakpoint-*` in `index.css`).
- Set `<ResponsiveContainer width="100%" height="100%">`.
- `DateGroupingOverlay`/`ActivePointOverlay` read the real plot rect via
  `usePlotArea()`/`useXAxisScale()`, so a taller plot needs no overlay math
  change; `X_AXIS_BAND_HEIGHT` (passed to `<XAxis height>`) keeps the
  month/year band's fixed pixel budget.
- **jsdom/test note:** `75vh` is a wrapper CSS class, not a prop jsdom
  resolves; the chart tests' `ResizeObserver`/`offsetWidth`/`offsetHeight`
  stub still drives Recharts' layout. Assert the class string (as
  `WorkComparisonSection.test.tsx` already does for `md:grid`), not a computed
  pixel height — keeps overlay/sync tests stable.
- `CHART_CONTAINER_HEIGHT` is retained as the base (300px) value feeding the
  wrapper's base class; `X_AXIS_BAND_HEIGHT`/`DAY_TICK_MARGIN` unchanged.

**Item 4 — dashed lead-in clips at the left edge when its baseline is outside
the selected window (RESOLVED OD-2; domain framing per OD-2a).**
*Scope: `MultiSeriesTrendChart` only.* Verified reality:
- The date-range slider has exactly one production path:
  `WorkComparisonSection` → `MultiSeriesTrendChart` (confirmed in
  `date-range-slider-month-granularity.md` and by grep). The aggregate
  `TrendChart`s have no window, and `RatioChart` isn't mounted — so for those
  charts there is no "selected timeframe," the baseline is always within the
  rendered range, and item 4 is a **no-op** (their lead-in keeps rendering at
  the domain minimum exactly as today; item 6 only removes its axis-tick
  marker). Testing must not assert clipping on `TrendChart`/`RatioChart`.
- `WorkComparisonSection.computeLeadIn` currently **drops the lead-in
  entirely** when `monthIndexOf(zeroBasisDate) < effectiveRange.start`
  (`WorkComparisonSection.tsx:98`) — a *deliberate* decision in
  `per-work-zero-basis-dates.md` and `date-range-slider-month-granularity.md`.
  OD-2 reverses that decision.
- `WorkComparisonSection.buildSeries` pre-filters each work's points via
  `filterPointsInWindow(work.points, effectiveRange)` and passes only
  in-window points to the chart. `MultiSeriesTrendChart` then computes its
  XAxis `domain={[Math.min(...xEpoch), Math.max(...xEpoch)]}` from the data it
  receives — it has **no window knowledge today**.

Mechanism (the OD-2a-independent parts first):
1. **Relax the drop-gate** (`computeLeadIn`): remove the
   `monthIndexOf(zeroBasisDate) < effectiveRange.start` early return so a work
   whose baseline precedes the window start **still gets a `leadIn`**. Keep the
   other two guards unchanged: no lead-in when the work has zero visible points
   (`visiblePoints.length === 0`), and the degenerate guard
   (`zeroBasisDate >= firstVisiblePoint.capturedOn`) that avoids a
   zero-width/backwards segment.
2. **Keep the baseline point in the chart data.** `buildChartData` already
   injects the lead-in's `capturedOn` into the union and places it at its
   `xEpoch` (a publish-date baseline at its true `toEpoch`; an estimated
   baseline at the bounded offset before the first real point). No change
   needed here — the baseline row drives the dashed `lead-${id}` line's
   trajectory whether or not it falls inside the rendered range.
3. **Set the rendered x-domain to clip the baseline off the left** (OD-2a =
   Option B). `WorkComparisonSection` passes the selected window's **start** as
   an epoch into the chart (a `windowStartEpoch?: number` prop derived from
   `effectiveRange.start` via `fromMonthIndex` → `Date.UTC`).
   `MultiSeriesTrendChart` sets its XAxis `domain` to
   `[windowStartEpoch, Math.max(...xEpoch)]` — the **left** bound is the window
   start, the **right** bound stays the existing data-derived maximum (the last
   real in-window point). When `windowStartEpoch` is absent (the aggregate
   charts never pass it) the chart keeps its current
   `[Math.min(...xEpoch), Math.max(...xEpoch)]` framing unchanged. Recharts
   then clips any point left of `windowStartEpoch` (the baseline) out of view:
   its series dot isn't drawn (off-domain), its axis tick isn't drawn
   (off-domain), and only the segment of the dashed line inside the window
   renders — the "cut off at the left edge" appearance.
4. **No new label/marker code for the clipped baseline** — it simply falls
   outside the domain. Item 6 independently removes the lead-in axis-tick
   marker for the in-window case too.

Interaction with the caption: removing the drop-gate means
`hasRenderedLeadIn` (the "Dashed segments show the period before your first
captured stats" caption) will now be true whenever a baseline exists before
the first visible point — including when that baseline is clipped off-screen.
That is correct (the clipped dashed line is visible and the caption explains
it), but Testing should assert the caption's new visibility semantics.

**Item 5 — omit day-of-month when >30 points.**
Each chart computes `pointCount` (real plotted points: TrendChart/RatioChart
`points.length`; MultiSeriesTrendChart the count of distinct real capture
dates in the union, i.e. non-zero-basis rows — matching what the user sees as
"data points"). When `pointCount > 30`, the real-tick `formatTick` returns
`""` (no day number), so the x-axis shows only `DateGroupingOverlay`'s
month/year marks; at `<= 30`, unchanged (`formatDayTick`). Both `formatTick`
and `axisTickFormatter` return `""` for suppressed ticks (zero-width,
consistent with the lead-in's existing treatment). `MAX_REAL_AXIS_TICKS`
sampling still runs; above the threshold those candidates just render no text.
Threshold `30` is `DAY_TICK_SUPPRESSION_THRESHOLD` in `chartTimeAxis.ts` so all
three charts agree and it's tested in one place.

**Item 6 — never a marker dot on x-axis ticks.**
`LeadInXAxisTick.tsx` currently renders a `<circle>` (r 3.5, `markerColor`) for
any lead-in tick. Remove that branch; the function becomes "render real-point
`<Text>` (per item 5) or nothing." Remove the dead `markerColor` param from
`createLeadInXAxisTick` and update the three call sites (TrendChart/RatioChart
passed `colors.accent`; MultiSeriesTrendChart `colors.inkSoft`). Unconditional
(all point counts, all charts). Scope boundary: this is the *axis-tick* marker
only — the lead-in's **on-line anchor dot** (the `lead` line's `dot` /
`createLeadInDot`) is a data-point marker on the plotted line, not an axis
mark, and is **not** removed by item 6.

**Item 7 — thin on-line data-point dots to ~1 per 20px, hardcoded per
breakpoint.**
- `chartDotDensity.ts` defines hardcoded **plot-width** constants per
  breakpoint (NOT a live measurement — the explicit ask, and the retirement of
  the 2026-09-25 `MAX_REAL_AXIS_TICKS` single-constant tech-debt pattern):
  `PLOT_WIDTH_BY_BREAKPOINT = { base: 280, md: 700 }` (px). Grounding: card is
  `max-w-4xl p-8` → `p-6` card → ~780px content minus Y-axis ≈ ~700px plot at
  `md`; below `md`, ~375px viewport → ~280px plot. **Approximations — must be
  sanity-checked in Preview against a real production build** (same caveat the
  tech-debt entry demands); easy to tune (named constants).
- `maxDotsFor(bp) = Math.floor(PLOT_WIDTH_BY_BREAKPOINT[bp] / 20)` → base 14,
  md 35.
- `selectVisibleDotIndices(pointCount, maxDots)`: if `pointCount <= maxDots`
  return "all"; else evenly sample `maxDots` indices across `[0, pointCount-1]`,
  always including first and last (edge-preserving, like `selectDisplayedTicks`).
- `>30` gate: thinning engages only when `pointCount > 30`. (Note
  `maxDotsFor("md") = 35 > 30`, so a 31–35 point series shows all dots on wide
  screens anyway; the gate bites on `base` (max 14) and for >35 points.)
- Each chart resolves its breakpoint via `useBreakpoint()`, computes the
  visible-index set, and passes it to the `value`/`ratio`/`work-*` line's `dot`
  renderer, which draws a marker only for indices in the set (empty `<g>`
  otherwise — today's skip path). MultiSeriesTrendChart keys the set off each
  series' own point count (its own line's dots).
- **Hoverability unaffected:** hover/click sync is resolved at the
  `<LineChart onMouseMove/onClick>` level via `activeLabel`→`resolveDateKey`,
  not per-dot (verified in all three components). A dot-less point is still on
  the line, still resolves on hover, still tints its table column, still gets
  the `ActivePointOverlay` ring, and still has a table column. Testing must
  prove this (hover a thinned-out point's x-position; assert its date resolves).

---

## 5. Corner cases (deviations from happy path, not errors)

- **Exactly 30 / 31 points:** item 5 and item 7 gates are strict (`> 30`); 30
  shows day numbers + all dots, 31 suppresses days and (on `base`) thins dots.
  Boundary tests at 30 and 31.
- **Few points (<= maxDots):** `selectVisibleDotIndices` returns all-visible;
  single/two-point series unaffected.
- **Item 4 — baseline *inside* the selected window:** `computeLeadIn` still
  returns the lead-in (it always did for this case); the baseline sits inside
  the domain and renders normally (its on-line dot shows; after item 6 no axis
  marker). Under Option B the baseline renders slightly inset from the left
  edge (at its own epoch ≥ `windowStartEpoch`) rather than exactly at the edge
  as today — a minor, accepted framing nuance.
- **Item 4 — window excludes the baseline (the OD-2 case):** baseline stays in
  the data, clipped off the left; only the in-window dashed segment shows; the
  caption shows. Estimated-baseline (non-publish) lead-ins sit at a bounded
  offset near the first real point, so they rarely fall before the window
  start — this clip chiefly affects real publish-date baselines (a work
  published years before capture), which is the user's scenario.
- **Item 4 — window excludes *all* of a work's real points:**
  `visiblePoints.length === 0` → no lead-in (unchanged guard); that work
  simply has no line in that window.
- **Breakpoint change at runtime (resize across 768px):** `useBreakpoint`
  re-renders via `matchMedia` `change` (like `useChartColors`); the dot set
  recomputes. Height flips via CSS alone.
- **`prefers-color-scheme` change:** unchanged; colors still flow from
  `useChartColors`.
- **Delta of 0 / small delta (item 1):** `deltaLabel(0)` stays `"0"`; `+10`
  unchanged; only 4+ digit magnitudes gain a comma.
- **Ratio chart (OD-1):** keeps decimal ticks; unaffected by item 2.

---

## 6. Error states

Frontend-only; no network/data paths added, so no new fetch/error handling.
The existing `DashboardPage` token-mismatch/5xx/loading branches are untouched.
Defensive (pure-client) behaviors:

- `useBreakpoint` with no `window`/`matchMedia` returns `"base"` — never throws
  (mirrors `useChartColors`'s guard).
- `selectVisibleDotIndices` guards `pointCount <= 0` / `maxDots <= 0` (no
  divide-by-zero, no `NaN` indices).
- `formatWholeNumber(NaN)`/non-finite: guard to a stable string rather than
  leaking `"NaN"` onto an axis (matches `formatDayTick`/`toEpoch` precedent).
- **Item 4 window→epoch conversion:** `effectiveRange` is already NaN-guarded
  upstream in `WorkComparisonSection` (the 2026-10-01 adversarial-review
  hardening). The new epoch conversion (`fromMonthIndex` → `Date.UTC`) must
  tolerate a degenerate/empty window without throwing; if the window can't be
  formed, omit `windowStartEpoch` so the chart falls back to today's
  data-derived `[Math.min(...xEpoch), Math.max(...xEpoch)]` domain (Option B)
  and never renders blank.
- **Item 4 regression fence:** a test asserts that, with a window excluding the
  baseline, the dashed `lead` line is present AND the baseline's dot/axis tick
  are NOT rendered — so a future refactor can't silently either drop the line
  or un-clip the baseline.
- `deltaLabel` with a non-finite delta: unreachable; `formatNumber` tolerates
  it as the cells already do.

No logging or retry/recovery semantics apply (no I/O).

---

## 7. Accessibility (first-class)

- **Item 1 (delta sr-only text):** the spoken delta magnitude is formatted the
  same way as the visible chip, so SR output and visible text agree. Valence
  word + sign preserved (non-color channel). No `aria-live` (hover/pin cue).
- **Item 2:** Y-axis ticks are decorative inside the `aria-hidden` SVG; the
  accessible number source is the visible `SyncedDataTable` (unchanged).
- **Item 3 (height):** no semantic/focus change; a taller figure is still one
  `role="img"` figure with the same labelling. Confirm axe stays green at the
  taller size, light + dark.
- **Item 4 (clipped baseline):** lives inside the `aria-hidden` SVG. The
  accessible representation of the baseline is the visible table's lead-in
  **column** (full estimated-baseline / "Published …" label) — which is
  **unaffected by visual clipping**: the table still lists the baseline column
  with its full label even when the chart clips its dot off-screen. Verify the
  table still carries that column after the drop-gate is relaxed. Option B
  clips the baseline *visually* only — it must NOT drop the baseline *column*
  from the table model when the baseline is outside the window; that would be
  an AT regression. Keep the baseline in the table model regardless of visual
  clipping; confirm in Testing.
- **Items 5/6 (axis marks):** inside `aria-hidden`; the table column headers
  carry dates/labels. Removing day numbers and the lead-in axis marker removes
  nothing from the AT layer.
- **Item 7 (dot thinning):** critical — thinning *visual* dots must not reduce
  AT or keyboard/pointer information. It doesn't: every point stays a table
  column (AT-navigable), stays hoverable (chart-level sync), and per-series
  identity (shape+color glyph + `identityDescription`) lives in the table row
  header independent of dot count. "Shape is the channel" preserved (dots that
  *do* draw keep their series shape).
- **Contrast:** no new colors; existing tokens retain verified contrast.
- **Regression gate:** `frontend/tests/accessibility.spec.ts` green light + dark
  on the populated dashboard (>30 points so items 5/7 active, and a windowed
  comparison with a clipped lead-in so item 4 active), plus Storybook
  `addon-a11y` on the updated stories.

---

## 8. Task list (Testing → Implementation → Retrospective)

Test-first: Testing writes these red against this plan; Implementation makes
them green. One commit per completed item (`CODE_STANDARDS.md`). No decisions
are open or blocked — the full batch (including item 4's domain change, OD-2a =
Option B) is ready for Testing.

### Testing (stage 3) — write failing tests

- **T1 (item 1):** `pointComparison.test.ts` — `deltaLabel(12480)==="+12,480"`,
  `deltaLabel(-1205)==="-1,205"`, `deltaLabel(10)==="+10"`, `deltaLabel(0)==="0"`.
  `SyncedDataTable.pinDelta.test.tsx` / `SyncedDataTable.numberFormatting.test.tsx`
  — rendered chip + sr-only text both group a 4+ digit delta; small deltas
  unchanged.
- **T2 (item 2, OD-1):** `TrendChart.yAxisRounding.test.tsx` (extend) +
  MultiSeriesTrendChart — small-max fixture (1,2,3) renders only integer Y
  labels (no `.`); large fixture (141,554) shows comma-grouped integer labels;
  `allowDecimals={false}` produces no fractional tick values. **RatioChart test
  asserts its ticks stay fractional/unchanged (OD-1).** Include a
  large/non-round-magnitude case (2026-09-25 test-convention nudge).
- **T3 (item 3):** the three charts render the wrapper with `className`
  containing `h-[300px]` and `md:h-[75vh]`, and `ResponsiveContainer
  height="100%"`; overlay/sync tests still pass under the stubbed layout size.
  Assert via class string, not computed px.
- **T4 (item 4) — all unblocked (OD-2a = Option B):**
  - `WorkComparisonSection` leadIn tests — a work whose baseline month precedes
    `effectiveRange.start` now **still** yields a `leadIn` (drop-gate removed),
    while the zero-points and degenerate guards still suppress it; the
    caption's visibility follows. Assert `WorkComparisonSection` passes a
    `windowStartEpoch` derived from `effectiveRange.start`. Assert
    `TrendChart`/`RatioChart` are **not** given any window/clip behavior
    (item 4 N/A for them — no `windowStartEpoch` prop).
  - `MultiSeriesTrendChart` domain/clip tests — the XAxis `domain` left bound
    equals `windowStartEpoch` and the right bound equals the last real data
    epoch (`Math.max(...xEpoch)`); with a window that **excludes** the baseline
    the dashed `lead` line renders while the baseline's series dot AND axis tick
    do **not** render (clipped off-domain-left); with a window that
    **includes** the baseline the lead-in renders inset at its own epoch; with
    **no** `windowStartEpoch` prop the domain stays
    `[Math.min(...xEpoch), Math.max(...xEpoch)]`. Plus the §6 regression fence
    and the §7 "baseline column still in the table model" assertion.
- **T5 (item 5):** >30-point fixture ⇒ zero day-number tick texts (only
  `DateGroupingOverlay` marks remain); 30-point ⇒ day numbers present; boundary
  30 vs 31; all three charts.
- **T6 (item 6):** no `<circle>` in `.recharts-xAxis-tick-labels` for a lead-in
  slot, any chart/point count. **Invert** the existing
  `*.leadInAxisMarker.test.tsx` / `*.leadInTickClipping.test.tsx` assertions
  (they currently expect exactly one marker → now zero). Real-point day text
  still renders at `<=30` points.
- **T7 (item 7):** `chartDotDensity.test.ts` (edge-keeping + even sampling;
  `maxDotsFor`; `<=30`/`>30` gating). Component test: a >30-point (and, on a
  `base`-mock, >14-point) series renders ~plotWidth/20 dots incl. first+last,
  AND hovering/activating a thinned-out point's x-position still resolves its
  `activeDateKey` and tints its table column. `useBreakpoint.test.ts` —
  matchMedia tier switching + SSR/no-matchMedia default.
- **T8 (stories + axe):** dense (>30-point) stories for all three charts plus a
  windowed-clip comparison story so `addon-a11y` scans items 4/5/7; extend
  `accessibility.spec.ts` for the populated dense + windowed dashboard, light +
  dark.

### Implementation (stage 4) — make them pass, in this order

- **I1 (item 1):** grouped `deltaLabel` + sr-only magnitude.
- **I2 (item 6):** strip the marker branch + `markerColor` param from
  `LeadInXAxisTick.tsx`; update the three call sites.
- **I3 (item 5):** `DAY_TICK_SUPPRESSION_THRESHOLD`; wire
  `pointCount > 30 ? "" : formatDayTick` into each chart's
  `formatTick`/`axisTickFormatter`.
- **I4 (item 4, unblocked part):** remove the `computeLeadIn` drop-gate; keep
  the zero-points + degenerate guards; verify the caption + table-column
  behavior.
- **I5 (item 4, domain change — OD-2a = Option B):** add a `windowStartEpoch`
  prop + the `effectiveRange.start`→epoch conversion (`fromMonthIndex` →
  `Date.UTC`) in `WorkComparisonSection`; set `MultiSeriesTrendChart`'s XAxis
  `domain` to `[windowStartEpoch, Math.max(...xEpoch)]` when the prop is
  present, falling back to today's `[Math.min(...xEpoch), Math.max(...xEpoch)]`
  when it's absent or the window can't be formed (§6 fallback). Keep
  `MultiSeriesTrendChart.tsx` under 500 lines (delegate to helpers; re-check at
  commit).
- **I6 (item 3):** `dateGroupingChartLayout.ts` height split; wrapper
  `h-[300px] md:h-[75vh]`; `ResponsiveContainer height="100%"` in all three.
- **I7 (item 7):** `useBreakpoint.ts`; `chartDotDensity.ts`; thread the
  visible-index set through `multiSeriesDots.createSeriesDot` and the inline
  TrendChart/RatioChart dot renderers.
- **I8 (item 2, OD-1):** `formatWholeNumber`; `allowDecimals={false}` +
  `tickFormatter={formatWholeNumber}` on `TrendChart` + `MultiSeriesTrendChart`
  YAxis (NOT RatioChart).
- **I9:** update stories + mocks; ESLint/Prettier; axe green light + dark;
  confirm every touched `.tsx` ≤ 500 lines, `.ts` ≤ 400.

### Retrospective (stage 8) — evaluate against

- **R1:** Did `PLOT_WIDTH_BY_BREAKPOINT` match reality in Preview, or need
  tuning? Did this batch actually *retire* the 2026-09-25 `MAX_REAL_AXIS_TICKS`
  single-unverified-constant pattern per breakpoint, or just relocate it?
  Update/close that TECH_DEBT entry.
- **R2:** Is `>30` the right cut-over for day-number suppression once seen on
  real history?
- **R3:** Did item 2's OD-1 scope hold — any surprise on the (unmounted) ratio
  axis if/when it's mounted?
- **R4:** Did Option B's framing read well on real windowed comparisons
  (left-edge clip, right edge tight to data, scale stability while dragging)?
  Was the baseline kept in the table model (no AT regression)?
- **R5:** Coverage of `useBreakpoint`, `chartDotDensity`, and the new item-4
  branches vs. the 85% baseline.
- **R6:** Did `MultiSeriesTrendChart.tsx` stay under 500 lines, or did items
  4+7 finally force a split?
- **R7:** Did `md`/75vh read well on real tablets, or need a max-height clamp /
  different breakpoint?

---

## 9. Infra / hosting cost estimate

**N/A** — no new paid infrastructure, no new dependencies, no backend change.
Frontend-only; ships through the existing Render static-site pipeline.

---

## 10. Non-goals

- No design-token (MASTER.md) migration of the existing dashboard — polish only.
- No change to the 10-slot shape+color scheme, CVD gate, sparse-gap semantics,
  the x-axis scale *type*, or the date-range slider's own control/granularity.
  (Item 4 changes how `MultiSeriesTrendChart` *uses* the window for its domain;
  it does not change the slider widget or `filterPointsInWindow`.)
- No new charting/table dependency (Recharts 3.10.0 + current Tailwind only).
- No backend/GraphQL/schema/data-model change.
- Item 7 introduces no runtime plot-width *measurement* — hardcoded per
  breakpoint by explicit requirement.
