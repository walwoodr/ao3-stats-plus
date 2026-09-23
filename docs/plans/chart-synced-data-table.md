# Plan: Chart hover-tooltip → below-figure synced data table

Status: **FINALIZED (2026-09-22) — ready for Testing (stage 3).** Locked decisions
D1–D6 (Discovery, 2026-09-22) plus the two Planning-stage UI decisions D-A and D-B
(confirmed by direct user answer, 2026-09-22) are all resolved — see "Decisions
resolved" at the end. No open decisions remain.

Supersedes the interaction described in `TECH_DEBT.md`'s 2026-09-12
`hover-tooltip-to-synced-table` entry and absorbs `ROADMAP.md`'s struck 2026-08-07
"table view as an alternative to the graph view" item (per that entry's 2026-09-21
scope note).

Discovery is complete; decisions D1–D6 (2026-09-22) are LOCKED and are not
relitigated here. This plan resolves the four technical/design risks Discovery
handed to Planning (reverse sync mechanism, transposed header semantics,
lead-in/zero-basis label placement, page-length/disclosure, and the shared-
subcomponent file-length budget).

---

## 1. Scope baseline (locked, for reference)

- D1 Replace, not supplement — the Recharts `<Tooltip>` popover is removed.
- D2 Uniform — `TrendChart`, `RatioChart`, and `MultiSeriesTrendChart` all get the table.
- D3 Transpose — time points are COLUMNS, series/metrics are ROWS.
- D4 Scroll only — horizontal scroll, no pagination/virtualization.
- D5 One table — the visible table REPLACES the sr-only accessible table and must
  preserve everything it carried for AT (lead-in/zero-basis labels; per-series
  `<colorRole> <shape> marker` identity descriptions).
- D6 Native table semantics are the accessible fallback; the bidirectional visual
  cross-highlight is a pointer/focus ENHANCEMENT, must not regress the axe scans,
  and the table itself must stay reasonably keyboard-readable.

Non-goals (unchanged): no change to the 10-slot shape+color scheme, CVD gate,
sparse-gap semantics, x-axis scale; no new charting/table dependency; no MASTER.md
token migration (style with the current Tailwind `text-ink`/`bg-card`/`border-ink/12`
/`accent` utility approach the charts and `BookmarkFeedItem` already use); no
backend/GraphQL/data-model changes.

---

## 2. Architecture

### 2.1 New and changed files

New:
- `frontend/src/lib/syncedTableModel.ts` — pure, unit-testable builders that convert
  each chart's props into the shared, transposed table model (columns = time points,
  rows = series). Consolidates the transpose, the lead-in/zero-basis column labels,
  and the sparse `"—"` cell logic (today's `cellValue` / `leadInLabel` /
  `zeroBasisLabels`) in one place, keeping the `.tsx` files under budget.
- `frontend/src/components/charts/SyncedDataTable.tsx` — the single presentational
  transposed table, shared by all three chart components (single-series is the N=1
  case). Owns the scroll container, sticky row-header column, native `<table>`
  semantics, active-column highlight, and the disclosure wrapper. Purely
  controlled: receives `activeDateKey` + `onActiveDateKeyChange`, holds no sync state.
- `frontend/src/components/charts/ActivePointOverlay.tsx` — a small component rendered
  as a child INSIDE each `<LineChart>` (Recharts 3 allows arbitrary chart children).
  It reads the current `activeDateKey`'s resolved data-space points and draws the
  in-chart emphasis (guide line + ringed markers) using Recharts' public scale hooks.
  This is a purely additive overlay — it does not try to control Recharts' internal
  tooltip/active state, so it cannot fight it.

Changed:
- `frontend/src/components/charts/TrendChart.tsx`
- `frontend/src/components/charts/RatioChart.tsx`
- `frontend/src/components/charts/MultiSeriesTrendChart.tsx`
  Each: remove `<Tooltip>` (and its imports/`formatTooltipLabel` popover wiring); own
  a `const [activeDateKey, setActiveDateKey] = useState<string | null>(null)`; wire the
  chart→table and table→chart sync (below); build the table model via
  `syncedTableModel.ts`; render `<ActivePointOverlay>` inside the chart and
  `<SyncedDataTable>` as a sibling of the `role="img"` figure; delete the old sr-only
  `<table>` and sr-only per-point marker spans (their content moves into the exposed
  table — see 2.4).

No change to call sites: `DashboardPage.tsx`, `WorkComparisonSection.tsx`,
`WorkComparisonBookmarksTab.tsx` keep rendering the same chart components with the
same props. The whole feature lives inside the three chart components plus the two
new shared components and the model helper.

### 2.2 Canonical join key

`dateKey: string` = the point's `capturedOn` (real ISO date, or the synthetic
lead-in/zero-basis `capturedOn`). It is the single identity correlating a chart
x-position with a table column. Every sync message is a `dateKey | null`.

### 2.3 Bidirectional sync — concrete mechanism (resolves Risk #1)

Verified against the installed `recharts@3.10.0` type declarations
(`node_modules/recharts/types/…`); all hooks/props used are documented public API.

Chart → table (the easy direction):
- Add to each `<LineChart>`:
  `onMouseMove={(state) => setActiveDateKey(resolveDateKey(state))}` and
  `onMouseLeave={() => setActiveDateKey(null)}`. The handler arg is Recharts'
  `MouseHandlerDataParam` (`state.activeLabel`, `state.activeTooltipIndex`,
  `state.activeCoordinate`, `state.isTooltipActive`).
- MultiSeriesTrendChart: XAxis `dataKey="capturedOn"` (category), so
  `state.activeLabel` IS the `capturedOn` string = `dateKey` directly.
- TrendChart / RatioChart: XAxis is numeric `dataKey="xValue"`, so `state.activeLabel`
  is the `xValue` integer; map to `dateKey` via
  `chartData.find((r) => r.xValue === state.activeLabel)?.capturedOn`
  (equivalently via `state.activeTooltipIndex` into `chartData`).
- VERIFICATION POINT (honest uncertainty): `onMouseMove`'s active fields are populated
  by Recharts' mouse middleware, which is believed to run independently of whether a
  `<Tooltip>` element is present. Testing must confirm this with a component test that
  fires pointer events and asserts the callback receives a defined `dateKey` with NO
  `<Tooltip>` rendered. Documented fallback if it does NOT: keep a zero-UI
  `<Tooltip content={() => null} cursor={false} />`. That renders no popover at all
  (content returns nothing) so D1 ("remove the huge popover") is still satisfied — it
  exists only to keep the active-index state alive. Default plan: no `<Tooltip>` at
  all; adopt the fallback only if Testing shows it is required.

Table → chart (the hard direction — solved additively, without touching Recharts'
internal state):
- On each date column header (`<th scope="col">`): `onMouseEnter`/`onFocus` →
  `onActiveDateKeyChange(dateKey)`; `onMouseLeave`/`onBlur` → `onActiveDateKeyChange(null)`.
- `<ActivePointOverlay>` is rendered as a child of `<LineChart>` and reads the active
  date's resolved points. Using the public hooks
  `useXAxisScale()` (since 3.8) / `useCartesianScale({ x, y })` (since 3.8) and
  `usePlotArea()` (since 3.1), it draws, for each series that has a value at that date,
  an emphasis ring at the point, plus (per the chosen highlight option) a vertical
  guide line spanning the plot area at that x. The chart component resolves
  `activeDateKey` → `activePoints: { x: number | string; y: number }[]` (it knows its
  own `xValue`/`capturedOn` mapping and each series' value at that date) and hands them
  to the overlay, so the overlay stays chart-shape-agnostic.
- Because the overlay is additive SVG driven by our own React state, it needs no
  controlled-`activeIndex` fight with Recharts. (Recharts 3 does also expose
  `Tooltip.defaultIndex`/`active` and read hooks like `useActiveTooltipLabel`,
  `useActiveTooltipDataPoints`, `useIsTooltipActive`; we deliberately prefer the
  additive overlay + chart-level `onMouseMove` because it is the most robust and least
  coupled to internal tooltip lifecycle.)

### 2.4 DOM restructure and the `role="img"` finding (resolves Risk #2 exposure)

FINDING (flag for Testing to verify with a real SR / axe): today the sr-only `<table>`
and sr-only marker spans are nested INSIDE `<figure role="img">`. `role="img"` is a
leaf role whose descendant semantics are generally not exposed to assistive tech, so
those surfaces are likely NOT actually reaching screen readers. Promoting the table to
a visible, interactive, AT-exposed surface REQUIRES lifting it out of that subtree.

Target structure per chart (single card container; heading id shared):

```
<div className="card…">                         (was the <figure>; now the outer card)
  <h3 id={headingId}>{title}</h3>
  {description && <p id={descriptionId}>…</p>}
  <figure role="img" aria-labelledby={headingId} aria-describedby={descriptionId}>
    <div aria-hidden="true">
      <ResponsiveContainer><LineChart onMouseMove onMouseLeave>
        …existing Lines…
        <ActivePointOverlay activePoints={…} showGuideLine={…}/>
      </LineChart></ResponsiveContainer>
    </div>
  </figure>
  <ComparisonLegend … />                          (multi-series only; unchanged)
  <SyncedDataTable                                (VISIBLE, outside role="img")
    title={title} …
    activeDateKey={activeDateKey}
    onActiveDateKeyChange={setActiveDateKey}/>
</div>
```

The old sr-only `<table>` and sr-only per-point marker `<span>`s are both removed; the
exposed `SyncedDataTable` now carries all their accessible content (dates/labels,
values, per-series identity descriptions). This is the cleanest reading of D5's
"promote to ONE table" and avoids maintaining redundant hidden surfaces of dubious
exposure. (The empty-state / `series.length === 0` branches keep their current
non-figure markup and simply render no table.)

---

## 3. Happy path

1. A logged-in author opens their dashboard. Stats load; the aggregate metric chart
   renders (e.g. "Total hits") as before, minus the old hover popover.
2. Below the chart, a horizontally scrollable data table is present (disclosure per the
   chosen option in §9). Columns are the capture dates left→right (oldest→newest);
   the single row is "Hits", one value per date. A sticky left column keeps the row
   label visible while the user scrolls dates sideways.
3. The user moves the pointer across the chart. As the pointer nears a snapshot,
   `onMouseMove` fires; the chart resolves the active `dateKey` and highlights that
   date's COLUMN in the table (tinted cells + emphasized column header). No popover
   appears.
4. The user moves the pointer onto a date column header in the table. That column's
   `dateKey` is pushed back to the chart; the `ActivePointOverlay` draws a guide line +
   ring on the corresponding point(s) in the chart above.
5. On a multi-series comparison chart, the same interaction lets the user read every
   selected work's exact value at one date across a single tinted column — the primary
   motivation ("read exact values across multiple series at once", shrink the on-hover
   footprint).
6. Moving the pointer away (`onMouseLeave`/`onBlur`) clears the highlight in both
   directions.

---

## 4. Data model (backend)

N/A. No backend/GraphQL/schema/migration change. Every value is already in the props
these components receive (`points`/`series`/`leadIn`). The only new "model" is the
front-end-only transposed view model in `syncedTableModel.ts` (§5.2).

---

## 5. Frontend design

### 5.1 Component tree (unchanged call sites)

`DashboardPage` → `MetricToggle` → `TrendChart` → { `figure[role=img]` (chart +
`ActivePointOverlay`), `SyncedDataTable` }.
`WorkComparisonSection` → `MetricToggle` → `MultiSeriesTrendChart` → { figure,
`ComparisonLegend`, `SyncedDataTable` }; and the Bookmarks tab →
`WorkComparisonBookmarksTab` → (By-Type up to 3, By-Work up to 10)
`MultiSeriesTrendChart` instances, each now with its own `SyncedDataTable`.

### 5.2 Shared table model (`syncedTableModel.ts`)

```
export interface SyncedTableColumn {
  dateKey: string;      // canonical join key = capturedOn (real or synthetic)
  label: string;        // display: ISO date OR lead-in/zero-basis label
  isLeadIn: boolean;
}
export interface SyncedTableRow {
  seriesKey: string;            // stable id: "value"/"ratio" (single) or work-<id> / type key
  title: string;                // row-header display name
  identityDescription?: string; // "<colorRole> <shape> marker" (multi-series only; sr text)
  colorHex?: string;            // row-header glyph fill/stroke (multi-series)
  shape?: MarkerShapeName;      // row-header glyph shape (multi-series)
  cells: (number | string)[];   // aligned to columns[]; "—" for missing/sparse
}
export interface SyncedTableModel {
  columns: SyncedTableColumn[];
  rows: SyncedTableRow[];
  unitLabel: string;            // "Hits" / "Kudos-to-hits ratio" / "Bookmarks"
}
```

Three thin builders (one per chart shape) produce this; single-series builders emit
exactly one row with no `identityDescription`/glyph. The multi-series builder reuses
the existing `buildChartData`/`zeroBasisLabels`/`cellValue`/`describeStyle` logic,
lifted here (or imported) so behavior is identical — sparse cells become `"—"`, a
lead-in-only column takes its zero-basis label, a shared slot that coincides with a
real capture keeps the raw ISO date. Lead-in/zero-basis columns get `isLeadIn: true`
and never surface a raw ISO date (resolves Risk #3: the label that used to live in the
tooltip/`formatTooltipLabel` and the sr-only table's date cell now lives in the
COLUMN header).

### 5.3 `SyncedDataTable` — structure & header semantics (resolves Risk #2)

Native `<table>` inside an `overflow-x-auto` scroll container inside a `<details>`
disclosure (§9):

- `<table>` with `aria-label={title}` (matches the figure's accessible name so the
  data surface is discoverable and associated with the chart).
- `<thead><tr>`:
  - corner cell: `<th scope="col">` — sr-only/quiet label for the row-header dimension
    ("Metric" for single-series, "Work"/"Series" for multi-series). Sticky top-left.
  - one `<th scope="col">` per column: the date/label text; carries the hover/focus
    handlers that drive table→chart sync; gets the active-column header styling. Long
    lead-in labels wrap or truncate with a `title`/`abbr`.
- `<tbody>`: one `<tr>` per series:
  - `<th scope="row">`: the series title; for multi-series, a small inline SVG glyph
    (reusing `renderMarkerShape` + the slot color) AND a visually-hidden
    `identityDescription` ("slate-blue circle marker") so the shape/color identity that
    used to sit in the old sr-only column headers reaches AT here (D5). Sticky left.
  - `<td>` per column: the value, or `"—"` for a missing/sparse cell; gets active-column
    cell tint when its column is active.

This yields correct matrix associations: every data cell is announced with its column
header (the date) and row header (the series) — e.g. "Comparison Work 1, 2026-01-03,
100". Single-series is the degenerate one-row case (row header = unit label).

### 5.4 Highlight treatment

Recommended (pending confirmation, §9): guide line + ringed markers.
- In-chart (`ActivePointOverlay`): a ~1px vertical line in `colors.accent` at low
  opacity spanning the plot area at the active x, plus a `colors.accent` ring
  (`fill="none"`, r = marker r + 2–3) around each series' point at that date. Colors
  resolved via `useChartColors()` (same seam as the rest of the chart; theme-reactive).
- In-table: the active column's `<th>`/`<td>`s get a light `bg-accent/10` tint (ink
  text unchanged, so contrast stays ≥4.5:1) and the header a slightly stronger
  treatment. Color/border only — no transform — per MASTER.md's restrained-motion rule.

### 5.5 Scroll & sticky (D4)

`overflow-x-auto` on the wrapper; the row-header column is `sticky left-0 bg-card z-10`
so series labels stay visible while many date columns scroll sideways. No
virtualization/pagination. A very wide table simply scrolls.

### 5.6 Styling

Current-frontend Tailwind utilities only (`text-ink`, `text-ink-soft`, `bg-card`,
`border border-ink/12`, `bg-accent/10`, mono font for numerics via the existing
`var(--font-mono)` usage) — consistent with the chart cards and `BookmarkFeedItem`,
NOT MASTER.md token migration.

---

## 6. Corner cases

- Single data point (single-series): table has one column; sync still works; overlay
  rings the lone point.
- Lead-in present: first column is the synthetic lead-in with its estimated-baseline /
  zero-basis label (never a raw ISO date); value 0 (single-series) or per-series 0/`"—"`
  (multi-series). Hovering it highlights the lead-in dot the same way.
- Sparse / missing cells (multi-series, public/private bookmarks): `"—"`; hovering that
  column rings only the series that HAVE a value there (overlay skips `"—"`/null).
- Wide series (long history, up to 10 works): horizontal scroll only (D4); sticky
  row-header keeps orientation. This is the page-length amplifier behind §9.
- Empty state (`points`/`series` empty): existing empty-state branch renders; no table.
- By-Work Bookmarks with many selected works: up to 10 charts each with a table stacked
  — the strongest argument for a collapsible/collapsed disclosure default (§9).
- Rapid pointer movement / leaving the chart between points: `onMouseLeave` clears;
  `activeDateKey` is a single nullable value so there is no stale multi-highlight.
- Theme switch mid-interaction: highlight colors come from `useChartColors()` and flip
  with `prefers-color-scheme` like the rest of the chart.
- Concurrent charts on one page: each chart component owns its OWN `activeDateKey`
  state, so highlighting one chart's table never cross-triggers another chart.

---

## 7. Error states

- No new network/data paths, so no new fetch/error handling. Backend errors remain
  handled by `DashboardPage`'s existing token-mismatch/network branches.
- Defensive (front-end only): if `onMouseMove` yields an `activeLabel` that maps to no
  known `dateKey` (shouldn't happen), `resolveDateKey` returns `null` and nothing
  highlights — never throw. If a Recharts scale hook returns `undefined` (chart not yet
  laid out), `ActivePointOverlay` renders nothing for that frame rather than throwing.
- Malformed/duplicate dates are already normalized upstream by `buildChartData`; the
  table model consumes that same normalized data, so no new validation is introduced.
- Logging: none needed (pure client interaction). No retry/recovery semantics apply.

---

## 8. Accessibility (first-class)

- Semantics: real `<table>` with `<th scope="col">` (dates + corner) and
  `<th scope="row">` (series), giving correct row/column association for every value.
  The table lives OUTSIDE `role="img"` so it is actually exposed to AT (fixes the
  latent nesting issue in §2.4 — Testing to verify with axe and, ideally, a real SR).
- Keyboard (D6): the native table is fully readable via standard AT table navigation —
  that IS the accessible fallback. We deliberately do NOT make every date column a tab
  stop (that would explode focus order and add axe risk); the cross-highlight is a
  pointer/focus enhancement only. Column headers respond to `onFocus`/`onBlur` too, so
  if a column header naturally receives focus the highlight still fires, but no new
  forced tab stops are introduced.
- Identity for AT: each series row header carries a visually-hidden
  `"<colorRole> <shape> marker"` description (moved from the old sr-only column headers)
  so colorblind/SR users still get a unique per-series identity — preserving the
  MASTER.md "shape is the non-color channel" guarantee.
- Dynamic content: the highlight is purely decorative (visual tint + SVG overlay inside
  the aria-hidden chart), so NO `aria-live` and no focus movement — it must not announce
  or steal focus. This keeps it silent to AT, which is correct for a hover cue.
- Contrast: active-column tint is `bg-accent/10` under unchanged ink text (≥4.5:1);
  overlay guide line/ring is a graphical object (SC 1.4.11, ≥3:1) in `accent`. Verified
  by the existing light + dark axe scans.
- Disclosure: native `<details>`/`<summary>` is keyboard-operable and screen-reader-
  announced for free ("Data table, collapsed/expanded button").
- Regression gate: `frontend/tests/accessibility.spec.ts` must stay green in light AND
  dark; add coverage for the new table (see §10).

---

## 9. Planning-stage UI decisions (RESOLVED)

Both UI decisions that Discovery did not lock were resolved by direct user answer
(2026-09-22), both matching the plan's recommended defaults. Full text under "Decisions
resolved" (D-A, D-B) at the end; summary here:

D-A. Table disclosure default — RESOLVED: `SyncedDataTable` takes a `defaultOpen` prop
defaulting `true` (open/collapsible everywhere via native `<details>`), EXCEPT the
By-Work Bookmarks view (up to 10 stacked charts), where the call site passes
`defaultOpen={false}` so those tables default closed.

D-B. In-chart highlight treatment — RESOLVED: vertical guide line + ringed markers
(§5.4 as written).

---

## 10. Task list (Testing → Implementation → Retrospective)

Test-first: Testing writes these red against this plan; Implementation makes them green.
Commit cadence = one commit per completed item (CODE_STANDARDS.md).

### Testing (stage 3) — write failing tests
- T1. `syncedTableModel.test.ts` (Vitest, unit): single-series builder → one row, N
  columns, correct unit label, no identity description; lead-in column labeled (no raw
  ISO), value 0.
- T2. `syncedTableModel.test.ts`: multi-series builder → one row per series, sparse
  cells `"—"`, shared-slot vs lead-in-only column labeling matches current
  `zeroBasisLabels`/`cellValue` behavior, row identity description
  `"<colorRole> <shape> marker"` present per series.
- T3. `SyncedDataTable.test.tsx`: renders `role="table"` named by title; `<th scope="col">`
  per date + corner; `<th scope="row">` per series; every value cell present; single-
  series degenerate case renders one row.
- T4. `SyncedDataTable.test.tsx`: hovering/focusing a date column header calls
  `onActiveDateKeyChange(dateKey)`; leaving calls it with `null`; the matching column
  gets the active tint class when `activeDateKey` is set (controlled).
- T5. `SyncedDataTable.test.tsx`: disclosure — `<details>`/`<summary>` present and
  keyboard-operable; `defaultOpen` prop honored (D-A: default `true`; By-Work passes `false`).
- T6. `TrendChart.test.tsx` (rewrite): no Recharts `<Tooltip>` popover in the tree; the
  data surface is now the VISIBLE table (transposed: dates as columns) rendered OUTSIDE
  `role="img"`; lead-in column label present, raw ISO not leaked; empty-state unchanged.
  Remove/replace obsolete sr-only marker-span and date-per-row table assertions.
- T7. `RatioChart.test.tsx` (rewrite): mirror of T6 for the ratio series.
- T8. `MultiSeriesTrendChart.test.tsx` (+ `.leadIn`/`.solidLines` as needed): table is
  transposed and visible; per-series identity descriptions now in row headers; sparse
  `"—"`; `buildChartData` behavior unchanged.
- T9. Chart→table sync (component test): firing pointer move over the chart resolves an
  `activeDateKey` and tints the matching table column — AND explicitly assert this works
  with NO `<Tooltip>` element present (the §2.3 verification point). If it fails,
  Implementation adopts the zero-UI `<Tooltip content={() => null}>` fallback and this
  test is updated to assert no visible popover renders.
- T10. Table→chart sync (component test): setting `activeDateKey` (via table header
  hover/focus) causes `ActivePointOverlay` to render emphasis (guide line + rings, D-B) at the
  right point(s); `null` clears it.
- T11. `accessibility.spec.ts` additions: populated dashboard with the visible table —
  no axe violations in light AND dark; table exposes proper `table`/`row`/columnheader/
  rowheader roles; assert the table is NOT inside the `role="img"` subtree.
- T12. Storybook stories updated (`*.stories.tsx` for all three charts): show the synced
  table state (and a highlighted-column state) so `addon-a11y` scans it too.

### Implementation (stage 4) — make them pass
- I1. Add `syncedTableModel.ts` with the three builders (lift `cellValue`/
  `leadInLabel`/`zeroBasisLabels`/`describeStyle` logic).
- I2. Build `SyncedDataTable.tsx` (transposed table, scroll container, sticky row-header,
  active-column highlight, `<details>` disclosure with `defaultOpen`).
- I3. Build `ActivePointOverlay.tsx` (public scale hooks; guide line + rings, D-B).
- I4. `TrendChart.tsx`: remove `<Tooltip>`/`formatTooltipLabel` popover; add
  `activeDateKey` state + `onMouseMove`/`onMouseLeave`; render overlay + table sibling;
  restructure so the table is outside `role="img"`; delete old sr-only table + markers.
- I5. `RatioChart.tsx`: same as I4.
- I6. `MultiSeriesTrendChart.tsx`: same, plus row-header glyph/identity wiring; keep it
  under the 500-line `.tsx` budget (heavy markup now lives in `SyncedDataTable`).
- I7. Wire the By-Work Bookmarks call path to pass `defaultOpen={false}` (D-A) in
  `WorkComparisonBookmarksTab`; all other call sites keep the `true` default.
- I8. Update stories; run ESLint/Prettier/RuboCop-N/A; confirm axe green light+dark.

### Retrospective (stage 8) — evaluate against
- R1. Was the §2.3 verification point (active state without `<Tooltip>`) resolved by
  test, and did the fallback prove necessary? Capture the actual answer.
- R2. Did the `role="img"` exposure finding hold up under a real SR / axe, and should a
  broader audit of other `role="img"` figures (legend exposure) be filed to TECH_DEBT?
- R3. Did the shared `SyncedDataTable`/`syncedTableModel` split keep all three chart
  `.tsx` files under budget? Any that still crowd the cap?
- R4. Did the resolved disclosure default (D-A: By-Work closed, others open) actually
  control page length in the worst-case By-Work (10 works) view, or need revisiting?
- R5. Coverage ≥85% for the new files (CODE_STANDARDS baseline).
- R6. Any residual Recharts coupling risk (the additive-overlay bet) worth noting for a
  future Recharts 4 upgrade (Customized is deprecated for removal in 4.0; we avoided it,
  but confirm no other 3.x-only reliance crept in).

---

## 11. Infra / hosting cost estimate

N/A — no new paid infrastructure; front-end-only change, no new dependencies.


---

## Decisions resolved

Locked pre-Planning by Discovery (D1–D6, 2026-09-22, see §1) and NOT relitigated. The
two Planning-stage UI decisions below (D-A, D-B) were resolved by direct user answer
(2026-09-22), both matching this plan's recommended defaults — no open decisions remain.

- **D-A — table disclosure default: open/collapsible everywhere via native
  `<details>`, EXCEPT the By-Work Bookmarks view (default closed).** `SyncedDataTable`
  exposes a `defaultOpen` prop defaulting `true`, so every table renders expanded but
  collapsible. The one exception is the By-Work Bookmarks sub-view, which can stack up
  to 10 charts (one per selected work) each with its own table; that call site
  (`WorkComparisonBookmarksTab`'s By-Work path) passes `defaultOpen={false}` so those
  tables default closed, keeping the worst-case page length in check. This is the light
  "hybrid" the plan recommended, resolving the stated tension (the feature's motivation
  was to shrink the on-hover footprint, so the many-charts context defaults collapsed
  while single/low-count charts stay open for at-a-glance value reading).
- **D-B — in-chart highlight treatment: vertical guide line + ringed markers.** When a
  table column (a date) is hovered or focused, `ActivePointOverlay` draws BOTH a subtle
  vertical `--color-accent` guide line spanning the plot area at that date AND an accent
  ring around each series' point marker at that date (§5.4). Chosen over markers-only or
  guide-line-only as the clearest cross-reference for multi-series comparison, which is
  the feature's primary use case.
