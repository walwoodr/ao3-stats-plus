# Plan: Chart axis, comparison & table-orientation batch (items 1–4)

Status: **FINALIZED (2026-09-24) — ready for Testing (stage 3).** User
approved this plan as-is; no section reads as open/pending. All decisions are
recorded in the "Decisions resolved" section at the end.
Stage: 2 (Planning) complete. Discovery complete; every decision resolved by
direct user answer 2026-09-23/24 (plus item-3 corrections through 2026-09-24)
and treated as LOCKED here (not relitigated).
Author context: combined batch of 4 related chart/table items. Item 5 (visual
date-hierarchy grouping) is explicitly OUT of scope.

This plan is grounded in the actual current code, verified during Planning:
- `frontend/src/components/charts/TrendChart.tsx` (275 lines)
- `frontend/src/components/charts/RatioChart.tsx` (264)
- `frontend/src/components/charts/MultiSeriesTrendChart.tsx` (334)
- `frontend/src/components/charts/SyncedDataTable.tsx` (225)
- `frontend/src/components/charts/ActivePointOverlay.tsx` (63)
- `frontend/src/lib/syncedTableModel.ts` (298)
- `frontend/src/routes/DashboardPage.tsx` (228, lead-in construction at :137–149)
- backend `app/models/snapshot.rb` (captured_on is a DATE, unique per user/day)

---

## 0. Verified facts that shape the plan

1. **recharts@3.10.0 supports a true time axis in-stack.** `type="number"` with
   a numeric `domain` and `scale="time"` / `scale="utc"` are present in the
   installed type declarations (`recharts/types/util/types.d.ts:143`
   `RechartsScaleType` includes `'time'` and `'utc'`; `XAxis.d.ts` documents
   numeric `domain`). No new dependency is required for item 4. This was
   verified directly against the installed package, not assumed.
2. **Capture cadence is genuinely irregular.** `snapshots.captured_on` is a
   Rails `date`, unique per `ao3_user_id` per day, written when the user runs
   the bookmarklet (`snapshot_ingest_service.rb`). Gaps of days/weeks/months
   between captures are normal — so item 4's uneven spacing is a real, expected
   effect, not a rare edge.
3. **The account-level lead-in already fabricates a `-01-01` date.**
   `DashboardPage.tsx:145` sets `leadInDate = `${earliestPostYear}-01-01``. The
   ordinal axis hides this by placing it at x=0 and ticking year-only
   (`capturedOn.slice(0,4)`). A naive move to real epoch would both (a) expose
   the fake Jan-1 and (b) open an arbitrarily wide blank gap. Item 4 point 2 is
   resolved below with a bounded synthetic offset, NOT real epoch.
4. **Single-series table shape (verified, correcting Discovery's guess).**
   `buildTrendTableModel`/`buildRatioTableModel` return `rows: [ONE series row ]`,
   `columns: dates`. Rendered: a header row of dates + exactly one body row.
   Discovery's "rows=dates, 2 columns" was inverted. The item-2 flip for the
   single-series case therefore means: dates become rows, the single metric
   becomes the one value column.
5. **Chart↔table sync is string-keyed on `activeDateKey` (a capturedOn string),
   local `useState` per chart component.** No global store is involved; the
   codebase's Zustand stores are per-feature (selection/token/feed), not for
   hover state. Item 3's pin state follows the same local-state pattern.

---

## 1. Happy path (end to end)

A signed-in author opens the dashboard with several captures recorded.

1. **Item 4 — true time axis (all charts).** Each trend/ratio chart now plots
   points against real elapsed time. Two captures a week apart sit close
   together; a three-month gap stretches wide. The chart reads as an honest
   timeline, not evenly-spaced ticks.
2. **Item 1 — y padding + break cue.** On the main dashboard charts (which have
   a zero-basis lead-in), the floor stays pinned at 0 (D1) and the top gets a
   small headroom pad, so the newest point isn't jammed against the frame. On a
   sparse per-work series with no lead-in, the axis floor lifts off zero to use
   the vertical space, and a small axis-break glyph at the y-baseline signals
   "this axis does not start at zero."
3. **Item 3 — point comparison.** The author clicks a chart point (or a table
   date column header) to PIN it as point A; a pin badge appears on that column
   and an "Comparing from <date> · Clear" control appears. They then hover any
   other point: each metric/series cell in that column shows a delta chip vs A
   (`+47` green / `-12` red, uniform for all metrics incl. ratio per D6), and a
   small "N days later/earlier" elapsed-time note (item 3⇄4). Clicking Clear (or
   the pinned column again) unpins.
4. **Item 2 — table orientation toggle.** Below/above each data table is a small
   "Dates as columns / Dates as rows" toggle. Flipping it transposes the table:
   the multi-series table goes from series-rows×date-columns (D3 default) to
   date-rows×series-columns; the single-series table goes from one date-row-set
   with dates across the top to dates-down-the-side with one value column. All
   sync, tint, pinning, deltas, glyph identity and sr-only descriptions keep
   working in the flipped orientation.

---

## 2. Architecture & module plan

Guiding constraints: file-length budgets (`.tsx` ≤500, `.ts` ≤400), no new
dependency, existing Tailwind-slate look (NOT MASTER tokens) for all new UI,
and the single required MASTER edit (Chart Guidance axis convention, D7).

### 2.1 New shared modules (keeps the three chart `.tsx` and `syncedTableModel.ts` within budget)

- **`frontend/src/lib/chartTimeAxis.ts`** (`.ts`, target < 150 lines) — pure
  helpers for item 4 + item 1's y-domain math:
  - `toEpoch(capturedOn: string): number` — parse ISO date → UTC epoch ms.
  - `leadInEpoch(firstRealEpoch, opts)` — bounded synthetic x for the coarse
    estimated-baseline lead-in (§ item 4 point 2). Returns
    `firstRealEpoch - clamp(gapMs, MIN, MAX)` where `gapMs` is the median gap
    between real points (fallback 30 days), clamped to keep it visually "just
    before" without a huge blank.
  - `formatDateTick(epoch): string` and `formatLeadInTick(...)` (year-only,
    preserving the current coarser-tick honesty for the estimate).
  - `computeYDomain(values, { hasLeadIn }): { domain: [number, number]; broken: boolean }`
    — item 1's padded-domain rule (§4 below). `values` INCLUDES the lead-in's 0
    per D1.
- **`frontend/src/lib/chartTimeAxis.test.ts`** — unit tests for the above.
- **`frontend/src/lib/pointComparison.ts`** (`.ts`, target < 140 lines) — item 3
  pure logic, built around a PER-ROW backward-walk (not a flat per-date lookup),
  because works are captured on DIFFERENT real dates and a selected real date
  may have no own value for a given row (corrected corner case, 2026-09-24):
  - `rowValueAsOf(comparablePoints, date): number | null` — `comparablePoints`
    is that row's OWN ordered (ascending) list of real captured points, with the
    row's lead-in included as the earliest entry (value 0). Returns the value of
    the latest entry whose `dateKey <= date`; `null` only if the row has NO point
    at or before `date` (the work had no data as of that date — e.g. published
    later). Backward-walk: exact-date value if present, else most-recent-real-
    prior, else the lead-in's 0, else null.
  - `computeRowDelta(comparablePoints, pinnedDate, hoveredDate): DeltaResult` —
    `effA = rowValueAsOf(.., pinnedDate)`, `effB = rowValueAsOf(.., hoveredDate)`;
    a real signed delta `effB - effA` when BOTH resolve, else `{ kind: "none" }`
    (that row had no data at or before one of the two dates — a meaningful
    empty, NOT a green/red number).
  - `deltaValence(delta) -> "up" | "down" | "flat" | "none"` + a sign-prefixed
    label (`+N` / `-N` / `0`) so the non-color channel is the sign, applied
    uniformly incl. the ratio (D6).
  - `elapsedLabel(epochA, epochB): string` — "N days later" / "N days earlier"
    for the item 3⇄4 elapsed-time annotation.
  Any date column is selectable as A or B (a lead-in date is legitimate — the
  lead-in already lives in each row's `comparablePoints` as the earliest value-0
  floor, so the backward-walk handles it uniformly). There is no synthetic-value
  special case and no upstream selectability gate: `rowValueAsOf` returning
  `null` (D before R's own earliest point) is the sole "no data" outcome, handled
  per row, not per column.
- **`frontend/src/lib/pointComparison.test.ts`**.
- **`frontend/src/lib/tableOrientation.ts`** (`.ts`, target < 120 lines) — item 2
  pure logic. Normalizes a `SyncedTableModel` (always built as
  columns=dates / rows=series by the existing builders — UNCHANGED) into an
  orientation-agnostic pair of axes:
  - `dateAxis: DateAxisEntry[]` (`{ dateKey, label, isLeadIn }`)
  - `seriesAxis: SeriesAxisEntry[]` (`{ seriesKey, title, identityDescription?, colorHex?, shape? }`)
  - `valueAt(seriesKey, dateKey): CellValue`
  Plus `Orientation = "datesAsColumns" | "datesAsRows"`. This keeps a11y
  semantics tied to MEANING (date axis = syncable/tintable/isLeadIn; series axis
  = glyph + identityDescription) rather than to grid position, so both
  orientations stay correct. The existing builders and all their tests are
  untouched.
- **`frontend/src/lib/tableOrientation.test.ts`**.
- **`frontend/src/components/charts/TableOrientationToggle.tsx`** (`.tsx`, small)
  — the toggle control (a labeled segmented control / button-pair using existing
  slate Tailwind classes). Keyboard + ARIA per §6.
- **`frontend/src/components/charts/PinnedComparisonBar.tsx`** (`.tsx`, small) —
  the "Comparing from <date> · N days · Clear" summary strip shown when a point
  is pinned. Existing slate styling.

### 2.2 Extended existing modules

- **`ActivePointOverlay.tsx`** — extend to optionally draw a SECOND, visually
  distinct overlay for the pinned point A (solid guide line + filled ring vs the
  hover's translucent line + hollow ring), and to draw item 1's axis-break glyph
  at the y-baseline when `broken` is true. Alternatively split the break glyph
  into a tiny sibling `YAxisBreakGlyph.tsx` if the file approaches budget
  (currently 63 lines, ample room; keep in-file unless it crosses ~130).
- **`SyncedDataTable.tsx`** — accept `orientation` + `onOrientationChange`, plus
  `pinnedDateKey` + `onPinnedDateKeyChange`, and render from the normalized axes
  (`tableOrientation.ts`) instead of the hardcoded columns=dates/rows=series
  loop. Renders delta chips in the active column/row when a point is pinned.
  Currently 225 lines; the orientation generalization + delta rendering will
  push this up — plan to extract the cell-rendering + the header-rendering into
  small helper components or a `SyncedDataTableCells.tsx` sibling if it crosses
  ~450, to stay under the 500 budget.
- **`syncedTableModel.ts` builders — extend each row with `comparablePoints`
  (item 3 data-model change, 2026-09-24).** The backward-walk needs each row's
  OWN ordered real captured points, independent of the shared union column axis —
  the flat `cells` array can't support it (it holds `—` / `Published (N)` strings
  aligned to the union columns, not the row's own real series). Add
  `comparablePoints: { dateKey: string; value: number }[]` (ascending; the row's
  lead-in included as the earliest value-0 entry) to `SyncedTableRow`. All three
  builders already hold the raw `points` + `leadIn`, so this is a small additive
  field; the existing `cells` construction/rendering is untouched. File 298 →
  still under the 400 `.ts` budget.
- **`TrendChart.tsx` / `RatioChart.tsx` / `MultiSeriesTrendChart.tsx`** — each:
  (a) switch XAxis to the time axis via `chartTimeAxis.ts`; (b) apply
  `computeYDomain` to `<YAxis domain=...>`; (c) own a new `pinnedDateKey`
  `useState` beside the existing `activeDateKey`, wire both into
  ActivePointOverlay and SyncedDataTable; (d) own an `orientation` `useState`
  passed to SyncedDataTable. The bulk of new logic lives in the shared libs, so
  these stay within budget (largest, MultiSeries, is 334 → expected < 430).

### 2.3 State composition (item 3, resolving D5's "two distinct states")

Each chart component holds THREE local states:
- `activeDateKey: string | null` — existing hover/focus sync (unchanged).
- `pinnedDateKey: string | null` — point A. Set by clicking a chart point or a
  table date header **that corresponds to a real captured date only**; cleared
  by clicking it again or the Clear control.
- `orientation` — item 2.

**Selectability (corrected again 2026-09-24 — NO column-level gate):** every
date column is pinnable (as A) and hoverable (as B), including a lead-in column.
The lead-in is treated as real data for comparison purposes: it already lives in
each row's `comparablePoints` as the earliest value-0 floor, so the per-row
backward-walk handles the "just published" case on its own — no upstream
`isLeadIn` exclusion is needed (the earlier revision's gate solved a problem the
backward-walk already solves, so it is removed). In practice effectively every
column is selectable, since every row's lead-in always exists. The only "no data"
outcome is now a PER-ROW result of `rowValueAsOf` returning `null` (see below),
never a column-level block. The pre-existing plain highlight-sync (the shipped
`activeDateKey` guide-line on any column) is likewise unchanged.

`activeDateKey` and `pinnedDateKey` are independent: hovering never changes the
pin; pinning never changes the hover. The overlay draws BOTH (pin = solid/filled,
hover = translucent/hollow). Deltas are computed only when BOTH `pinnedDateKey`
and `activeDateKey` are set to REAL dates, and are resolved PER ROW via the
backward-walk (`computeRowDelta`, §2.1) — each row independently, so one row
landing on its own lead-in/earlier fallback never affects another row's number.

---

## 3. Item-by-item design

### Item 1 — Y-axis padding + non-zero-origin break indicator

**Locked:** D1 (include the zero-basis lead-in's 0 in the padded min/max).
**Resolved here:** D2 (break-indicator visual treatment) — Discovery deferred
this to Planning; it is decided below and recorded in "Decisions resolved".

**Y-domain rule (`computeYDomain`):**
- `values` = every rendered numeric y across all series, INCLUDING the lead-in's
  literal 0 when a lead-in is present (D1).
- `dataMin = min(values)`, `dataMax = max(values)`, `range = dataMax - dataMin`.
- `pad = (range || fallbackForSinglePoint) * 0.08`.
- If `dataMin <= 0` (lead-in present, or a genuine zero floor): `domain = [0, dataMax + pad]`, `broken = false`. This is exactly the "hollows out on the main
  dashboard" outcome the user chose in D1 — implemented faithfully, not
  second-guessed.
- If `dataMin > 0` (no lead-in — sparse per-work series, or any lead-in-less
  state): `lo = max(0, dataMin - pad)`; `domain = [lo, dataMax + pad]`;
  `broken = lo > 0`.
- Single-point (`range === 0`): `fallbackForSinglePoint = max(abs(dataMax) * 0.1, 1)`
  so a lone point gets breathing room instead of a zero-height band.

**Break-indicator treatment (D2 decision):** when `broken` is true, draw a
small **axis-break glyph** at the very bottom of the y-axis inside the plot area
— two short parallel slashes (a "//" / zigzag tick, the conventional broken-axis
cue), in `--color-ink-soft`, ~10px tall, centered on the y-baseline just above
the x-axis. This is a real visual truncation cue, NOT merely a text label (per
D2). Rendered as additive SVG inside the chart via `usePlotArea`/`useYAxisScale`
(same technique as `ActivePointOverlay`, so it can't fight Recharts internals).
Styled with the existing slate/ink-soft approach, consistent with the other
chart chrome — NOT MASTER design tokens. Because the chart is `aria-hidden` and
the accessible table always shows true values, there is no risk of a
screen-reader user being misled about a non-zero origin; the cue is a
sighted-user affordance only.

### Item 2 — Table row/column orientation toggle (table only; charts untouched)

**Locked:** applies to EVERY chart's table incl. single-series; it is a real
shipped toggle. Charts are not flipped.

**What each orientation renders (explicit, per Discovery's request):**
- **Multi-series, default `datesAsColumns` (current D3 shape):** rows = series
  (glyph + title + sr-only identity), columns = dates (syncable/tintable,
  isLeadIn labels). Unchanged from today.
- **Multi-series, flipped `datesAsRows`:** rows = dates (syncable/tintable,
  isLeadIn labels move to row headers), columns = series (glyph + title in
  column headers, sr-only identity preserved). This is effectively the pre-D3
  orientation — chosen as "flipped" because it is the natural transpose and the
  most useful alternative (dates read top-to-bottom chronologically).
- **Single-series, default `datesAsColumns`:** dates across the top, one metric
  row. Unchanged from today.
- **Single-series, flipped `datesAsRows`:** dates down the side (one row each),
  a single value column headed by the metric title. The benefit is smaller here
  (the user explicitly chose consistency over minimal scope).

The toggle keys `pinnedDateKey`/`activeDateKey` off `dateKey` regardless of
orientation, so item 3 and the existing sync work identically in both states
(item 2⇄3 dependency handled by construction). Default orientation on mount =
`datesAsColumns` (today's behavior), so nothing regresses for a user who never
touches the toggle. Orientation is per-table local state (not persisted this
iteration; note as possible follow-up).

**Toggle control:** a two-option segmented control (`TableOrientationToggle.tsx`)
labeled e.g. "Dates: Across ▸ / Down ▾", placed in the disclosure header row
next to "Data table". Slate Tailwind styling matching existing chart chrome.

### Item 3 — Time-series point comparison (pin A, hover for delta)

**Locked:** D5 (click-to-pin A, hover B for delta, discoverable unpin), D6 (all
metrics colored uniformly, up=green/down=red, INCLUDING the ratio — implemented
exactly, not special-cased to neutral).

**Interaction:**
- **Pin:** clicking a chart point (`onClick` on the LineChart resolving the
  dateKey the same way `onMouseMove` already does) OR clicking a table date
  header — **any date column, including a lead-in column** (the lead-in is valid
  comparison data; §2.3) — sets `pinnedDateKey`. The chart's lead-in (zero-basis)
  dot is a valid pin target too. A pin badge (■ + "A") renders on the pinned date
  header; `PinnedComparisonBar` appears.
- **Unpin (discoverable):** the `PinnedComparisonBar` shows a "Clear" button;
  clicking the pinned header again also clears. Keyboard-operable.
- **Delta (per-row backward-walk, corrected 2026-09-24):** while pinned,
  hovering/focusing another date column/row (any column, lead-in included)
  computes, per series/row,
  `computeRowDelta(row.comparablePoints, A, B)` and renders a delta chip beneath
  the value in the active cells: `+47` (green) / `-12` (red) / `0` (neutral).
  Crucially, each row's `effA`/`effB` are resolved by the backward-walk, NOT by
  the literal cell at A/B: if a row has no OWN real capture exactly at the
  selected date, it falls back to that row's most-recent real prior point (or its
  own lead-in's 0 as the earliest fallback). So the delta is meaningful even for
  a row whose literal A or B cell reads `—` (it carries its value forward). The
  `+`/`-`/`0` sign is the non-color channel; an sr-only suffix reads "increase of
  47" / "decrease of 12" / "no change" so color is never the sole signal (MASTER
  Chart Guidance + a11y constraint). A carried-forward row additionally gets an
  sr-only clarifier: "as of <fallback date>".
- **Ratio (D6):** the kudos-to-hits ratio delta is colored by the SAME up=green/
  down=red rule as counts — no metric-aware exception. Implemented exactly as
  the user directed.

**Per-row fallback on sparse dates (corrected corner-case rule, 2026-09-24 —
replaces the earlier "neutral dash for sparse/lead-in cells"):** the table shares
ONE date axis across all rows, but individual works are captured on different
real dates. When any date D is pinned/hovered but a specific row R has no OWN
real value exactly at D, R's comparison does NOT go blank. Instead `rowValueAsOf(R.comparablePoints, D)` walks backward
through R's own real points — including R's lead-in as the earliest fallback — to
the most recent one at or before D:
- common case: R's nearest prior point is its own zero-basis lead-in ⇒ basis is
  0 ("vs. 0 at publication");
- general case: any earlier real captured value for R, however far back
  (days/weeks/months/years).
Every row resolves independently; one row falling back to its lead-in never
changes another row's number. The ONLY blank case that remains is when R has NO
point at or before D at all (the work had no data as of D — e.g. it was published
AFTER D): that row's delta is a meaningful empty cell (sr-only "no data for this
work as of <date>"), which is correct, not the removed after-the-fact
"comparison unavailable" neutralization. Because the lead-in is a legitimate
value-0 floor inside each row's `comparablePoints`, the delta function handles a
lead-in date uniformly with any other — no special-casing, and no column-level
exclusion of synthetic dates.

**Item 3⇄4 (elapsed time):** because the axis is now real time, the
`PinnedComparisonBar` includes the elapsed span between A and the active point
(e.g. "42 days later"). This is meaningful now in a way it was not on the
ordinal axis. Kept in the summary bar, not repeated per-cell.

**Distinct from `WorkComparisonSection`:** this is per-POINT-in-time comparison
within one chart, never multi-work selection. UI language is "Compare from this
point" / "Comparing from <date>", never "compare works"; no shared component,
prop, or store name with `WorkComparisonSection` / `useWorkComparisonStore`.

### Item 4 — True chronological x-axis (all charts; reverses MASTER default)

**Locked:** D7 (switch all charts to a real elapsed-time scale, not a toggle;
update MASTER Chart Guidance to record the reversal).

**Axis mechanics:** each chart row gains a numeric `xEpoch` (via
`chartTimeAxis.toEpoch`). `<XAxis dataKey="xEpoch" type="number" scale="time"
domain={[min, max]} ticks={realEpochs} tickFormatter={formatDateTick} />`. Real
points sit at their true epoch; spacing is proportional to elapsed time.
`ActivePointOverlay` and pin/hover all pass `x = xEpoch` (number) into
`useXAxisScale`, which already accepts `number | string` — the overlay stays
chart-shape-agnostic (no overlay change needed for x-typing).

**The four flagged consequences, each resolved:**

1. **Irregular cadence → uneven spacing.** This is the intended honesty gain
   (verified: captures are day-granular and user-driven, so gaps are real).
   Reads sensibly across realistic ranges because the domain auto-fits
   `[minEpoch, maxEpoch]`; ticks are placed only at real capture epochs (via
   explicit `ticks`) so no fabricated intermediate gridline dates appear.

2. **Zero-basis lead-in placement.** Two cases, resolved distinctly:
   - **Per-work PUBLISH-DATE lead-in (`isPublishDate`, a real date):** placed at
     its REAL epoch. If the work published long before first capture, the wide
     gap is honest (it really was published then). No special treatment.
   - **Account-level ESTIMATED baseline (`Before {year}`, coarse):** placed at
     `leadInEpoch = firstRealEpoch - clamp(medianGap, MIN=~14d, MAX=~90d)`, i.e.
     a bounded synthetic offset "just before" the first real point — NOT at real
     `Jan-1` epoch. This avoids both fabricating Jan-1 precision AND opening a
     multi-year blank gap. Its tick stays YEAR-ONLY (`formatLeadInTick`), and
     the dashed `--color-ink-soft` connector already signals "estimate," so the
     one off-scale point is clearly marked as approximate. This is the single
     point deliberately not on the true scale; documented as such. The table
     side is unchanged — the table keeps its `capturedOn` string dateKey and
     "Before {year}" label; only the chart derives `xEpoch`.

3. **Sparse-series gaps.** `connectNulls={false}` stays. Under real time a long
   gap becomes a wide gap — "arguably more honest." To keep a wide real gap from
   reading as a rendering bug, keep the per-point markers (dots/shapes) at every
   real capture so the eye sees discrete captures with space between them, not a
   broken line. Genuinely sparse sub-series (e.g. public/private bookmarks) that
   have few points render as spaced markers with dashed-free gaps; the visible
   table remains the unambiguous source of "not captured" (`—`). No new
   mechanism needed.

4. **API verification.** DONE during Planning against the installed package
   (`recharts/types/util/types.d.ts:143`, `XAxis.d.ts`). Testing must still add
   a runtime assertion (a render test that the time axis produces
   proportionally-spaced x positions) rather than trusting types alone.

**MASTER edit (required by D7):** update
`design-system/ao3-stats-plus/MASTER.md` Chart Guidance bullet (currently line
~298: "Category axis (not real-time-linear) stays the existing, correct
default … do not introduce a real date-scale axis") to record the deliberate,
user-directed reversal — replace it with the true-time-axis convention plus a
dated note explaining this is an intentional convention change (D7,
2026-09-24), not drift, and cross-referencing this plan.

---

## 4. Cross-item interdependencies (re-verified against the reframe)

- **Item 1 ⇄ Item 2: NO LONGER APPLIES.** Discovery flagged this only because
  item 2 was originally a chart-axis flip. Item 2 is now table-only; charts are
  untouched by it, so item 1's y-domain math and item 2's table transpose never
  interact. Explicitly confirmed moot.
- **Item 1 ⇄ zero-basis lead-in: APPLIES** (D1) — handled in §3 item 1.
- **Item 2 ⇄ Item 3 ⇄ D3: APPLIES** — item 3 deltas key off `dateKey`, which is
  orientation-independent; delta rendering is exercised under BOTH orientations
  (see task list / testing).
- **Item 3 ⇄ Item 4: APPLIES** — elapsed-time annotation added to the pin bar.
- **Item 4 ⇄ lead-in placement: APPLIES** — resolved (§3 item 4 point 2).
- **Item 4 ⇄ sparse series: APPLIES** — resolved (§3 item 4 point 3).

---

## 5. Data model (backend)

**N/A.** This is a frontend-only change. No schema, migration, model, GraphQL,
or service change. `captured_on` (date, day-granular) and `earliestPostYear`
already provide everything the time axis and lead-in placement need. Confirmed
by reading `snapshot.rb` and the existing GraphQL consumption in
`DashboardPage.tsx` / `WorkComparisonSection.tsx`.

---

## 6. Corner cases

- **Chart with a lead-in but only one real point:** time axis domain is
  `[leadInEpoch, singleRealEpoch]`; y single-point fallback pad applies; break
  glyph not shown (floor pinned at 0 via lead-in).
- **Chart with no lead-in and one real point:** `range===0` fallback pad; if
  `dataMin>0`, break glyph shows.
- **All-zero series:** `dataMax===0` → domain `[0, pad-fallback]`; no divide-by-
  range NaN (guarded).
- **Pin then flip orientation:** pin persists (keyed by dateKey); pin badge and
  delta re-render on the now-transposed axis.
- **Pin then hover the pinned point itself:** every row's `effA === effB` ⇒
  delta `0` (flat, neutral), not colored.
- **Pin/select a lead-in column: ALLOWED (corrected again 2026-09-24).** A
  lead-in date is legitimate comparison data — it is each row's earliest value-0
  floor in `comparablePoints`, so it participates in the backward-walk like any
  real point. No column is excluded from selection; the only "no data" outcome is
  the per-row `null` case below.
- **Real date D selected, a row R has no OWN value exactly at D (the key
  corrected corner case):** R does NOT go blank. `rowValueAsOf` walks backward
  through R's own real points (lead-in as earliest fallback) to the most recent
  at or before D — commonly R's own zero-basis lead-in ⇒ "vs. 0 at publication",
  generally any earlier real value however far back. Each row resolves
  independently. This is exactly the user's "one work published, others had no
  data recorded" case.
- **Real date D selected but R has NO point at or before D at all** (R's work was
  published/first-captured AFTER D): R's delta is a meaningful empty cell (sr-only
  "no data for this work as of <date>"), not a colored number — distinct from the
  removed "sparse ⇒ neutral dash" behavior.
- **Carried-forward row in the hovered column** shows a signed delta chip even
  though its literal cell reads `—`; an sr-only clarifier notes the basis is R's
  value as of its fallback date.
- **Two real points sharing… n/a** — captured_on is unique per day per user;
  duplicate epochs can't occur within one user's aggregate series. In
  multi-series union, two different works CAN share a real date (same epoch) —
  that already works (shared column) and is preserved.
- **Estimated-baseline lead-in whose bounded offset would overlap the first real
  point** (captures extremely dense): `clamp(MIN)` guarantees a minimum visible
  separation.
- **Empty series / `chartData.length===0`:** existing "No data yet." guard
  retained; toggle/pin UI not rendered in that state.
- **Reduced motion:** existing `prefersReducedMotion` auto-scroll behavior
  unaffected; new UI adds no animation beyond existing color/border transitions.

---

## 7. Error states

- **Unparseable `capturedOn`** (defensive; backend guarantees ISO dates):
  `toEpoch` returning `NaN` must be filtered before domain computation so a
  single bad value can't collapse the axis. Fall back to excluding that point
  and console-warn (dev only). Surfaced to the user as a missing point, never a
  blank chart.
- **Recharts scale hook returns null** (already handled in `ActivePointOverlay`
  via the `!xScale || !yScale` guard) — the same guard covers the new pin
  overlay and break glyph; they render nothing rather than throwing.
- **No backend error paths change** (frontend-only). Existing dashboard query
  error/loading states in `DashboardPage.tsx` are untouched.

---

## 8. Accessibility (first-class)

The visible transposed table is the primary accessible surface; charts are
`aria-hidden` / `role="img"`. All of the following must keep the existing axe
light+dark scans green (`frontend/tests/accessibility.spec.ts` +
Storybook addon-a11y) and preserve per-series `"<colorRole> <shape> marker"`
identity descriptions under BOTH orientations.

- **Orientation toggle:** a labeled control (`aria-pressed` / radio-group
  semantics), keyboard operable (Tab to it, Enter/Space to switch), visible
  focus ring (existing `focus-visible:outline-accent`). Its label names the
  current state ("Dates across / Dates down").
- **Transposed table semantics:** in `datesAsRows`, date headers become `<th
  scope="row">` and series headers become `<th scope="col">` — scopes must
  swap with orientation so screen-reader table navigation stays correct. The
  sr-only identity description (`— slate-blue circle marker`) moves with the
  series axis to whichever header it now occupies; verified under both states.
- **Pin:** the pin control and Clear are real `<button>`s with descriptive
  labels ("Compare from <date>", "Clear comparison"); focus moves sensibly and
  the pinned state is announced (pin badge has sr-only "pinned comparison
  point"). Clicking a chart point is a mouse affordance; the table header pin
  (keyboard-reachable) is the accessible equivalent, so pinning is not
  mouse-only. **Every date header (lead-in included) is an equal pin target** —
  there is no non-selectable column, so keyboard tab order over the date headers
  is uniform.
- **Delta chips:** never color-only — sign prefix (`+`/`-`/`0`) + sr-only
  "increase/decrease/no change of N". A row whose basis is carried forward from
  an earlier date (backward-walk, §3 item 3) adds sr-only "as of <fallback
  date>"; a row with no data at or before the selected date renders an empty cell
  with sr-only "no data for this work as of <date>" (not a colored number).
  Contrast of green/red chip text on card background must meet WCAG AA (verify
  both modes; use the existing growth/ink tokens which are already AA-checked, or
  darken as needed).
- **Break glyph:** purely visual, inside the `aria-hidden` chart — no AT impact;
  the table carries true values so no misleading-origin concern.
- **Focus management on flip:** flipping should not steal or lose focus
  unexpectedly; keep focus on the toggle after activation.

No axe regression is acceptable; both new components ship with their own
Storybook stories so addon-a11y scans them in isolation, in addition to the
route-level e2e scan.

---

## 9. Frontend design (references the existing slate implementation, NOT MASTER tokens)

Per `CLAUDE.md`'s Design-context note and the batch constraints, all NEW UI is
styled with the EXISTING `frontend/src/` Tailwind-slate approach (the `ink` /
`ink-soft` / `card` / `accent` CSS-var utilities already used across these chart
files), NOT MASTER's design tokens. The one and only MASTER touch is the D7
Chart Guidance text edit (§3 item 4). This is a batch of increments to existing
chart surfaces, not a new page/screen of real visual consequence, so it does not
trigger establishing a fresh design snapshot — it extends the existing
components' established look:

- **Break glyph:** `--color-ink-soft`, ~10px, two parallel 30° slashes at the
  y-baseline. Matches the existing `CartesianGrid` ink-soft/0.2 chrome weight.
- **Pin badge:** small filled `--color-accent` square + "A", echoing the
  existing `bg-accent/10` active-column tint and the accent used for
  `ActivePointOverlay`.
- **Pin bar / Clear:** slate `text-sm` row using existing `text-ink` /
  `text-ink-soft`, matching the `<summary>` "Data table" row styling.
- **Delta chips:** `text-sm font-mono` (matching `DATA_CELL_BASE`), green =
  existing growth token, red = an ink-derived danger shade consistent with the
  palette; sign always shown.
- **Orientation toggle:** segmented pair matching the disclosure header's
  `text-sm font-semibold text-ink` weight.

---

## 10. Task list for Testing (stage 3), Implementation (stage 4), Retrospective (stage 8)

Note: TaskCreate was not available in this Planning environment, so the itemized
list is captured here for Testing/Implementation to consume directly. Suggested
sequencing: shared libs first (test-first), then per-chart wiring, then MASTER
edit. Items 4→1→3→2 dependency order is convenient (axis first, since y-domain
and pin overlays sit on top of it) but each lib is independently testable.

### Shared libs (Testing writes failing specs first, Implementation makes green)
1. `chartTimeAxis.ts` — `toEpoch`, `leadInEpoch` (bounded offset + clamp),
   `formatDateTick`, `formatLeadInTick`, `computeYDomain` (all D1 branches +
   single-point + all-zero + `broken` flag). Spec: `chartTimeAxis.test.ts`.
2. `pointComparison.ts` — `rowValueAsOf` (exact-date hit; backward-walk to
   most-recent prior; fall to lead-in 0; `null` when nothing at/before D),
   `computeRowDelta` (both resolve ⇒ signed delta; either null ⇒ `none`; delta
   vs self = 0; ratio uniform-coloring per D6), `deltaValence`, sign labels,
   `elapsedLabel`. Spec: `pointComparison.test.ts`. The lead-in participates as
   a normal value-0 floor entry in `comparablePoints` (no column-level exclusion,
   no synthetic special case); the only "no data" path is `rowValueAsOf` → `null`
   when D precedes R's earliest entry. Do NOT re-introduce the removed
   "sparse/lead-in ⇒ neutral dash" behavior.
   Also extend the three builders' specs (`syncedTableModel.test.ts`) for the new
   `comparablePoints` field (ascending order; lead-in as earliest value-0 entry;
   sparse works excluded from a row's own list).
3. `tableOrientation.ts` — normalize `SyncedTableModel` → date/series axes +
   `valueAt`; both orientations; single-series and multi-series inputs; lead-in
   and sparse cells preserved. Spec: `tableOrientation.test.ts`.

### Component wiring
4. `ActivePointOverlay.tsx` — add pinned-point overlay (distinct style) + break
   glyph; extend existing overlay tests (`activeDotSuppression.test.tsx` and a
   new overlay spec) for: pin ring distinct from hover ring; break glyph appears
   iff `broken`; both guard on null scales.
5. `SyncedDataTable.tsx` — render from normalized axes; `orientation` +
   `onOrientationChange`; `pinnedDateKey` + per-row backward-walk delta chips;
   scope-swap under flip. NO column-level selectability gate: every date column
   (lead-in included) is pinnable/hoverable. Extend `SyncedDataTable.test.tsx`,
   `.sync.test.tsx` equivalents, `.stickyColumn`, `.rowHeaderTruncation`,
   `.autoScroll` for both orientations; new `SyncedDataTable.orientation.test.tsx`
   and `.pinDelta.test.tsx`. The `.pinDelta` spec must cover: (a) a lead-in column
   IS selectable as A or B and yields correct per-row deltas vs the lead-in's 0
   floor; (b) a row with no own value at the selected date shows a delta from its
   most-recent prior point (incl. its lead-in 0) even though its literal cell
   reads `—`; (c) a row whose work was published AFTER the selected date shows an
   empty cell with the sr-only "no data … as of" wording, not a colored number;
   (d) deltas correct under BOTH orientations; (e) delta-vs-self = 0.
6. `TableOrientationToggle.tsx` + story + a11y test.
7. `PinnedComparisonBar.tsx` + story + a11y test (Clear button, elapsed label).
8. `TrendChart.tsx` — time axis, y-domain, pin state, orientation state, click-
   to-pin. Extend `TrendChart.test.tsx`, `.sync.test.tsx`, `.chartDisclosure`.
9. `RatioChart.tsx` — same as TrendChart incl. D6 ratio uniform coloring.
   Extend `RatioChart.test.tsx`, `.chartDisclosure`.
10. `MultiSeriesTrendChart.tsx` — time axis (union epoch), per-series lead-in
    placement (publish-date=real epoch, estimate=bounded offset), pin/orientation
    wiring; delta under both orientations for N series. Extend
    `MultiSeriesTrendChart.test.tsx`, `.sync`, `.leadIn`, `.solidLines`,
    `.buildChartData`.
11. `DashboardPage.tsx` — no logic change expected beyond passing through; verify
    the three aggregate charts still mount and the lead-in still constructs.
12. `WorkComparisonSection.tsx` — verify multi-series charts still receive the
    same props; confirm publish-date vs estimated-baseline lead-in flag
    (`isPublishDate`) drives the new chart placement correctly. Extend its
    lead-in tests.
13. `design-system/ao3-stats-plus/MASTER.md` — D7 Chart Guidance reversal edit
    with dated rationale (this is a docs change, `docs:` commit).
14. e2e: extend `frontend/tests/accessibility.spec.ts` for the populated
    dashboard with a pinned point and a flipped table, light + dark, axe green.

### Retrospective (stage 8) should evaluate against
- Did the D1 "hollow out on the main dashboard" outcome land as the user
  intended, and does the break indicator earn its keep on the sparse charts
  where it actually shows?
- Is the true-time axis readable at real capture cadences (revisit with real
  user data), and does the bounded lead-in offset read as "approximate" rather
  than as a bug?
- Did the pin/delta UI stay clearly distinct from `WorkComparisonSection` in
  practice (no user confusion between the two "comparison" concepts)?
- Coverage of the three new libs vs the 85% baseline.
- File-length budgets: did `SyncedDataTable.tsx` / the three charts stay under
  budget, or did an extraction become necessary (record if so)?
- Was the D7 MASTER reversal recorded clearly enough that a future reader knows
  it was intentional?

---

## 11. Infra / hosting cost estimate

**N/A.** Frontend-only, no new paid infrastructure, no new dependency, no new
hosting/compute/storage. Deploys through the existing Render pipeline
(`render.yaml`) with no new billable dimension.

---

## 12. Tech-stack check

No new dependency. recharts (approved exception) covers item 4's time axis;
items 1–3 are plain React + Tailwind + existing helpers. Nothing to flag for
approval. Confirmed against `TECH_STACK.md` (project) and the global spec.

---

## Decisions resolved

All resolved by direct user answer (2026-09-23/24) — no open decisions remain.
D1/D2/D3/D5/D6/D7 carry the identifiers Discovery assigned; the item-3
corrections are recorded as C3a/C3b to keep an honest record of the two
mid-Planning course changes.

- **D1 — Y-axis padding INCLUDES the zero-basis lead-in's 0 in the padded
  min/max** (the "safe default"). Consequence, chosen knowingly: the floor stays
  pinned at 0 on any chart that has a lead-in (most account-level charts), so
  padding's visible effect is limited to charts WITHOUT a lead-in (sparse
  per-work series). Discovery explicitly flagged this "hollows out" the main
  dashboard charts; the user chose it anyway. Implemented faithfully (§3 item 1,
  `computeYDomain`) — not quietly shifted toward the more-visible "exclude
  lead-in" alternative.
- **D2 — break-indicator visual treatment (deferred by Discovery to this plan):
  a real broken-axis glyph, not a label.** When the y-floor lifts off zero
  (`broken === true`), draw a small two-slash "//" zigzag tick at the y-baseline
  in `--color-ink-soft`, as additive SVG via `usePlotArea`/`useYAxisScale` (same
  technique as `ActivePointOverlay`). Existing slate/ink-soft styling, NOT MASTER
  tokens. Purely visual (chart is `aria-hidden`; the table carries true values).
- **D3 — REVISED by the user to a TABLE-ONLY orientation toggle** (originally
  scoped as a chart axis-flip). Item 2 is now a row/column orientation control on
  `SyncedDataTable` only; charts are never flipped. Applies to EVERY chart's
  table including the single-series ones (consistency chosen over minimal scope).
  Flipped state = the natural transpose: multi-series goes series-rows×date-cols
  ⇄ date-rows×series-cols; single-series goes dates-across-top ⇄ dates-down-side
  with one value column. Default on mount stays today's `datesAsColumns` so
  nothing regresses. Because item 2 is table-only, the Item 1 ⇄ Item 2
  interdependency Discovery flagged is now MOOT (recorded in §4). (The prior
  locked D3 from `docs/plans/chart-synced-data-table.md` — the transposed
  default — is unchanged; this adds a toggle on top of it.)
- **D5 — point-comparison interaction: click-to-pin A, then hover B for the
  delta, with a discoverable Clear.** `pinnedDateKey` (point A) and
  `activeDateKey` (hovered B) are two independent local states that coexist (the
  overlay draws both: pin solid/filled, hover translucent/hollow). Composes with
  the existing single-`activeDateKey` hover-sync rather than conflating the two.
  The item 3 ⇄ item 4 interaction is addressed by adding an elapsed-time
  ("N days later/earlier") annotation to the `PinnedComparisonBar`, now that the
  axis is real time.
- **D6 — delta valence coloring is UNIFORM across all metrics: increase=green,
  decrease=red, INCLUDING the kudos-to-hits ratio.** The user chose the simple
  uniform rule over the metric-aware alternative Discovery recommended.
  Implemented exactly (§3 item 3) — the ratio is NOT special-cased to neutral.
  The sign prefix (`+`/`-`/`0`) plus sr-only wording is the non-color channel, so
  color is never the sole signal.
- **D7 — switch ALL charts to a true (real elapsed-time) x-axis scale — not a
  toggle, not deferred.** Uses recharts `type="number"` + `scale="time"` over
  epoch-ms x-values (API verified directly against installed `recharts@3.10.0`,
  §0). This reverses the previously-documented MASTER convention; the required
  MASTER Chart Guidance edit recording the deliberate reversal (dated, with
  rationale, cross-referencing this plan) is task-list item 13. All four
  downstream consequences Discovery flagged are resolved in §3 item 4: irregular
  cadence → honest uneven spacing; the account-level estimated-baseline lead-in
  placed at a bounded synthetic offset before the first real point (NOT at a
  fabricated Jan-1 epoch), publish-date lead-ins at their real epoch; sparse gaps
  kept legible via per-point markers; the axis API runtime-asserted in Testing.

### Item-3 mid-Planning corrections (recorded for an honest trail)

- **C3a — sparse-date resolution is a PER-ROW backward-walk, not a
  neutral/undefined dash (user correction, 2026-09-24).** The shared date axis
  spans all rows, but works are captured on different real dates. When a selected
  date D has no OWN real value for a given row R, R does not go blank — it falls
  back to R's most-recent real point at or before D, using R's own lead-in (value
  0) as the ultimate floor ("vs. 0 at publication" in the common case). This
  required a data-model change: each row now exposes its own ordered
  `comparablePoints` list (§2.2), since the flat `cells` array can't support the
  walk. The only remaining "no data" outcome is a per-row `null` when D precedes
  R's earliest point (the work wasn't published yet as of D) → a meaningful empty
  cell with sr-only "no data for this work as of <date>".
- **C3b — selectability: NO column-level gate; the lead-in IS valid comparison
  data (user correction, 2026-09-24, walking back an over-restrictive interim
  draft).** An intermediate revision had gated selection to `!column.isLeadIn`
  (excluding synthetic lead-in-only columns from being pinned/hovered). The user
  clarified the lead-in should be treated as real data for comparison. Since
  `comparablePoints` already encodes the lead-in as the earliest value-0 floor,
  the backward-walk (C3a) already handles the "just published" case on its own —
  the gate was redundant and is removed. Every date column, lead-in included, is
  now a valid pin/hover target; the sole "no data" path is the per-row `null`
  above. Net effect: a check removed, not added.
