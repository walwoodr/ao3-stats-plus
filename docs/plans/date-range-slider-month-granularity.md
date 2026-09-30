# Date-range slider: month-level granularity

Status: FINALIZED (Stage 2, 2026-09-29) - ready for Testing (Stage 3).
Deployment-blocking prerequisite for the just-shipped date-hierarchy-grouping
feature (per direct user instruction).

Extends the existing `DateRangeSlider` (`frontend/src/components/DateRangeSlider.tsx`)
from whole-year granularity to year+month, per ROADMAP.md's 2026-08-04 "v2
candidates" entry ("allow filtering with month-level specificity, not just
whole years"). Two scope decisions are LOCKED by the user and must not be
relitigated:

- **Mechanism (LOCKED):** extend the EXISTING `DateRangeSlider` (MUI `Slider`
  wrapper), not a new control. Change its underlying granularity from whole
  years to year+month.
- **Default selection on first load (LOCKED):** the range defaults to
  `[earliest REAL captured month across the in-view series, latest REAL
  captured month]`, explicitly EXCLUDING lead-in/publish synthetic points
  before the earliest real capture. The user can still widen the range
  manually to include earlier (lead-in) months.

## Call-site reality (verified, corrects the "likely both contexts" hypothesis)

`DateRangeSlider` has exactly ONE production call site: `WorkComparisonSection.tsx`
(the per-work comparison charts). The account-level aggregate charts on
`DashboardPage.tsx` (`TrendChart`/`RatioChart`) do NOT use it — grep for
`<DateRangeSlider` returns only `WorkComparisonSection.tsx` plus the
`.stories`/`.test` files. So this change touches one production consumer, not
two. The account-level charts are out of scope.

## Key architectural finding — why tick machinery stays untouched (resolves Q4)

The slider does NOT filter at the tick/axis layer. The data flow is:

1. `WorkComparisonSection.buildSeries` calls
   `filterPointsInWindow(work.points, effectiveRange)` — narrowing the REAL
   points UPSTREAM.
2. The narrowed `points` are passed as `series[].points` into
   `MultiSeriesTrendChart`.
3. `MultiSeriesTrendChart.buildChartData(series)` re-derives everything —
   `realDates`, epochs, `selectDisplayedTicks(...)`, and
   `<DateGroupingOverlay rows={chartData} />` — from those already-filtered
   `series[].points` (verified: `MultiSeriesTrendChart.tsx` lines 93–189,
   276, 442).

Therefore changing granularity changes only WHICH real points survive the
filter. `chartTimeAxis.ts` (`selectDisplayedTicks`, `MAX_REAL_AXIS_TICKS`,
`interval={0}` round-5 fix), `DateGroupingOverlay.tsx`, and `dateHierarchy.ts`
re-derive naturally from the filtered set and need **NO changes**. This is the
safe filter-only approach the task mandates; the round-5 tick-machinery saga is
NOT reopened. The only filtering-logic change is the predicate inside
`filterPointsInWindow` (year comparison -> month-index comparison), which lives
in `comparisonSelection.ts`, not in any tick module.

## 1. Happy path

1. User opens the dashboard and expands "Compare works" with >=3 distinct
   capture dates across selected works (slider enabled).
2. On first load (no persisted range for this username) the slider's two
   thumbs sit at `[earliest real captured month, latest real captured month]`
   — NOT the full domain. The charts show exactly the real-capture span; any
   lead-in (publish/estimated-baseline) segment before the earliest real month
   is hidden.
3. The thumb value labels and the readout below the track read human month/
   year text ("Jan 2024", "Sep 2026"). Year-boundary tick marks give
   orientation.
4. User drags the start thumb left, one month per step, past a year mark into
   an earlier month. The charts re-render (on drag RELEASE only — the existing
   `onChange`/`onChangeCommitted` split is preserved) showing the newly
   included real points; if the start crosses below a work's lead-in month, the
   dashed lead-in segment appears.
5. User drags the end thumb; points after the new end month drop out. The
   summary line ("Comparing N works, Jan 2024 to Sep 2026.") reflects the live
   month/year window.
6. The chosen window persists per-username; on return the slider restores it
   (re-clamped to the current domain).

## 2. Data model (backend)

N/A — no backend/schema change. `capturedOn`/`publishedOn` are already
day-granular ISO strings from the existing GraphQL query
(`useStatsForUser.ts`). All work is frontend.

## 3. Frontend design

Design-context note: `DateRangeSlider.tsx` deliberately uses the MUI-Slider-
themed-to-app-tokens approach (`useChartColors` -> `sx`), NOT the
`design-system/ao3-stats-plus/MASTER.md` token classes — the existing frontend
has not been migrated to MASTER.md (see CLAUDE.md "Design context"). Per the
task's explicit constraint, this change STAYS on the existing approach and does
NOT migrate tokens. No new visual surface is introduced (no new page/
component), so no new design-context snapshot is required — this extends an
existing control's internals and labels only.

### New shared util — `frontend/src/lib/monthIndex.ts` (new, ~40 lines)

Pure month-index encoding, dependency-free, unit-testable without rendering.
Shared by `comparisonSelection.ts`, `DateRangeSlider.tsx`, and
`WorkComparisonSection.tsx`:

- `toMonthIndex(year, month /*1-12*/): number` -> `year * 12 + (month - 1)`
  (monotonic "months since year 0"; supports MUI `step={1}` = one month).
- `monthIndexOf(isoDate: string): number` -> parses `YYYY-MM` prefix; returns
  `NaN` for a malformed string (no throw — see Error states).
- `fromMonthIndex(idx): { year, month }`.
- `formatMonthIndex(idx, style: "short" | "long" = "short"): string` ->
  "Sep 2026" / "September 2026". Degrades to `String(idx)` for a NaN/invalid
  index rather than throwing.
- `yearBoundaryMarks(min, max): { value: number }[]` -> a mark at each January
  index within `[min, max]` (for MUI `marks`).

**Value representation (resolves Q1):** `year * 12 + (month - 1)`. Monotonic,
integer, `step={1}` = one month, invertible. Chosen over an epoch-relative
count to avoid threading an epoch parameter through call sites.

**Bounds/steps granularity (resolves Q2):** the whole slider steps by month
(`step={1}` = one month), matching ROADMAP's "month-level specificity, not just
whole years" (a uniform month step, not a hybrid year/month control). Because a
multi-year span at month step yields ~12 dots/year, the boolean `marks` is
REPLACED by an explicit `yearBoundaryMarks(min, max)` array — an unlabeled tick
at each January — so visual density stays close to today's year-granular look
while control is month-fine. The thumb value label and the readout carry the
"MMM YYYY" text; marks stay unlabeled to avoid collision.

### `DateRangeSlider.tsx` changes (153 -> ~175 lines; budget 500 — fine)

Props are UNCHANGED in shape (`min`, `max`, `value: [number, number]`,
`onChange`, `unionPointCount`) — all still `number`, now interpreted as month
indices. Internal changes only:

- `getAriaLabel(index)` -> "Range start" / "Range end" (drop "(year)"; the
  month+year is conveyed by the value text).
- `getAriaValueText(value)` -> `formatMonthIndex(value, "long")` ("September
  2026") so a screen reader announces a real date, not a raw index.
- Add `valueLabelFormat={(v) => formatMonthIndex(v, "short")}` so the thumb
  tooltip reads "Sep 2026" instead of the raw index.
- Replace `marks` (boolean) with `marks={yearBoundaryMarks(min, max)}`.
- Bottom readout: `formatMonthIndex(liveValue[0])} – {formatMonthIndex(liveValue[1])`.
- The `onChange`/`onChangeCommitted` live-vs-committed split, the disabled-state
  handling (`unionPointCount <= 2`), the render-time reconciliation of
  `liveValue`/`committedValue`, and all `sx` theming are UNCHANGED.

### `WorkComparisonSection.tsx` changes (399 -> ~415 lines; budget 500 — fine)

Replace the year-based domain/range derivation (current lines 219–245) with
month-index derivation:

- `domain` (drag bounds): floor = January of the earliest post/union year
  (`toMonthIndex(min(earliestPostYear ?? earliestUnionYear, currentYear), 1)`)
  so the user can still widen DOWN into lead-in months; ceiling = current month
  index (`toMonthIndex(now.getUTCFullYear(), now.getUTCMonth()+1)`). This
  preserves today's "floor at earliestPostYear, ceiling at now" semantics,
  just month-resolved.
- **`defaultWindow` (resolves Q3, the LOCKED default):** `{ start:
  monthIndexOf(unionDates[0]), end: monthIndexOf(unionDates.at(-1)) }`.
  `unionDates` is `unionCapturedOnDates(orderedSelectedWorks)` — the sorted
  union of REAL `capturedOn` dates only (synthetic lead-in dates never enter
  it; verified in `comparisonSelection.ts` lines 70–78). So earliest/latest
  real captured month falls out of the EXISTING union logic directly — this is
  exactly the ROADMAP's named composition risk, and it composes cleanly.
  Fallback to `domain` when `unionDates` is empty (slider is disabled then
  anyway).
- **`effectiveRange` is now NEVER null.** Previously `null` meant "no filter,
  full domain, show lead-in." Now: `rawRange` (valid, overlapping) ->
  `clampWindow(rawRange, domain)`, else -> `defaultWindow`. Filtering therefore
  always applies; the default window's own edges bracket every real point so no
  real point is lost by default, while `computeLeadIn`'s existing start-gate
  hides the lead-in by default (it sits before `defaultWindow.start`). Dragging
  start earlier than a lead-in month re-includes it. This is how the LOCKED
  default-selection behavior is realized WITHOUT new lead-in logic.
- `computeLeadIn`'s range gate switches from `yearOf(zeroBasisDate) <
  effectiveRange.start` to `monthIndexOf(zeroBasisDate) < effectiveRange.start`
  (and drops the `effectiveRange !== null` guard since it is always set now).
  The string-compare degenerate guard (`zeroBasisDate >= firstVisiblePoint.
  capturedOn`) is unchanged.
- `sliderValue` = `[effectiveRange.start, effectiveRange.end]` always.
- `handleRangeChange` -> `setRange(clampWindow({start,end}, domain))` (unchanged
  shape; operands are month indices).
- The gate-drop reset (`if (!showSlider && rawRange !== null) setRange(null)`)
  is UNCHANGED — resetting to null now falls back to `defaultWindow`, which for
  <=2 points is trivial.
- Summary line: format `effectiveRange.start`/`.end` via
  `formatMonthIndex(..., "short")` ("Comparing 3 works, Jan 2024 to Sep 2026.")
  instead of printing raw year numbers.

### `comparisonSelection.ts` changes (114 -> ~120 lines; budget 400 — fine)

- Rename `YearWindow` -> `MonthWindow` (start/end now mean month indices, not
  years — the old name would be actively misleading and the conservative
  reviewer would rightly flag it). Update the type export and every importer
  (`WorkComparisonSection.tsx`, `useWorkComparisonStore.ts`, and their tests).
- `clampWindow` — logic UNCHANGED (pure min/max/crossover math is granularity-
  agnostic); retyped to `MonthWindow`.
- `filterPointsInWindow` — predicate changes from
  `Number(capturedOn.slice(0,4))` (year) to `monthIndexOf(point.capturedOn)`
  (month index) compared against `[start, end]`. Import `monthIndexOf` from
  `lib/monthIndex.ts`. Empty/malformed behavior preserved (NaN -> excluded, no
  throw).
- `unionCapturedOnDates`, `shouldShowRangeSlider`, `addWork`/`removeWork`/
  `selectAllInFandom`/`deselectAllInFandom` — UNCHANGED.

### `useWorkComparisonStore.ts` changes (158 -> ~172 lines; budget 400 — fine)

- `range: YearWindow | null` -> `range: MonthWindow | null` (type rename only;
  the persisted JSON is a `{start, end}` object either way).
- **Persistence migration (see Corner cases):** bump zustand `persist`
  `version` from implicit 0 to `1` and add a `migrate` that NULLS any
  pre-v1 `range` on every `byUsername` entry, leaving `selectedWorkIds`/
  `selectedMetric` intact. A previously-persisted year range (e.g.
  `{start:2018,end:2026}`) would otherwise be misread as month indices (year
  ~168) — dropping it is safe because the range is ephemeral view state and the
  user simply lands on the new real-capture default.

## 4. Corner cases

- **First load / null persisted range:** default to `defaultWindow`
  (real-capture span), lead-in hidden. (LOCKED behavior.)
- **<=2 distinct union dates:** slider `disabled` (existing behavior via
  `unionPointCount`); `effectiveRange` falls back to `defaultWindow`
  (trivially the point span). No filter surprises.
- **Single distinct capture month:** `defaultWindow.start === .end`; MUI
  renders both thumbs at one point (existing `disableSwap` handling applies).
- **Selection change shifts the domain** (swap to a work with a disjoint date
  span while staying above the >2 gate): the existing stale-window guard
  (`rawRange.end < domain.start || rawRange.start > domain.end` -> fall back)
  is preserved, now with `defaultWindow` as the fallback instead of full
  domain.
- **Domain floor vs. lead-in month:** the domain floor is January of the
  earliest post/union year, guaranteeing the user can always drag start down to
  cover any `${earliestPostYear}-01-01` baseline or an earlier publish month
  within that year.
- **Persisted year-range from before this change:** migrated to null (Data
  model / migration above).
- **All points in the same calendar year but different months:** now
  distinguishable (the whole point of the feature) — the year-granular filter
  used to treat them identically.

## 5. Error states

Frontend (no backend surface):

- **Malformed `capturedOn`:** `monthIndexOf` returns `NaN`; the
  `filterPointsInWindow` comparison is false, so the point is excluded — same
  net behavior as today's `Number(bad.slice(0,4)) === NaN`. No throw, no crash.
- **Malformed month index in formatting:** `formatMonthIndex` degrades to
  `String(idx)` rather than throwing, matching `chartTimeAxis.ts`'s
  defense-in-depth precedent for unparseable dates.
- **Empty selection / works with zero points:** `unionDates` empty ->
  `defaultWindow` falls back to `domain`; slider disabled. No throw
  (`unionCapturedOnDates` never throws on empty points).
- **Stale persisted range not overlapping the live domain:** existing fallback
  path (now to `defaultWindow`). Surfaced to the user simply as the slider
  sitting at the sensible default.

No logging/retry semantics apply (pure client-side view state).

## 6. Accessibility

- **Screen-reader value:** `getAriaValueText` announces "September 2026", not a
  raw month index — the single most important a11y fix here (a bare index would
  be meaningless).
- **Thumb names:** `getAriaLabel` -> "Range start" / "Range end"; still
  deliberately NOT wired via `aria-labelledby` (the existing comment explains
  MUI would clobber per-thumb names with the shared heading — that reasoning
  still holds).
- **Keyboard:** MUI Slider's native arrow-key stepping now moves one month per
  press (`step={1}`); PageUp/Pagedown move larger increments. No custom key
  handling needed. `disableSwap` prevents thumbs crossing.
- **Visible readout:** the "MMM YYYY – MMM YYYY" text below the track keeps a
  sighted, non-hover reference for the current window (value labels are
  hover/focus-only).
- **Contrast/marks:** unchanged token-driven colors; year-boundary marks reuse
  the existing rail/track treatment. No new color decisions.
- **Dynamic content:** the summary line ("Comparing N works, …") already lives
  in `WorkPicker`'s `role="status"` region (via `extraStatusMessage`) — its
  month/year wording update is announced through that existing live region.
- **Automated checks:** Storybook `addon-a11y` on the updated stories;
  component-level RTL assertions on `getAriaValueText` output.

## 7. Infra/hosting cost estimate

N/A — no new paid infrastructure. Pure frontend change, no new dependency (MUI
Slider is already approved/in use).

## 8. Risks / tradeoffs

- **LOW risk, explicitly bounded:** tick machinery, overlay, and hierarchy are
  untouched (filter-only, upstream of `buildChartData`). The round-5
  `interval={0}` fix is not reopened.
- **Type rename churn (`YearWindow` -> `MonthWindow`):** touches the store,
  section, and their tests — mechanical, but must be complete (a missed
  importer is a compile error, caught immediately).
- **Persistence migration:** dropping old ranges is a deliberate,
  low-consequence reset of ephemeral view state; called out so it is not a
  silent surprise.
- **Marks density:** year-boundary marks (not per-month) is a judgment call to
  keep the control legible; if a very long history still crowds the marks,
  that's a follow-up tuning concern, not a blocker.

## 9. Task list for Testing, Implementation, Retrospective

(Recorded here rather than via TaskCreate — that tool is not available in the
Planning environment for this run. Testing/Implementation should convert these
into their own task tracking.)

### Testing (stage 3) — write failing tests first

- T1. `lib/monthIndex.test.ts` (NEW): `toMonthIndex`/`monthIndexOf`/
  `fromMonthIndex` round-trip; `formatMonthIndex` short vs long; NaN/malformed
  degradation; `yearBoundaryMarks` for single-year and multi-year spans and an
  empty/degenerate span.
- T2. `comparisonSelection.test.ts`: update `filterPointsInWindow` tests to
  month-index windows (same-year different-month points now filter
  differently); confirm malformed `capturedOn` excluded, not thrown; retype
  `YearWindow` -> `MonthWindow`; keep `clampWindow` tests (logic unchanged, new
  type). Add a same-calendar-year boundary case that year-granularity could not
  distinguish.
- T3. `DateRangeSlider.test.tsx` (487 lines — keep under the 500 `.tsx` budget;
  refactor shared setup if needed): month indices for `min`/`max`/`value`;
  `getAriaValueText` announces "Month YYYY"; readout renders "MMM YYYY – MMM
  YYYY"; value-label format; year-boundary marks present. The
  `onChange`/`onChangeCommitted` drag-split regression tests MUST remain and
  keep passing unmodified.
- T4. `WorkComparisonSection` tests (9 files): default range = real-capture
  span on first load (null persisted range); lead-in HIDDEN by default and
  SHOWN after widening start below the lead-in month; `effectiveRange` never
  null; summary line month/year wording; domain floor allows widening into
  lead-in months; stale/non-overlapping persisted window falls back to default.
- T5. `useWorkComparisonStore.test.ts`: persist `version` bump + `migrate`
  nulls a pre-v1 year `range` while preserving `selectedWorkIds`/
  `selectedMetric`; `MonthWindow` typing.
- T6. Chart wiring regression guard: assert (or reaffirm existing coverage in
  `MultiSeriesTrendChart.dateGroupingWiring.test.tsx` / `.buildChartData.test.ts`)
  that narrowing the point set does NOT alter `selectDisplayedTicks`/overlay
  behavior beyond the filtered inputs — i.e. no tick-machinery change slipped in.
- T7. `DateRangeSlider.stories.tsx`: update example values to month indices;
  addon-a11y remains green.

### Implementation (stage 4) — make them pass, one commit per item

- I1. Add `lib/monthIndex.ts` (helpers above).
- I2. `comparisonSelection.ts`: rename `YearWindow` -> `MonthWindow`; month-
  index `filterPointsInWindow`.
- I3. `DateRangeSlider.tsx`: aria/value-text/value-label/readout/marks changes;
  props shape unchanged; drag-split + disabled logic untouched.
- I4. `WorkComparisonSection.tsx`: month-index domain, `defaultWindow`,
  never-null `effectiveRange`, `computeLeadIn` month gate, month/year summary.
- I5. `useWorkComparisonStore.ts`: `MonthWindow` type; persist `version: 1` +
  `migrate` nulling old ranges.
- I6. Run full frontend suite green; confirm NO diffs to `chartTimeAxis.ts`,
  `selectDisplayedTicks`, `DateGroupingOverlay.tsx`, `dateHierarchy.ts`.

### Retrospective (stage 8) — evaluate against

- R1. Did the filter-only approach hold — zero tick-machinery changes shipped?
  (The primary risk the task flagged.)
- R2. Did the LOCKED default (real-capture span, lead-in excluded) land as
  specified, and did users actually reach earlier months when widening?
- R3. Coverage on new `lib/monthIndex.ts` and changed predicates vs. the 85%
  baseline.
- R4. Persistence migration: any user-visible surprise from dropped ranges?
- R5. Marks legibility on long histories — follow-up tuning needed?
- R6. File-length budgets respected (esp. `DateRangeSlider.test.tsx` near 500,
  `WorkComparisonSection.tsx` near 500).

---

## 10. Addendum (2026-09-29): account-level default-view lead-in exclusion

Added after the coordinator relayed a two-part user decision. Part 1 (a future
full account-level slider) is logged as a deferred ROADMAP v2 candidate
(2026-09-29) and is NOT in this plan's scope. Part 2 is the following scoped,
NON-interactive change, IN scope for this plan.

### Scope correction (verified)

The coordinator's message referenced "`TrendChart`/`RatioChart` instances" on
`DashboardPage.tsx`. Verified against the code: `RatioChart` has ZERO
production JSX usage anywhere (grep `<RatioChart` returns only test/story
files). The account-level dashboard renders only THREE `TrendChart` instances
(Total hits / Total kudos / Subscribers, via `MetricToggle`). So this scoped
work touches exactly ONE production file: `DashboardPage.tsx`.

### The change

Make the account-level dashboard charts DEFAULT to showing only the real
captured-data range — i.e. do not render the synthetic zero-basis lead-in
point by default — mirroring the per-work slider's new "default to real
captured data" principle, but WITHOUT any interactive control to widen back out
(that is the deferred ROADMAP item).

Implementation (minimal, filter-only, upstream of rendering — same discipline
as the per-work approach):

- In `DashboardPage.tsx`, stop passing the `leadIn` prop to the three
  `TrendChart`s (set `hitsLeadIn`/`kudosLeadIn`/`subscribersLeadIn` to
  `undefined`, or drop the `leadIn={...}` props). Keep the `leadInDate` /
  `hasLeadIn` computation itself (still needed for the history gate below and
  as documentation of the still-available capability).
- Adjust `notEnoughHistory` from `!hasLeadIn && aggregateSeries.length === 1`
  to `aggregateSeries.length === 1`. Rationale: today a single real snapshot
  PLUS the lead-in draws a minimal two-point (lead-in -> snapshot) line; with
  the lead-in gone by default, one real snapshot is a lone dot, not a trend, so
  the existing "not enough history yet" message is the honest state for it.
- NO changes to `TrendChart.tsx`, `chartTimeAxis.ts` (`computeYDomain`,
  `selectDisplayedTicks`), or `DateGroupingOverlay.tsx`.

### Why this does NOT revert D1 (the locked decision)

`computeYDomain`'s D1 rule is CONDITIONAL: "include the lead-in's 0 in the
padded min/max WHEN a lead-in is present" (chart-axis-comparison-and-table-
orientation-batch.md §3 item 1, lines 230–239). It already defines a first-
class, shipped lead-in-LESS branch (`dataMin > 0` -> floor lifts off 0, break
indicator shows). Not passing a lead-in simply routes the account-level charts
through that existing branch by default. `computeYDomain` is unchanged; the
lead-in's 0 is still included whenever a lead-in IS passed (e.g. the future
account-level slider widened out, or the per-work charts today). So the LOCKED
padding-math rule is untouched.

Mechanically this is also pure filter-only: `TrendChart` builds `chartData`
without the lead-in row (its existing `else` branch), so `selectDisplayedTicks`
receives only real epochs — the round-5 tick machinery is not touched, exactly
as with the per-work slider.

### Flagged design tension (surfaced, not silently resolved)

There IS a real tension with design INTENT, distinct from the D1 padding
mechanics above. `design-system/ao3-stats-plus/MASTER.md` §"The signature
element: the lead-in marker" designates the lead-in dot as "this product's one
deliberate visual risk … the signature element … One accent, spent once," and
it is the ONLY place `--color-accent` appears inside a chart. D1's intent was
to keep that marker visible on the main dashboard (accepting a 0-pinned,
vertically "hollowed-out" Y-axis to do so). This change removes that marker
from the main dashboard's DEFAULT view — its most prominent location — until
the deferred account-level slider ships.

Assessment: this is a genuine but RESOLVABLE tension, implemented per an
explicit, informed user instruction ("for now," with a deferred restore path):

- The lead-in is NOT deleted. Its data construction, `TrendChart`'s `leadIn`
  prop, `leadInEpoch` placement, the `.chart-leadin-dot` design tokens, and the
  per-work charts' use of it all remain fully intact — it is hidden-by-default
  on account-level, still fully renderable when something passes it (the future
  slider).
- Per the coordinator's own framing and the Planning-stage guidance, because
  there is a clean way to implement "default view starts at first real capture"
  WITHOUT removing the lead-in from the chart's data/rendering capability, this
  is consistent with D1's actual locked scope.

Caveat carried up to the coordinator/user for explicit confirmation (rather
than buried): the concrete, user-visible consequence is that the signature
lead-in marker disappears from the main dashboard's default view until the
deferred slider is built. If preserving that marker on the main dashboard
matters more than the default-view change, that is a fresh call for the user —
but this plan implements the instruction as given and does not block on it.

### Corner cases (account-level)

- **Single real snapshot:** now shows the "not enough history yet" message
  (was: a lead-in -> snapshot two-point line). Behavior change, called out
  above; test explicitly.
- **No `earliestPostYear` / no lead-in ever:** unchanged — there was no lead-in
  to exclude; the `dataMin > 0` branch already applied.
- **Two+ real snapshots:** Y-axis floor lifts off 0 with the break indicator
  (D1's existing lead-in-less branch); x-axis starts at the first real capture.

### Error states (account-level)

No new failure modes. Removing an input point cannot throw; `computeYDomain`
and `selectDisplayedTicks` already handle a lead-in-less `points` array (it is
their `dataMin > 0` / real-epochs-only path, exercised today by lead-in-less
sparse series).

### Accessibility (account-level)

- The break-indicator glyph (`brokenYAxis`) now appears by default on these
  charts (floor no longer pinned at 0); it already carries its shipped
  treatment/labeling — no new a11y work, but the axis-break must remain
  announced/understandable as it is for lead-in-less per-work charts today.
- No new interactive control is added (no new keyboard/focus surface).

### File-length budgets (account-level)

`DashboardPage.tsx` (228 lines, budget 500 for `.tsx`) — the change is net
roughly neutral (props removed, one conditional simplified). Fine.

### Task-list additions

Testing:
- T8. `DashboardPage.test.tsx` / `DashboardPage.metricToggle.test.tsx`: assert
  no lead-in point/marker rendered by default on the three account-level
  charts; Y-axis floor lifts off 0 with the break indicator for a 2+-snapshot
  account; single-snapshot account shows "not enough history yet" (new gate).
- T9. Guard that `TrendChart` itself is unchanged — still renders a lead-in
  when one IS passed (protects the deferred slider's future use and the
  per-work path).

Implementation:
- I7. `DashboardPage.tsx`: drop the `leadIn` props to the three `TrendChart`s;
  adjust `notEnoughHistory`. No other file changes.

Retrospective:
- R7. Did the signature-element tension resolve acceptably in practice, or did
  hiding the lead-in from the main dashboard default read as a regression to
  users before the deferred slider shipped?

---

## Decisions resolved

All resolved by direct user answer (relayed via the coordinator across this
Planning pass) — no open decisions remain. Status: FINALIZED, ready for Testing.

- **D1 — granularity mechanism: EXTEND the existing `DateRangeSlider`, month-
  stepped throughout (LOCKED by user).** Not a new control, not a hybrid year/
  month affordance. The MUI `Slider` `[number, number]` domain is re-encoded as
  month indices (`year * 12 + (month - 1)`, in the new `lib/monthIndex.ts`),
  `step={1}` = one month across the whole track. Boolean `marks` is replaced by
  explicit unlabeled year-boundary marks so month-fine control doesn't turn into
  a wall of ~12 dots/year. Props keep their shape; internals, value-label,
  readout, and aria text change (see §3). Rationale: matches ROADMAP.md's
  "month-level specificity, not just whole years" phrasing (a uniform month step,
  not a mixed-resolution control).

- **D2 — default range on first load: `[earliest REAL captured month, latest
  REAL captured month]`, lead-in EXCLUDED (LOCKED by user).** `effectiveRange`
  becomes never-null; when there is no stored range it defaults to the real-
  capture span derived from the EXISTING `unionCapturedOnDates` union (synthetic
  lead-in dates never enter that union, so the earliest/latest real months fall
  straight out of it — composing cleanly with `comparisonSelection.ts`, the
  ROADMAP's named risk). The default window's own edges bracket every real
  point, so no real data is lost; `computeLeadIn`'s existing start-gate hides the
  lead-in by default. The user can still drag the start thumb earlier (down to
  the domain floor at January of `earliestPostYear`) to re-include lead-in
  months. Persisted pre-v1 year-ranges are migrated to null (dropped) so users
  land on this new default rather than having year values misread as month
  indices.

- **D3 — filter-only integration; tick machinery untouched (Planning
  determination, not user-facing).** The slider filters which real points reach
  the chart, upstream of `MultiSeriesTrendChart.buildChartData`, which re-derives
  `selectDisplayedTicks` / `DateGroupingOverlay` / hierarchy from whatever point
  set it receives. So `chartTimeAxis.ts` (incl. the round-5 `interval={0}` /
  `MAX_REAL_AXIS_TICKS` fix), `DateGroupingOverlay.tsx`, and `dateHierarchy.ts`
  get ZERO changes — the only filtering-logic change is the predicate inside
  `filterPointsInWindow` (year → month index). The round-5 tick saga is not
  reopened.

- **D4 — account-level scope correction (verified in code).** The coordinator's
  brief referenced "`TrendChart`/`RatioChart` instances" on `DashboardPage.tsx`.
  Verified: `RatioChart` has ZERO production JSX usage anywhere (grep
  `<RatioChart` returns only test/story files). The account-level dashboard
  renders only THREE `TrendChart` instances (Total hits / Total kudos /
  Subscribers, via `MetricToggle`). The scoped account-level change (§10) touches
  exactly one production file: `DashboardPage.tsx`.

- **D5 — account-level default view excludes the lead-in; signature marker
  hidden on the main dashboard for now (CONFIRMED by user directly, 2026-09-29).**
  The three account-level `TrendChart`s stop being passed the `leadIn` prop by
  default, routing them through `computeYDomain`'s existing (already-shipped)
  lead-in-LESS branch — floor lifts off 0 with the break indicator, x-axis starts
  at the first real capture. This does NOT revert D1 of chart-axis-comparison-
  and-table-orientation-batch.md (that rule is conditional — "include the lead-
  in's 0 WHEN a lead-in is present" — and stays intact for any future re-inclusion
  and for the per-work charts). The tension is with design INTENT:
  `design-system/ao3-stats-plus/MASTER.md` names the lead-in dot "the signature
  element … one accent, spent once," the only `--color-accent` inside a chart.
  The user was shown this specific consequence — that the signature marker
  disappears from the main dashboard's default view until the deferred account-
  level slider ships (new ROADMAP v2 candidate, 2026-09-29) — and confirmed:
  hide it by default for now. The marker is hidden-by-default, NOT deleted: its
  data construction, `TrendChart`'s `leadIn` prop, `leadInEpoch` placement, the
  `.chart-leadin-dot` tokens, and the per-work charts' use of it all remain
  intact. Single-snapshot accounts now show the existing "not enough history
  yet" message instead of a lone dot (`notEnoughHistory` gate adjusted; §10).

- **D6 — no new dependency, existing styling approach retained (constraint).**
  MUI `Slider` is already approved/in use; nothing new is added. `DateRangeSlider`
  stays on its MUI-themed-to-app-tokens (`useChartColors` → `sx`) approach and is
  NOT migrated to MASTER.md token classes, per the task constraint.
