# Visual date-hierarchy grouping (year/month/day) — chart x-axis + synced table

Status: **FINALIZED (2026-09-26) — ready for Testing (stage 3).** The visual design was LOCKED by the 2026-09-26 design-options session; the two implementation forks the ROADMAP text left open (D1/D2) are now resolved by direct user answer — see "Decisions resolved" at the end. No open/pending items remain.

Stage 2 (Planning) artifact. Feeds Testing (stage 3) then Implementation (stage 4).

- **Feature source**: `ROADMAP.md`, "Visual date-hierarchy grouping (year/month/day)" —
  **DESIGN CONFIRMED 2026-09-26** (dedicated design-options Artifact session; visual design
  is LOCKED, not reopened by this plan).
- **Composes with**: `docs/plans/chart-axis-comparison-and-table-orientation-batch.md`
  (real-elapsed-time x-axis, `selectDisplayedTicks`/`interval={0}` round-5 fix `bb1dd7d`,
  table orientation toggle) and `docs/plans/chart-synced-data-table.md` (the synced table,
  `ActivePointOverlay`).
- **Non-goals**: no new charting/table dependency (plain SVG + HTML/Tailwind only, Recharts
  unchanged); no migration to MASTER.md design tokens (style with the live
  `frontend/src/lib/colorTokens.ts` slate/`useChartColors` approach); no change to the
  hard-won tick-selection machinery.

---

## 0. Architecture decision (primary candidate, adopted)

**Adopted: additive independent SVG overlay for the chart marks; a shared pure hierarchy
model for the table.** This is the "augment, don't touch the axis tick machinery again"
posture the task mandates, and it is the same pattern `ActivePointOverlay.tsx` already ships.

Verified against the installed **recharts@3.10.0** source (not inferred):

1. **Scale hooks are safe and already in use.** `useXAxisScale()`/`useYAxisScale()`/
   `usePlotArea()` (hooks.js, since 3.8/3.1) return the underlying d3 scale's `.map`
   function and the inner plot rect. `ActivePointOverlay` already resolves data values to
   pixels this exact way and ships today. The new overlay reads the same hooks — it never
   asks Recharts to render an axis tick.
2. **d3 scales do NOT clamp** (hooks.js returns `scale.map`; the scale is a plain
   `scaleTime`/`scaleLinear`). `scale(epochOutsideDomain)` extrapolates to a pixel outside
   the plot range. **Consequence, load-bearing for this design:** every x-position the
   overlay draws is derived from an **actual plotted point's `xEpoch`** (guaranteed in the
   `[domainMin, domainMax]` domain), never from a synthesized `Jan 1` boundary that could
   fall outside the domain. Year rules are placed at the **midpoint between the last point
   of year N and the first point of year N+1** (both in-domain → midpoint in-domain). Month
   spans run from the first to the last point of the month group (both in-domain). No
   position is ever extrapolated; as an additional guard the overlay skips any computed x
   that falls outside `[plotArea.x, plotArea.x + plotArea.width]`.
3. **Custom children are not clipped.** Recharts renders custom/`Customized` children inside
   a `<Layer>` (`<g>`) with no `clipPath` unless one is passed (Customized.js → Layer). So
   the overlay `<g>` may draw in the axis band **below** the plot area (where the month
   abbrev row and year label row live) without being clipped. `ActivePointOverlay` only ever
   draws inside the plot rect, so this specific below-plot drawing is newly exercised — it is
   sound per source, and is called out as a Preview-verification item (§9) consistent with
   this project's "verify in real Preview" precedent.
4. **`interval={0}` is untouched.** The overlay reads the full `chartData` (every point) to
   compute year/month groups. It is **completely independent** of `selectDisplayedTicks` and
   its `MAX_REAL_AXIS_TICKS=6` cap: the sampled day ticks are unchanged, and month/year marks
   are drawn for every month/year actually present regardless of how many day ticks were
   sampled. **This plan does not modify `selectDisplayedTicks`, `interval={0}`,
   `LeadInXAxisTick`'s marker path, or Recharts' `getTicks` interaction in any way** — it only
   (a) adds a sibling overlay and (b) changes the *text* a real day tick prints (full ISO →
   day-of-month), which under `interval={0}` cannot affect tick filtering (filtering is
   already bypassed; tick-label width is no longer consulted).

**Rejected alternative:** extending the XAxis custom `tick` renderer (`LeadInXAxisTick`) to
paint multi-tier year/month marks. Rejected because (a) spanning marks (a month span line, a
year rule) are not per-tick and don't map onto a per-tick renderer; (b) it would re-entangle
new geometry with the exact `getTicks`/`tickFormatter`-width machinery that took five rounds
to stabilize; (c) month/year marks must reflect *all* data, not just the ≤6 sampled ticks.

---

## 1. Happy path (end to end)

Account dashboard, "Total hits" `TrendChart`, data = a 2014 estimated-baseline lead-in plus a
dense July–August 2026 daily cluster (the account's real hard case used in the mockup).

**Chart (visual, `aria-hidden`):**
1. Chart renders exactly as today: real-elapsed-time x-axis, ≤6 sampled day ticks via
   `selectDisplayedTicks` + `interval={0}`, lead-in marker via `LeadInXAxisTick`.
2. The new `DateGroupingOverlay` (sibling of `ActivePointOverlay` inside `<LineChart>`) reads
   `usePlotArea()`/`useXAxisScale()` and the chart's `{capturedOn, xEpoch}` rows.
3. It computes the date hierarchy from `buildDateHierarchy(...)` (§3) over all rows.
4. For **each month present** (incl. the single-point 2014 month), it draws a short horizontal
   span line just below the plot bottom running from the month group's first-point pixel to its
   last-point pixel (collapsing to a single x for a one-point month), with the month abbrev
   ("Sep", "Jul", "Aug") centered above the span line, above the day ticks. A single-point
   month still gets its label — never blank.
5. For **each year boundary** (where the year changes between consecutive points), it draws a
   vertical dashed rule spanning the plot height at the midpoint between the two straddling
   points. Each distinct year present gets a year label ("2014", "2026") in a row below the day
   ticks, left-anchored to its year group. The first year gets a label but no left rule (there
   is no transition before it).
6. Day ticks now print the day-of-month ("06", "01", …) instead of full ISO (the day tier of
   the locked `2014 | Sep | 06` decomposition, applied consistently to the chart).

**Table (the real accessible surface):**
7. The synced `<details>` data table renders a **three-tier header** — Year → Month → Day —
   built from the same `buildDateHierarchy(...)` model.
8. In **datesAsColumns** (default): `<thead>` has three `<tr>` (year, month, day). Year cells
   are `<th scope="colgroup" colSpan={distinct months under it}>`; month cells are
   `<th scope="colgroup" colSpan={distinct days under it}>`; day cells are the existing
   `DateHeaderCell` as `columnheader` (`scope="col"`), now displaying the day-of-month while
   keeping their full accessible name (§6). The top-left corner (series axis label) spans all
   three header rows (`rowSpan={3}`).
9. In **datesAsRows**: the date axis is down the left as three sticky columns — Year
   (`scope="rowgroup"`, `rowSpan`), Month (`scope="rowgroup"`, `rowSpan`), Day (`DateHeaderCell`
   as `rowheader`, `scope="row"`). Series occupy the single `<thead>` row as column headers.
10. Hover/focus sync and click-to-pin continue to operate on the **day-tier** cells (unchanged
    `dateKey`), so chart↔table sync, the pin/compare bar, and per-row delta chips all keep working.
11. A year with only one date (incl. the lead-in) still decomposes all three tiers
    (`2014 | Sep | 06`); the year cell spans exactly the number of distinct month groups under
    it (1 here) — never padded, never collapsed.

---

## 2. Modules & files

### 2.1 New

- **`frontend/src/lib/dateHierarchy.ts`** (pure, orientation-agnostic; target < 150 lines).
  The single source of truth for the year→month→day grouping used by BOTH chart overlay and
  table header. No React/Recharts import. See §3 for the API.
- **`frontend/src/lib/dateHierarchy.test.ts`** (Testing stage).
- **`frontend/src/components/charts/DateGroupingOverlay.tsx`** (chart overlay; target
  < 200 lines). Additive SVG `<g aria-hidden="true">` rendered as a sibling of
  `ActivePointOverlay` inside each chart's `<LineChart>`. Reads `usePlotArea`/`useXAxisScale`
  + the hierarchy + a `capturedOn → xEpoch` lookup; draws month span lines/labels and year
  rules/labels. Guards to plot bounds. See §5.
- **`frontend/src/components/charts/DateGroupingOverlay.test.tsx`** (Testing stage).
- **`frontend/src/components/charts/SyncedDataTableHeader.tsx`** (3-tier header renderer;
  target < 250 lines). Renders the year/month spanning cells + delegates day/series cells to
  the existing `DateHeaderCell`/`SeriesHeaderCell` in `SyncedDataTableCells.tsx`. Orientation
  branch (colgroup/rowSpan vs rowgroup/colSpan) lives here so `SyncedDataTable.tsx` stays an
  orchestrator. See §4.
- **`frontend/src/components/charts/SyncedDataTableHeader.test.tsx`** (Testing stage).

### 2.2 Modified

- **`frontend/src/lib/chartTimeAxis.ts`** (currently ~248 lines; budget 400): add
  `formatDayTick(epoch): string` (day-of-month, zero-padded) beside the existing
  `formatDateTick`/`formatLeadInTick`. No change to `selectDisplayedTicks`/`MAX_REAL_AXIS_TICKS`.
- **`frontend/src/components/charts/TrendChart.tsx`** (364/500): swap real-tick `formatTick`
  from `formatDateTick` → `formatDayTick`; add `<DateGroupingOverlay .../>` beside
  `<ActivePointOverlay/>`; bump `<XAxis height>` + day-tick vertical offset to reserve the
  month/year band (§5.3). Room available.
- **`frontend/src/components/charts/RatioChart.tsx`** (357/500): same three edits. Room available.
- **`frontend/src/components/charts/MultiSeriesTrendChart.tsx`** (**500/500 — AT BUDGET**):
  same three edits, but the file has zero headroom. **Extraction required first** (§8): move
  the two inline `dot={(dotProps)=>...}` render callbacks into a small local helper
  (e.g. `multiSeriesDots.tsx`) or a shared dot factory, freeing ~60–80 lines before adding the
  overlay wiring. This extraction is a standalone task item (Testing/Implementation) so the
  budget guardrail hook does not fire.
- **`frontend/src/components/charts/SyncedDataTable.tsx`** (311/500): replace the single
  `<thead><tr>` + the tbody date-`<th>` leading cell with `<SyncedDataTableHeader>` and the
  matching tbody leading-cell logic for the 3-tier date axis. Corner cell gains `rowSpan={3}`
  (datesAsColumns). Keep all sync/scroll/pin wiring. Watch budget; if it exceeds, push more
  rendering into `SyncedDataTableHeader.tsx`.
- **`frontend/src/components/charts/SyncedDataTableCells.tsx`** (236/500): `DateHeaderCell`
  gains a `displayLabel` (day-of-month) distinct from its accessible-name `label` (full date);
  add exported `YearGroupHeaderCell`/`MonthGroupHeaderCell` leaf components (or keep them in
  `SyncedDataTableHeader.tsx` if that reads cleaner). Watch budget.

### 2.3 Not touched
`selectDisplayedTicks`, `interval={0}`, `LeadInXAxisTick.tsx`, `computeYDomain`,
`estimateYAxisWidth`, `tableOrientation.ts`'s `normalizeTableModel` contract, the
`syncedTableModel.ts` builders (columns/rows/comparablePoints shapes are unchanged — the
hierarchy is derived from the existing `dateAxis`, not baked into the model).

---

## 3. Data model — the shared hierarchy (`dateHierarchy.ts`)

No backend/schema/migration changes. This is a frontend-only derived view over the existing
`SyncedTableColumn`/`DateAxisEntry` (`{dateKey, label, isLeadIn}`), whose `dateKey` is always
day-granular ISO `YYYY-MM-DD` (backend `snapshot.captured_on` guarantee, per `chartTimeAxis.ts`).

```
interface DayEntry   { dateKey: string; day: string; entry: DateAxisEntry }  // day = "06"
interface MonthGroup { year: string; month: number; monthAbbrev: string;      // "Sep"
                       days: DayEntry[]; span: number }                        // span = days.length
interface YearGroup  { year: string; months: MonthGroup[]; span: number }      // span = months.length
buildDateHierarchy(entries: DateAxisEntry[]): YearGroup[]
```

Rules:
- Iterate `entries` **in their given order** (the date axis is already ascending; do not
  re-sort — the lead-in is deliberately first). Group consecutively by year, then by month.
- `monthAbbrev` from a **local constant array** `["Jan",...,"Dec"]` indexed by month-1 — not
  `Intl.DateTimeFormat` (locale/jsdom determinism, matching `chartTimeAxis.ts`'s manual-parse
  precedent).
- `day` = zero-padded day-of-month string from the ISO `dateKey`.
- **Never collapse:** a year with one date yields one `YearGroup{span:1}` → one
  `MonthGroup{span:1}` → one `DayEntry`. The month tier is always present (the corrected flaw).
- `span` counts are the exact `colSpan`/`rowSpan` values (year span = number of distinct month
  groups under it; month span = number of days under it). Never padded for visual symmetry.
- The lead-in entry is grouped like any other by its `dateKey` — no special-casing here. Its
  "estimated baseline" semantics are preserved at render time via its accessible name (§6),
  not by excluding it from the hierarchy.
- Malformed/duplicate `dateKey`: an entry whose `dateKey` doesn't match the ISO pattern is
  placed in a defensive fallback group keyed by the raw string (never dropped, never crashes)
  — see §7.

The chart overlay consumes the same `YearGroup[]` plus a `Map<capturedOn, xEpoch>` it builds
from its own `chartData` to resolve pixels.

---

## 4. Frontend design — table 3-tier header

Design language: reuse the existing `SyncedDataTableCells.tsx` slate constants
(`HEADER_CELL_BASE`, `STICKY_HEADER_BASE`, `STICKY_COLUMN_SHADOW`) and `text-ink-soft`
/`font-mono`/`text-sm` — no new palette, consistent with the mockup (which matched the live
`colorTokens.ts`, not MASTER.md). Year/month tier cells: `font-mono text-sm text-ink-soft`,
`border-b border-ink/12`, centered over their span; a subtle bottom/side hairline to read as a
grouping band (matching the mockup's grouped look, tuned in Preview).

**datesAsColumns (`<thead>` = 3 rows):**
```
row 1 (year):   [corner rowSpan=3] [th scope=colgroup colSpan=Σmonths "2014"] [ "2026" colSpan=… ]
row 2 (month):  [th scope=colgroup colSpan=days "Sep"] [ "Jul" ] [ "Aug" ] …
row 3 (day):    [DateHeaderCell col "06"] [ "01" ] [ "02" ] …   ← sync/pin live here
```
- Corner cell: single `<th rowSpan={3} scope="col">` carrying the sr-only `rowHeaderLabel`
  (unchanged content), still `sticky left-0`.
- `<tbody>`: series rows exactly as today (`SeriesHeaderCell` rowheader + `DataCell`s). The
  data-cell count per row still equals the number of day entries — unchanged.

**datesAsRows (date axis = 3 sticky left columns):**
```
<thead> single row: [corner ×3 span] [SeriesHeaderCell col …] …
<tbody> per day row: [YearCell scope=rowgroup rowSpan=Σdays-in-year (first day of year only)]
                     [MonthCell scope=rowgroup rowSpan=days-in-month (first day of month only)]
                     [DateHeaderCell row "06"] [DataCell…]
```
- Year/month `<th>` are emitted **only on the first day-row of their group** with `rowSpan`;
  subsequent rows in the group omit them (standard HTML rowspan pivot).
- Sticky-left: three stacked sticky columns need cumulative `left` offsets. Plan: keep the
  **day column** sticky (it carries sync/pin and must stay visible while scrolling series
  columns), and make year/month columns sticky at computed left offsets (0, yearWidth,
  yearWidth+monthWidth). If cumulative sticky offsets prove fragile at this stage, fall back to
  making only the day column sticky and letting year/month scroll — decided in Implementation
  against real Preview; noted as a risk (§9).
- The top-left corner must occupy the three date-tier columns in the single `<thead>` row —
  render three corner `<th>` (or one `colSpan={3}`) carrying the sr-only `rowHeaderLabel` once.

**Interaction / states:** active-date tint (`bg-accent/10`), pinned marker, delta chips,
auto-scroll-into-view, and the orientation toggle are all unchanged — they key off the
day-tier `dateKey`, which is untouched. Empty/`No data yet.` state: the hierarchy is empty →
header renders just the corner; table body already handles the empty case.

---

## 5. Frontend design — chart overlay (`DateGroupingOverlay.tsx`)

### 5.1 Inputs / contract
```
interface DateGroupingOverlayProps {
  rows: { capturedOn: string; xEpoch: number }[];   // every plotted point (incl. lead-in)
}
```
Uses `usePlotArea()` + `useXAxisScale()` (bail to `null` if unavailable, like
`ActivePointOverlay`). Builds `Map<capturedOn, xEpoch>` and `buildDateHierarchy(rows-as-entries)`.

### 5.2 Marks (all inside one `<g aria-hidden="true">`)
- **Month span line + label** (every month present): `x1 = xScale(firstPointEpoch)`,
  `x2 = xScale(lastPointEpoch)` (equal for a single-point month), at
  `y = plotArea.y + plotArea.height + MONTH_LINE_OFFSET`. Month abbrev `<text>` centered at
  `(x1+x2)/2`, `text-anchor:middle`, `fill=colors.inkSoft`, `font-mono 11px`, just above the
  line. Single-point month → line degenerates to a tick; label still drawn.
- **Year rule + label**: for each year transition, vertical dashed `<line>` from `plotArea.y`
  to `plotArea.y+plotArea.height` at the **midpoint** between the straddling points'
  pixels; `stroke=colors.inkSoft`, `strokeDasharray="4 4"`, `strokeOpacity≈0.5` (reads as a
  boundary, does not compete with `CartesianGrid` at 0.2 or the plotted line). Year label
  `<text>` per distinct year, left-anchored to the year group's first-point pixel, in the row
  below the day ticks (`y = plotArea.y + plotArea.height + YEAR_LABEL_OFFSET`),
  `fill=colors.inkSoft`, `font-mono 11px`.
- **Bounds guard**: skip any mark whose computed x is `< plotArea.x` or
  `> plotArea.x + plotArea.width` (defense against extrapolation; positions are already
  derived from in-domain epochs so this should rarely trigger).

### 5.3 Vertical space
The month row + year row live in the axis band below the plot. Reserve room by raising
`<XAxis height>` (currently default) and offsetting the day-tick text downward (via
`tickMargin` or the `LeadInXAxisTick` text `y`) so, top→bottom: month span+abbrev, day-number
ticks, year labels. Exact pixel offsets (`MONTH_LINE_OFFSET`, `YEAR_LABEL_OFFSET`, XAxis
height, tickMargin) are tuned in Implementation against real Preview at the fixed 240px chart
height — this project's established discipline. `ResponsiveContainer height` may need a modest
bump (e.g. 240 → ~276) to fit two extra label rows without eating plot height.

### 5.4 Placement in JSX
`<DateGroupingOverlay>` is the **last** child of `<LineChart>`, after `<ActivePointOverlay>`
(or before — draw order only affects z-order of aria-hidden marks; month/year marks should sit
beneath the active/pinned guide lines, so render the grouping overlay **first**). Both are
plain children in the same `<Layer>`; neither touches axis ticks.

---

## 6. Accessibility

The chart stays `aria-hidden` / `role="img"`; the overlay `<g>` is `aria-hidden="true"`
(decorative reinforcement of what the table states accessibly). All new *accessible* content is
on the table.

- **Semantic tiers:** year/month spanning cells are real `<th>` with real text and
  `scope="colgroup"` (datesAsColumns) / `scope="rowgroup"` (datesAsRows). Day cells keep
  `scope="col"`/`scope="row"`. This makes the tiers genuine header content, not decorative.
- **`scope="colgroup"`/`"rowgroup"` support is uneven across screen readers** — so the day
  cell's own accessible name remains the **full, unambiguous date**, not just "06". Concretely:
  `DateHeaderCell` displays a new `displayLabel` (day-of-month) but keeps `aria-label={label}`
  (the full ISO / worded label) it already sets today. This is belt-and-suspenders: a reader
  that honors colgroup announces "2014 Sep 06 …"; one that doesn't still gets the full date
  from the day cell itself. It also keeps the pin button's accessible name meaningful
  ("Compare from 2014-09-06", not "Compare from 06").
- **Lead-in / estimated-baseline semantics preserved:** the lead-in's `DateHeaderCell` keeps
  its existing worded accessible name ("Before 2014 (estimated baseline)") via `aria-label`
  while visually decomposing to `2014 | Sep | 06`. No "estimated baseline" meaning is lost, and
  no new visual marker is invented (staying within the locked design). **Confirmed (D2):** this
  accessible-name-preservation approach matches intent — the mockup's exact treatment of the
  lead-in row's a11y text was not captured in the ROADMAP text, so it was confirmed directly.
- **Existing per-series identity descriptions unaffected:** the `` — <colorRole> <shape>
  marker`` sr-only text lives on `SeriesHeaderCell`, which is orthogonal to the date tiers.
  In datesAsRows, series become column headers (already handled); a test will assert the
  identity description still renders in both orientations after the header rewrite.
- **Keyboard/focus:** day-tier headers remain the focusable sync/pin targets (unchanged tab
  order); year/month spanning `<th>` are non-interactive (no focusable descendants → no
  `summary`/WCAG 4.1.2 regressions). The scrollable region stays a tab stop.
- **Dynamic content:** no new live regions; sync tint / delta chips announce as today.
- **Contrast:** `text-ink-soft` on `bg-card` is the already-verified pairing used by existing
  headers; no new color introduced. Re-checked by the existing `accessibility.spec.ts` axe scan.

---

## 7. Corner cases (deviations from happy path, not errors)

- **Single-point year (incl. the lead-in):** all three tiers still render (`2014 | Sep | 06`);
  year `colSpan/rowSpan = 1`, month span line collapses to a single-x tick on the chart, month
  label still drawn. (The explicit corrected-flaw case.)
- **Single-point month inside a multi-month year:** month span collapses to one point; label
  still drawn.
- **All data in one month:** one year group, one month group, N day cells; year/month cells
  span the whole axis. Table and chart both fine.
- **Many months across years (dense multi-year daily data):** many month labels crammed under a
  fixed-width chart → potential label overlap. The locked design says draw every month label,
  so we honor it; overlap mitigation (e.g. drawing the span tick without text only when
  physically overlapping a neighbor) is deferred to a Preview observation, NOT decided now, so
  we don't silently violate "every month gets a label." Flagged as risk §9.
- **Year boundary between two points that are far apart in pixels:** rule at the midpoint reads
  cleanly. Between two points that are pixel-adjacent (dense end-of-year/start-of-year): rule
  still drawn at midpoint; may sit very close to a day tick — acceptable, dashed and subtle.
- **Lead-in month == first real month (same year/month):** they merge into one month group
  (correct — one label), positioned spanning lead-in pixel to that month's last point.
- **datesAsRows with many day rows:** year/month `rowSpan` can be large; sticky offsets must
  not break. See §4 sticky fallback.
- **Duplicate `dateKey`** (lead-in coinciding with a real capture — already possible per
  existing model): dedup within a day group so one day cell renders; sync/pin unaffected.
- **Empty data / `No data yet.`:** hierarchy empty → header is just the corner; existing empty
  branch handles the body.

## 8. Error states

- **Malformed `dateKey`** (non-ISO): `buildDateHierarchy` routes it to a defensive fallback
  group keyed by the raw string rather than throwing or dropping it — the table always shows
  every column it's given (never a blank/missing tier). `formatDayTick`/parse return the raw
  string for the day tier in that case. Backend guarantees ISO, so this is defense-in-depth.
- **Scale/plot hooks unavailable** (`useXAxisScale`/`usePlotArea` return `undefined`, e.g.
  pre-layout render): `DateGroupingOverlay` returns `null` (same guard as `ActivePointOverlay`)
  — the chart renders without grouping marks rather than crashing; next layout pass draws them.
- **x outside plot bounds:** guarded/skipped (§5.2) — no marks drawn off-canvas.
- **Frontend surfacing:** no user-facing error UI is needed — these are silent, safe
  degradations (chart still renders, table still lists every date). No new logging (frontend
  has none here today; consistent with existing chart code).
- **Backend:** none — no backend change.

## 9. Risks

1. **Below-plot drawing** (overlay in the axis band) is newly exercised vs `ActivePointOverlay`
   (plot-interior only). Verified un-clipped per source (§0.3); confirm in real Preview across
   light/dark and both browsers.
2. **Vertical space** at fixed 240px height with two new label rows — may need a height bump;
   tune in Preview (§5.3). Risk of eating plot height if under-budgeted.
3. **Month-label density** on dense multi-year data (§7) — readability, not correctness.
4. **datesAsRows triple sticky-left column** offsets (§4) — fragile; documented fallback.
5. **MultiSeriesTrendChart at 500-line budget** — extraction must land before overlay wiring or
   the commit guardrail fires (§8 extraction is its own task item).
6. **Test churn**: day-tier text change breaks existing full-ISO assertions
   (`TrendChart.test.tsx:145`, `SyncedDataTable.orientation.test.tsx:272`, and any header
   textContent equality). Expected and enumerated in the task list.

## 10. Decision status

The visual design is LOCKED; the two spots the ROADMAP text left implementable more than one
way (chart day-tick text; lead-in a11y decomposition) are **resolved** — see "Decisions
resolved" (D1/D2) at the end of this document. No open/pending items remain in this plan.

---

## 11. Task list — Testing (stage 3), Implementation (stage 4), Retrospective (stage 8)

Test-first: each Testing item writes failing specs against this plan; the paired Implementation
item makes them green. One commit per completed item (`test:` then `feat:`/`refactor:`).

### Testing (write failing tests first)
- **T1 — `dateHierarchy.ts` unit specs** (`dateHierarchy.test.ts`): grouping order preserved;
  single-date year decomposes to all three tiers with `span=1` at each; multi-month year span
  counts; single-point month; lead-in grouped like any date; month abbrev constant-array
  mapping (all 12); malformed dateKey → fallback group (no throw, no drop); duplicate dateKey
  dedup.
- **T2 — `DateGroupingOverlay.test.tsx`**: returns `null` when scale/plot hooks unavailable;
  draws one month span line/label per month present (incl. single-point collapse → still a
  label); draws a year rule per transition + a label per distinct year; first year has label
  but no left rule; skips marks outside plot bounds; `aria-hidden` on the group; positions
  derived from in-domain epochs (assert via a stubbed/known scale). Mirror
  `ActivePointOverlay.test.tsx`'s harness.
- **T3 — `SyncedDataTableHeader.test.tsx` (datesAsColumns)**: three `<thead>` rows; year
  `<th scope=colgroup colSpan=Σmonths>`; month `<th scope=colgroup colSpan=days>`; day cells
  are `DateHeaderCell` columnheaders showing day-of-month with full-date accessible name;
  corner `rowSpan=3`; single-date-year renders `2014 / Sep / 06` (regression fence for the
  corrected flaw).
- **T4 — `SyncedDataTableHeader.test.tsx` (datesAsRows)**: three sticky date-tier columns; year
  `scope=rowgroup rowSpan`, month `scope=rowgroup rowSpan` emitted only on group's first row;
  day `DateHeaderCell` rowheader; series as column headers still carry the identity description;
  single-date-year decomposition holds.
- **T5 — `SyncedDataTable` integration**: chart↔table sync, pin/compare bar, delta chips, and
  auto-scroll still operate on day-tier `dateKey` in BOTH orientations after the header rewrite;
  update the existing full-ISO assertions (`TrendChart.test.tsx`,
  `SyncedDataTable.orientation.test.tsx`, any header textContent-equality specs) to the new
  day-of-month display + full accessible name.
- **T6 — chart wiring specs** for `TrendChart`/`RatioChart`/`MultiSeriesTrendChart`: overlay is
  rendered as a `<LineChart>` child; `selectDisplayedTicks`/`interval={0}`/lead-in marker
  unchanged (regression fence — assert the existing timeAxis/leadInTick specs still pass
  untouched); real day ticks now print day-of-month.
- **T7 — a11y regression**: existing `accessibility.spec.ts` axe scan still clean with the
  3-tier header; add/extend a component-level scan asserting colgroup/rowgroup scopes and that
  no `summary`-focusable-descendant or contrast regression is introduced.
- **T8 — `chartTimeAxis.formatDayTick`** unit spec (zero-padded day; passthrough for malformed).

### Implementation (make them green)
- **I1** — `dateHierarchy.ts` (satisfy T1).
- **I2** — `chartTimeAxis.formatDayTick` (satisfy T8).
- **I3** — `DateGroupingOverlay.tsx` (satisfy T2).
- **I4** — **Extract `MultiSeriesTrendChart` dot renderers** into a helper to get under the
  500-line budget BEFORE any overlay wiring (`refactor:`; no behavior change; existing MSTC
  specs stay green).
- **I5** — Wire `DateGroupingOverlay` + `formatDayTick` + XAxis height/offset into all three
  charts (satisfy T6); tune vertical offsets / `ResponsiveContainer height` in Preview.
- **I6** — `SyncedDataTableHeader.tsx` + `DateHeaderCell` `displayLabel` change (satisfy T3/T4);
  extract from `SyncedDataTable`/`SyncedDataTableCells` as needed to stay within budgets.
- **I7** — Integrate the new header into `SyncedDataTable.tsx` both orientations, incl. sticky
  offsets / fallback (satisfy T5).
- **I8** — Verify a11y (satisfy T7); update Storybook stories for the new header/overlay.
- **I9** — Real-Preview pass: light/dark, both orientations, the 2014-lead-in + dense-2026
  hard case, dense multi-year density check; confirm no x-axis tick regression (the round-5
  fix), no clipping, readable month/year tiers.

### Retrospective (stage 8) — evaluate against
- Did the additive-overlay approach hold — was the round-5 tick machinery genuinely untouched,
  and did any Preview finding force a change to `selectDisplayedTicks`/`interval={0}` after all?
- Coverage of the two new pure modules (`dateHierarchy.ts`) and the overlay vs the 85% baseline.
- Did `MultiSeriesTrendChart` extraction (I4) actually resolve the budget pressure, or just
  defer it? Any new file over budget (log to `TECH_DEBT.md`).
- Month-label density (§7 risk 3): did real data expose overlap needing a follow-up?
- datesAsRows triple-sticky (§4/risk 4): shipped as designed or fell back?
- Did the colgroup/rowgroup scope choice + full-name-on-day-cell prove sufficient for real
  screen-reader behavior, or is a follow-up a11y item warranted?
- Decisions D1/D2 (§ Decisions resolved) were confirmed as recommended — did they hold up in
  Preview (bare day-number ticks readable with month spans; lead-in decomposition + preserved
  worded accessible name behaving correctly for screen readers)?

---

## Decisions resolved

Both resolved by direct user answer (2026-09-26), each matching Planning's recommended default —
no open decisions remain. (Labelled A/B in the plan-review confirmation; recorded here as D1/D2
to match this repo's decision-numbering convention.)

- **D1 — chart day-tick text shows the bare day-of-month ("06"), not the full ISO date
  ("2026-08-06").** This applies the locked `2014 | Sep | 06` three-tier decomposition
  consistently to the chart's x-axis, letting the month-abbreviation span labels and year
  labels/rules carry the month/year context (§5) instead of repeating it in every day tick.
  Concretely: the three charts' real-tick `formatTick` switches from `formatDateTick` to the
  new `chartTimeAxis.formatDayTick` (§2.2/I2/I5). This is purely a tick-*text* change — it does
  NOT touch `selectDisplayedTicks`, `interval={0}`, or the lead-in marker path, and under
  `interval={0}` tick-label width is no longer consulted for filtering (§0.4), so it cannot
  reopen the round-5 tick-selection saga. Low-cost to reverse if Preview ever argues otherwise
  (only `formatDayTick` usage in the three charts would revert).
- **D2 — estimated-baseline lead-ins get the SAME Year|Month|Day visual decomposition as any
  other point, with the full worded accessible name preserved for screen readers, and NO new
  visual "estimated" cue.** The lead-in is grouped by its `dateKey` like any date in
  `buildDateHierarchy` (no special-casing — §3), so it visually reads e.g. `2014 | Sep | 06`
  (the mockup's exact hard case). Its "estimated baseline" semantics are preserved entirely
  through the day-tier `DateHeaderCell`'s existing `aria-label` (the worded label, e.g. "Before
  2014 (estimated baseline)"), which stays distinct from the new `displayLabel` ("06") shown
  visually (§6). No semantic is lost for assistive tech, the pin button's accessible name stays
  meaningful, and the locked design is not extended with any new marker/styling.
