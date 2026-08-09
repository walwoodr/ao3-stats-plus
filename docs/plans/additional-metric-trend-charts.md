# Plan: Additional metric trend charts (comments, bookmarks, subscriptions)

Status: **FINALIZED — all design decisions resolved. Ready for Testing
(stage 3).** The top-level presentation pattern (Option B, metric toggle —
§3.0), the RatioChart removal (§3.0.1), and the bookmarks sub-interaction
(§3.4, resolved as a By-Work / By-Type sub-tab synthesis) are all locked in.
One trivial, non-blocking assumption is flagged in §3.4 (which sub-tab is the
default) — reversible in a line, not a gate on Testing. See "Decisions
resolved" at the end.

Source: Discovery (conversational, no persisted doc per this project's
convention) confirmed the backend/GraphQL already exposes every metric this
feature surfaces — the only real work is frontend (extend the query + TS
types, then render). Scope was pinned down with the user directly.

## Confirmed scope (do not relitigate)

Surface already-captured-but-not-graphed metrics as new trend charts,
reusing the existing chart components (`TrendChart` for account-level,
`MultiSeriesTrendChart` for per-work). Frontend-only. No backend / schema /
migration / scraper change.

1. **Per-work**: `comments`, `bookmarks` (BOTH the always-present total
   `bookmarks` count AND the sparse/nullable `public_bookmarks` /
   `private_bookmarks` split from work-page enrichment), and per-work
   `subscriptions`.
2. **Account-level**: `total_user_subscriptions` ONLY (people subscribed to
   the author). NOT `total_subscriptions`, NOT account-level
   comments/bookmarks.
3. **Presentation pattern — Option B (metric toggle)**, applied consistently
   to BOTH `DashboardPage.tsx` (account-level) and
   `WorkComparisonSection.tsx` (per-work). See §3.0.
4. **RatioChart removed from the UI** (user-requested). The component, its
   logic, and its tests are NOT deleted — kept intact but unwired. See
   §3.0.1.
5. **Bookmarks split — grouped under a "Bookmarks" metric tab, with a
   second-level `[By Work] [By Type]` sub-tab** (a synthesis of the drafted
   Options 1 and 3). See §3.4.
6. **One combined plan** covering all of the above (user confirmed).

## Scope verification (verified against the codebase, not assumed)

- **Backend serves everything already.**
  `backend/app/graphql/types/per_work_point_type.rb` exposes `comments`
  (non-null), `bookmarks` (non-null), `subscriptions` (non-null),
  `public_bookmarks` (nullable), `visible_comments` (nullable), derived
  `private_bookmarks` (nullable — `bookmarks - public_bookmarks`, clamped
  `>= 0`, null when `public_bookmarks` was never captured).
  `backend/app/graphql/types/aggregate_series_point_type.rb` exposes
  `total_user_subscriptions` (non-null). No Rails / schema / GraphQL-type
  work.
- **The only gap is the frontend query + types.**
  `frontend/src/queries/useStatsForUser.ts` does NOT request any of these
  fields, and `interface AggregateSeriesPoint` / `interface PerWorkPoint`
  don't declare them.
- **Chart components already exist and cover BOTH bookmarks sub-views without
  modification.** `TrendChart` (single-series + optional lead-in) and
  `MultiSeriesTrendChart` (renders any `SeriesDatum[]` — `title` drives the
  legend/table label, `styleIndex` drives the shape+color glyph, chart-level
  `title` prop is the heading). Confirmed by reading both. The By-Work
  sub-view (§3.4) reuses `MultiSeriesTrendChart` by passing the three bookmark
  TYPES as its series rather than works — no component change.
- **Design context already covers the conventions.**
  `design-system/ao3-stats-plus/MASTER.md` "Chart Guidance" and "Multi-Series
  Comparison Charts" (10-slot shape+color scheme, `connectNulls={false}`
  "never fabricate a zero", dash reserved for the lead-in only, visible
  legend + sr-only table). One note-level addition proposed (§4.1).

## Tech-stack check

No new dependency. Recharts, `@axe-core/playwright`, Vitest, Playwright,
TanStack Query, `graphql-request`, Zustand, Tailwind, MUI (only where already
used) are all approved (`TECH_STACK.md`). The metric toggle and the
bookmarks sub-tab are both plain semantic `role="tablist"` + Tailwind; the
By-Type type-selector is native `<input type="checkbox">` + `<label>`. No new
component library.

## 1. Happy path

1. Author opens `/:username`; `statsForUser` resolves. The query now also
   selects per aggregate point `totalUserSubscriptions`; and per per-work
   point `comments`, `bookmarks`, `subscriptions`, `publicBookmarks`,
   `privateBookmarks`.
2. `DashboardPage` shows the account-level trend region as a **metric toggle**
   (`role="tablist"`): `[ Hits | Kudos | Subscribers ]` over one `TrendChart`.
   Total subscribers comes from `totalUserSubscriptions`. The **Kudos-to-hits
   ratio chart no longer renders** (§3.0.1).
3. `WorkComparisonSection` shows the per-work comparison as a **metric
   toggle**: `[ Hits | Kudos | Comments | Bookmarks | Subscriptions ]` over a
   single `MultiSeriesTrendChart` (one line per selected work) for the
   selected metric. The picker + range slider controls island stays above the
   toggle and drives every metric.
4. Selecting the **Bookmarks** tab reveals a second-level sub-tab
   `[ By Work | By Type ]` (§3.4):
   - **By Type** — a Total/Public/Private checkbox group; each checked type
     renders as its own stacked `MultiSeriesTrendChart` (one line per selected
     work). Grouped by metric-type.
   - **By Work** — for every currently-selected work (in selection order),
     one chart plotting that work's Total/Public/Private as three
     distinguishable lines. Grouped by work.
   Both draw from the same total/public/private data; sparse public/private
   points render as gaps, never fabricated zeros (§4.1).
5. Every rendered chart keeps the existing accessibility skeleton (figure
   `role="img"`, `aria-hidden` SVG, sr-only per-point markers, sr-only data
   table; multi-series also keeps the visible `ComparisonLegend`).

## 2. Data model (backend)

**N/A — verified, load-bearing.** Every field read here is already defined on
`PerWorkPointType` and `AggregateSeriesPointType` and already resolved. No
migration, model field, association, validation, or resolver change. If
Testing or Implementation edits anything under `backend/`, the scope was
misread — stop and re-check.

## 3. Frontend design

### Files touched (all frontend)

| File | Change |
|---|---|
| `src/queries/useStatsForUser.ts` | Add fields to `STATS_FOR_USER_QUERY` (both blocks); extend `AggregateSeriesPoint` (+`totalUserSubscriptions`) and `PerWorkPoint` (+`comments`, `bookmarks`, `subscriptions`, `publicBookmarks`, `privateBookmarks`). |
| `src/routes/DashboardPage.tsx` | Wrap account-level trends in the metric toggle; **remove the `RatioChart` render + dead wiring** (`ratioLeadIn`, import) (§3.0.1). |
| `src/routes/DashboardPage.test.tsx` | Remove/replace ratio-chart assertions (~lines 197, 243–265); add tablist assertions. |
| `src/components/WorkComparisonSection.tsx` | Generalize `buildSeries` (§3.2); wrap per-work charts in the metric toggle; add the Bookmarks tab's `[By Work][By Type]` sub-tab + By-Type checkbox group + By-Work per-work charts (§3.4). |
| `src/components/WorkComparisonSection.regression.test.tsx` | Update the "aggregate section (TrendChart x2 + RatioChart)" case (~line 443) for the toggle + ratio removal. |
| `src/components/charts/MetricToggle.tsx` (NEW) | A reusable `role="tablist"` segmented control, used for BOTH the top-level metric toggle AND the nested Bookmarks `[By Work][By Type]` sub-tab (nested tablists are valid ARIA). Extracted to keep the page/section files under budget and put the tablist a11y in one tested place. |
| `src/lib/perWorkMetrics.ts` (NEW, if needed for budget) | Config array `{ key, label, valueLabel, valueOf, sparse, applyLeadIn }` per metric, keeping the render loop declarative. |
| `src/components/charts/MultiSeriesTrendChart.tsx` | Only if the shared empty-state affordance (§4.2) lands here instead of in `WorkComparisonSection`; otherwise UNCHANGED — By-Work reuses it as-is. |
| `design-system/ao3-stats-plus/MASTER.md` | Sparse-series note (§4.1); and a note documenting the fixed Total/Public/Private type→style mapping used in the By-Work sub-view (§3.4). |
| `TECH_DEBT.md` | Append the orphaned-RatioChart/`kudosToHitsRatio` note (§3.0.1). |
| Test fixtures (many) | New TS fields ripple into fixtures (§7 note). |
| **NOT touched:** `RatioChart.tsx`, `RatioChart.test.tsx`, `RatioChart.stories.tsx` | Deliberately kept intact but unrendered (§3.0.1). |

### 3.0 Presentation pattern — Option B (metric toggle)

A `role="tablist"` segmented control selects which single metric renders in
one chart region below it, applied consistently to both surfaces:

- **Account-level (`DashboardPage`):** `[ Hits | Kudos | Subscribers ]` over
  one `TrendChart`.
- **Per-work (`WorkComparisonSection`):**
  `[ Hits | Kudos | Comments | Bookmarks | Subscriptions ]` over one
  `MultiSeriesTrendChart` (except Bookmarks, which expands into §3.4's
  sub-tabs); the controls island (picker + slider) stays above the toggle and
  drives all metrics.

Its accepted costs: one metric visible at a time, a selected-metric state,
and a tablist ARIA surface (§6).

Selected-metric state (implementation detail, not a user call): persist the
per-work selected metric per-username in the existing `useWorkComparisonStore`
(alongside selection/range); account-level selected metric = plain `useState`.

### 3.0.1 RatioChart removal (user-requested)

**What:** the Kudos-to-hits ratio chart no longer renders on `DashboardPage`.
Remove the `<RatioChart .../>` render, the `RatioChart` import, and the dead
`ratioLeadIn` computation. Update `DashboardPage.test.tsx` and the one
`WorkComparisonSection.regression.test.tsx` assertion referencing it. **Do
NOT delete** `RatioChart.tsx`, `RatioChart.test.tsx`, or
`RatioChart.stories.tsx` — kept intact, just unreferenced by rendered app
code.

**Why (confirmed against the plan's reasoning space, not assumed):** Option
B's model is "pick one count metric" on a shared count y-axis. The ratio is a
*derived 0–1 proportion* on a different scale and a different chart type
(`RatioChart`, not `TrendChart`) — categorically not "a metric you pick" the
same way. Rather than special-case it (always-visible carve-out) or mislead
(fold it in as a peer of raw counts), the user chose to drop it from the UI.

**Orphaned-code paper trail (TECH_DEBT.md, appended during Implementation):**
after this change, `RatioChart.*` are unreferenced by rendered UI, and the
`kudosToHitsRatio` query field / type field / top-level
`statsForUser.kudosToHitsRatio` are fetched but unused. Proposed entry
(date-stamp at commit time):
`- [2026-08-07] (stage: Implementation) RatioChart.tsx + its tests/stories,
and the kudosToHitsRatio GraphQL field (aggregate + top-level), are now
unreferenced by rendered UI after the ratio chart was removed from
DashboardPage per docs/plans/additional-metric-trend-charts.md §3.0.1. Kept
deliberately for possible future reuse — flagged so it isn't mistaken for a
live feature nor silently deleted as dead code. Future cleanup could drop the
kudosToHitsRatio selection from STATS_FOR_USER_QUERY if the ratio view isn't
reinstated.`

### 3.1 Per-work new metrics (mechanics)

Non-sparse new metrics — Comments, Bookmarks(total), Subscriptions — render
like Hits/Kudos: one line per work via `MultiSeriesTrendChart`, window-
filtered by the range slider, with the per-work zero-basis lead-in applied.
The per-work identity model is unchanged: `styleAssignment` (workId → style
slot) is shared across every metric's chart, so a work keeps ONE (shape,
color) identity across all the top-level metric tabs.

### 3.2 `buildSeries` generalization (`WorkComparisonSection.tsx`)

Generalize `buildSeries` to take a value extractor
`(point: PerWorkPoint) => number | null` plus an `applyLeadIn` flag. Non-
sparse metrics behave as now; sparse metrics (public/private) drop null-valued
points and pass `leadIn: undefined`. Existing window-filtering, style-slot
assignment, and lead-in gating stay intact.

### 3.3 Bookmark split sparse mechanics (shared by both sub-tabs)

- `publicBookmarks` nullable (present only where enrichment ran);
  `privateBookmarks` null exactly when `publicBookmarks` is null.
- Filter out null-valued points before handing a sparse series to
  `MultiSeriesTrendChart`; its `buildChartData` emits `null` at those dates
  and `connectNulls={false}` renders gaps / isolated markers — the existing
  "never fabricate a zero" path. No new chart mechanism.
- No zero-basis lead-in on the sparse public/private series (their first
  enrichment point is not the work's first capture). Total keeps its lead-in.

### 3.4 Bookmarks sub-interaction — RESOLVED (By-Work / By-Type sub-tab synthesis)

Within the top-level **Bookmarks** metric tab, a second-level sub-tab control
`[ By Work | By Type ]` (a nested `role="tablist"`, reusing `MetricToggle`)
switches how the same total/public/private data is organized. This is the
user's synthesis of the two drafted options ("add a sub-tab selection option
so that the user can see bookmarks 'by work' or 'by type', then 'by work'
shows option 3 with all graphs displayed by selection order, and 'by type'
shows option 1"). Written up below; I confirm this reading matches the user's
words, with one trivial flagged assumption (default sub-tab) noted at the end.

```
[ Hits | Kudos | Comments |*Bookmarks*| Subscriptions ]   <- top-level metric tablist
  [ By Work |*By Type*]                                    <- nested sub-tablist
  (sub-tab content per below)
```

**"By Type" sub-tab = drafted Option 1, unchanged.** A Total/Public/Private
checkbox group (Total checked by default; Public/Private unchecked). Each
*checked* type renders as its OWN stacked `MultiSeriesTrendChart` — one line
per selected work — reusing the comparison-chart pattern verbatim (each work
keeps its stable `styleAssignment` shape+color across these charts, exactly as
in the other metric tabs). Grouped by metric-type.
```
Bookmark types:  [x] Total   [x] Public   [ ] Private
[ Total bookmarks   chart: one line per work + legend + a11y table ]
[ Public bookmarks  chart: one line per work + legend + a11y table ]  (gaps where sparse)
```

**"By Work" sub-tab = drafted Option 3, generalized to ALL selected works.**
For every work currently in the comparison set — **in selection order** — one
chart plotting that work's Total, Public, and Private as three lines. No
focus-work picker: every selected work gets its own chart.
```
Focus each work; totals/public/private as three lines within a single work's chart:
[ "Work A" chart:  Total / Public / Private lines + legend + a11y table ]
[ "Work B" chart:  Total / Public / Private lines + legend + a11y table ]
...one chart per selected work, stacked in selection order...
```
- **Why identity channels are free here:** each By-Work chart holds exactly
  ONE work's data, so shape+color are not needed to distinguish works and are
  repurposed to distinguish the three bookmark TYPES within that chart.
  Implementation: pass three `SeriesDatum` to the unchanged
  `MultiSeriesTrendChart` — `title` = "Total"/"Public"/"Private",
  `styleIndex` = a **fixed** 0/1/2 (so Total is always the slot-0
  circle/slate-blue, Public always slot-1 square/teal, Private always slot-2
  triangle/sage — learnable once, consistent across every work's chart); the
  chart-level `title` prop = the work's title. The `ComparisonLegend` and
  sr-only table then label the three lines by type. This fixed type→style
  mapping is documented in MASTER.md (§ files table).
- **Ordering precedent (cited, not invented):** "selection order" is the
  existing `orderedSelectedWorks` order in `WorkComparisonSection.tsx` (the
  `selectedWorkIds`-driven order that already governs legend/table column
  order and style-slot assignment — see its inline comment "Selection order
  (not perWorkSeries order) drives both the legend/table column order and the
  style assignment lookup"). By-Work charts stack in that same order.
- **Lead-in:** Total keeps its zero-basis lead-in (non-sparse); Public/Private
  get none (§3.3). Dash still means only "pre-data lead-in," un-conflicted by
  the type differentiation (which uses shape+color, not dash).

**Shared:** both sub-tabs pull from the same underlying total/public/private
points — By-Type groups them by metric-type (one chart per type, N work-
lines), By-Work groups them by work (one chart per work, 3 type-lines). Sub-
tab selection and the By-Type checkbox states are minor ephemeral view state
(`useState`), not persisted — an implementation detail, not a user call.

**Flagged trivial assumption (non-blocking):** the user didn't state which
sub-tab is the *default* when Bookmarks is first opened. I assume **By Type**
(closest to a plain "bookmarks over time" comparison, and its Total-on default
is the simplest first view). This is reversible in one line and does not gate
Testing; note it for the user to override if they prefer By Work.

### 3.5 Design-token consistency (cite, don't re-derive)

- Account-level toggle chart: `TrendChart` unchanged (solid `--color-ink`
  line, dashed `--color-ink-soft` lead-in, category axis, JS-resolved colors
  via `useChartColors`).
- Per-work charts (both sub-tabs): `MultiSeriesTrendChart` unchanged (shape+
  color from `SERIES_STYLE_SLOTS` / `colors.series`, solid lines, dashed
  ink-soft lead-in reserved for zero-basis, visible `ComparisonLegend`). By-
  Work reuses the same slots 0–2 for the three types.
- `MetricToggle` (both levels) inherits the existing focus-ring token
  (`--color-accent`, `outline-offset: 2px`) and card/border tokens; active
  tab reuses `--color-ink` on `--color-card` per MASTER.md's button/tab
  treatment. Checkboxes use the input token styling already in MASTER.md's
  Inputs spec.

## 4. Corner cases

1. **Sparse interior gaps (public/private), both sub-tabs.** Enrichment only
   at some dates → isolated markers, no line across gaps
   (`connectNulls={false}`). Correct/honest. MASTER.md needs no new
   *mechanism*; add a one-line NOTE to its Multi-Series section:
   "enrichment-derived sparse series (public/private bookmarks) render
   interior nulls as gaps / lone markers, same `connectNulls={false}` rule —
   a gap means 'not captured', never zero."
2. **By-Type: a checked type with ZERO data across all selected works** (e.g.
   Public checked but no selected work has public data). That type's chart has
   an empty date union and would render a blank frame (the component only
   short-circuits on `series.length === 0`). Guard it: show "No public/private
   bookmark data captured yet for the selected works." instead of a blank
   chart. Preferred: `WorkComparisonSection` decides whether to render each
   sparse chart.
3. **By-Work: a selected work with ZERO enrichment data.** NOT an error — its
   chart still renders the always-present **Total** line; the Public and
   Private lines are simply absent (no points → no line), matching §3.3. The
   chart is never empty because Total is always present for a selected work.
4. **By-Work with many selected works** → a long stack of per-work charts.
   Inherent to this opt-in sub-view and acceptable; no cap imposed (the user
   controls how many works are selected).
5. **Sub-tab / checkbox default + persistence.** Default sub-tab By Type
   (§3.4 flagged assumption); By-Type default checks Total only. Switching the
   top-level metric tab away from Bookmarks and back may reset these ephemeral
   states — acceptable; selection/range (the important state) persist in the
   store regardless.
6. **Tab switches preserve selection/range.** Switching top-level metric tabs
   or the Bookmarks sub-tab must not reset selected works or the range window
   (they live in the store, not per-tab state).
7. **Single snapshot / not-enough-history / all-zero author.** Existing
   metric-agnostic messaging and flat-zero-line behavior are inherited
   unchanged by every metric and both sub-tabs.
8. **Range slider (per-work).** All non-sparse metrics and the sparse
   public/private series (in BOTH sub-tabs) go through `filterPointsInWindow`,
   so nothing desyncs from the active window.

## 5. Error states

- **Query fails / network / token mismatch.** Unchanged; handled by
  `DashboardPage` (`messageForStatsError`, `ClientError` vs generic, token
  clearing on confirmed rejection). New fields ride the same request. No new
  error surface.
- **Partial data (nullable enrichment fields null).** Not an error — handled
  as corner cases §4.1–§4.3, never thrown on.
- **Malformed field types.** GraphQL types non-null Int
  (comments/bookmarks/subscriptions/totalUserSubscriptions) and nullable Int
  (public/private); no client parsing beyond `graphql-request`. Null = "gap."
- **Backend.** N/A — no backend change.

## 6. Accessibility

- **Inherited for free** on every rendered chart in every view (top-level
  metrics, By-Type type-charts, By-Work per-work charts): `figure role="img"`
  + `aria-labelledby`, `aria-hidden` SVG, sr-only per-point markers, and the
  sr-only `<table aria-label={title}>` data table. So **both sub-tabs get
  their own accessible data-table equivalents automatically** — By-Type: one
  table per type-chart (Date × works); By-Work: one table per work-chart
  (Date × [Total, Public, Private]). Multi-series charts also keep the visible
  `ComparisonLegend` spelling identity in words (works in By-Type; the three
  types in By-Work).
- **Nested tablists.** The top-level `MetricToggle` and the Bookmarks
  `[By Work][By Type]` sub-toggle are both `role="tablist"` / `role="tab"` /
  `role="tabpanel"` with roving `tabindex`, arrow-key nav, `aria-selected`,
  and focus moving to the panel on select; the sub-tablist is nested inside
  the Bookmarks `tabpanel` (valid ARIA). One tested `MetricToggle` component
  covers both.
- **By-Type checkbox group:** real `<input type="checkbox">` + `<label>`,
  keyboard-operable, state announced; grouped under a `<fieldset>`/`<legend>`
  ("Bookmark types") so its purpose is announced. Toggling a checkbox
  adds/removes a chart; that DOM change lives inside the tabpanel.
- **Sparse column/line in the a11y table** shows "—"/absent (existing
  `cellValue` "—" path), never a fabricated 0 — confirm it reads right for a
  fully-sparse column (By-Type) and a fully-sparse type-line (By-Work).
- **Empty-state message** (§4.2) is real visible text, not just an aria attr.
- **No new colors** — the 10-slot palette (reused for the three By-Work
  type-lines via slots 0–2) and ink/ink-soft tokens are already CVD- and
  contrast-verified in MASTER.md.
- **e2e:** extend `frontend/tests/dashboard-populated.spec.ts` (axe) to
  exercise the new metrics, a top-level tab interaction, and the Bookmarks
  sub-tab + a checkbox toggle.

## 7. Task list (Testing -> Implementation -> Retrospective)

TaskCreate is unavailable to this subagent, so the itemized list lives in the
plan doc (this project's plan-doc convention). One commit per item
(`CODE_STANDARDS.md`). `test:` during Testing (red-first), `feat:`/`fix:`
during Implementation (green before commit).

### Testing stage (write failing tests first)

- **T-T1 — Query + types.** `useStatsForUser.test.tsx` asserts the query
  selects the new fields and parsed data exposes them; update
  `tests/support/mockGraphql.ts` fixtures (fixture-churn note below).
- **T-T2 — Account-level metric toggle.** `DashboardPage.test.tsx`: a
  `role="tablist"` with Hits/Kudos/Subscribers, keyboard nav, `aria-selected`;
  selecting Subscribers renders a `TrendChart` from `totalUserSubscriptions`
  (lead-in + sr-only table/markers).
- **T-T3 — RatioChart removed from UI.** Ratio figure no longer renders on
  `DashboardPage` (replace ~line 197 / ~243–265 assertions); update the
  `WorkComparisonSection.regression.test.tsx` "aggregate section" case;
  assert `RatioChart.test.tsx` still passes untouched.
- **T-T4 — Per-work metric toggle + non-sparse metrics.** Comments,
  Bookmarks(total), Subscriptions each render one line per work under the
  per-work tablist, respect the slider, carry lead-ins; tab switching
  preserves selection/range.
- **T-T5 — Bookmarks sub-tab shell.** Nested `[By Work][By Type]` tablist:
  roles, keyboard nav, `aria-selected`, panel swap; nested inside the
  Bookmarks tabpanel; default sub-tab = By Type.
- **T-T6 — By-Type.** Checkbox group (Total default on); each checked type
  renders its own `MultiSeriesTrendChart` (one line per work); public/private
  drop null points (gaps, not zeros); a fully-sparse type-chart shows the
  empty-state message (§4.2); no lead-in on sparse series; a11y table per
  chart.
- **T-T7 — By-Work.** One chart per selected work, stacked in selection order;
  each chart plots Total/Public/Private as three lines with the fixed slot-0/1/2
  shape+color; a work with zero enrichment still shows Total (Public/Private
  absent, not an error); a11y table per work-chart (Date × 3 types); legend
  labels the three types.
- **T-T8 — a11y e2e + stories.** Extend `dashboard-populated.spec.ts` (axe) to
  the new metrics + a top-level tab + the Bookmarks sub-tab + a checkbox
  toggle; update Storybook stories for the new metrics, the toggle, and both
  bookmarks sub-views.

### Implementation stage (make green, one commit per item)

- **T-I1 — Query + types.**
- **T-I2 — `MetricToggle.tsx`** (reusable `role="tablist"`, keyboard/ARIA;
  used at both levels).
- **T-I3 — Account-level toggle + subscribers chart** (`DashboardPage.tsx`).
- **T-I4 — Remove RatioChart from UI** (render + `ratioLeadIn` + import;
  update its tests + the regression test), leaving `RatioChart.*` untouched.
  **Own commit.**
- **T-I5 — Append TECH_DEBT.md** orphaned-RatioChart/`kudosToHitsRatio` note
  (§3.0.1).
- **T-I6 — `buildSeries` generalization** (§3.2) + optional `perWorkMetrics.ts`.
- **T-I7 — Per-work toggle + non-sparse metrics** (Comments/Bookmarks(total)/
  Subscriptions).
- **T-I8 — Bookmarks sub-tab + By-Type** (checkbox group, per-type charts,
  sparse handling, empty-state guard §4.2).
- **T-I9 — By-Work** (per-work charts in selection order, fixed type→style
  slots 0–2, Total-always-present behavior).
- **T-I10 — MASTER.md notes** (sparse-series §4.1 + fixed By-Work type→style
  mapping §3.4) + Storybook stories.

### Retrospective stage (evaluate against, once shipped)

- Was Option B applied consistently across both surfaces?
- Bookmarks: did By-Work/By-Type both ship, both accessible (own data tables,
  nested tablist), pulling from the same data?
- Were the UI decisions actually put to the user before building, per the
  standing UI-decision discipline — not decided by an agent?
- RatioChart: component/tests/stories intact and passing; only UI wiring
  removed; TECH_DEBT paper trail present.
- Coverage >= 85% baseline on touched frontend files.
- File-length budgets: `WorkComparisonSection.tsx` (500), `DashboardPage.tsx`
  (500), `MetricToggle.tsx` (500), `perWorkMetrics.ts` (400) under budget —
  if the sub-tab/By-Work logic pushes `WorkComparisonSection.tsx` over, extract
  a `BookmarksTab`/`ByWorkView` component cleanly rather than truncating.
- Sparse public/private rendering matched "never fabricate a zero" on a real
  partially-enriched author, in both sub-tabs.
- Any deferred items in `TECH_DEBT.md`.

### Fixture-churn note (decision to confirm)

Making the always-present per-work fields (`comments`, `bookmarks`,
`subscriptions`) **required** on `PerWorkPoint` is faithful to the backend
(non-null) but breaks every point literal across `WorkComparisonSection.*`,
`DashboardPage.test.tsx`, `comparisonSelection.test.ts`,
`useStatsForUser.test.tsx`, `WorkComparisonSection.stories.tsx`, and
`tests/support/mockGraphql.ts`. Precedent (`publishedOn`) made its field
optional to avoid churn — but that field is genuinely nullable, whereas these
three are not, so optionality would be a faithfulness compromise.
Recommendation: keep them REQUIRED and update fixtures (mechanical, test-
first). `publicBookmarks`/`privateBookmarks` are naturally `number | null`.

## 8. Infra / hosting cost estimate

**N/A.** Frontend-only change on the existing Render static-site pipeline
(`docs/plans/render-hosting-deployment.md`). No new compute, storage,
bandwidth, add-on, or dependency. No billable dimension changes.

## Decisions resolved (was "to confirm")

1. **§3.0 presentation pattern** — Option B (metric toggle). RESOLVED.
2. **§3.0.1 RatioChart removed from UI** — RESOLVED (component/logic/tests
   kept).
3. **§3.4 bookmarks sub-interaction** — RESOLVED: `[By Work][By Type]` nested
   sub-tab (By-Type = Option 1 checkbox group; By-Work = Option 3 across all
   selected works in selection order, fixed type→style slots 0–2). One trivial
   non-blocking assumption flagged: default sub-tab = By Type (reversible,
   does not gate Testing).
4. **`PerWorkPoint` non-sparse fields required vs. optional** — recommend
   required + update fixtures (Testing decides at fixture-write time;
   mechanical, not a design gate).
5. **Selected-metric / sub-tab / checkbox state** — recommend per-username in
   `useWorkComparisonStore` for the per-work selected metric; ephemeral
   `useState` for account-level metric, sub-tab, and checkbox states.

**Ready for Testing (stage 3).**
