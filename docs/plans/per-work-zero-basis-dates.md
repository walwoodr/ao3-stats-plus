# Plan: Per-work zero-basis dates (multi-series comparison graph)

Status: **FINALIZED — all open decisions resolved by user 2026-08-03.** Ready
for Testing (stage 3).

Source: Discovery (conversational, no persisted doc per this project's
convention) confirmed the underlying data (`works.published_on`) is already
scraped, stored, and exposed by the backend — this is a frontend-only
wiring + rendering feature, not a new-scraping item. Three product
decisions were resolved by the user via `AskUserQuestion` during Discovery
(lead-in styling, missing-publish-date fallback, backfill messaging); two
more were resolved during Planning (zero-dot color, visible caption). All
five are final and should not be re-litigated during Testing/Implementation.

## Scope verification (verified against the codebase, not assumed)

- **`published_on` is fully served by the backend.** `backend/db/schema.rb`
  (`t.date "published_on"`, nullable, latest-state on `works`) and
  `backend/app/graphql/types/per_work_series_type.rb:14`
  (`field :published_on, GraphQL::Types::ISO8601Date, null: true`). No
  Rails/schema/GraphQL-type work needed.
- **The only data gap is frontend.** `frontend/src/queries/useStatsForUser.ts`
  does not select `publishedOn` (query, `perWorkSeries` block) and
  `interface PerWorkSeries` has no such field.
- **The fallback source is already in hand.** `earliestPostYear` is already
  selected, typed, and passed into `WorkComparisonSection`
  (`DashboardPage.tsx`) — no new query field, no backend work for the
  fallback.
- **`MultiSeriesTrendChart` uses a categorical axis** (`type="category"`,
  `dataKey="capturedOn"`), computing its own date union in `buildChartData`,
  which is **distinct** from `comparisonSelection.ts`'s
  `unionCapturedOnDates`. This distinction is what makes decoupling the
  feature from the date-range slider possible (see below).
- `PerWorkTrends` no longer exists; `WorkComparisonSection` →
  `MultiSeriesTrendChart` is the sole consumer in scope.

This is a **frontend-only** change. No backend section applies.

## 1. Happy path

1. Author opens the dashboard; `statsForUser` resolves. The query now
   additionally selects `publishedOn` per work.
2. `WorkComparisonSection` receives `perWorkSeries` (each work now carrying
   `publishedOn: string | null`) and `earliestPostYear`.
3. For each selected work, the section computes a **zero-basis date**:
   `work.publishedOn` if present, else `${earliestPostYear}-01-01` (the same
   synthetic value the aggregate charts use, reused verbatim from the
   already-passed prop).
4. It passes each work's zero-basis date to `MultiSeriesTrendChart` alongside
   its points, as a per-series `leadIn`.
5. The chart injects each work's zero-basis date into its internal
   categorical date axis. Each selected work's line begins with a dashed,
   muted lead-in segment from `(zeroBasisDate, 0)` up to its first real
   captured point, analogous to `TrendChart`'s aggregate lead-in.
6. The sr-only per-point markers and sr-only data table gain the zero-basis
   points so the anchoring is represented in the accessible (non-`aria-hidden`)
   layer, since the SVG chart itself is `aria-hidden`.
7. A short visible caption appears beneath the chart pair (Hits, Kudos)
   explaining the dashed convention, whenever at least one currently
   selected/visible work has a rendered lead-in.

## 2. Data model (backend)

N/A — verified above. `published_on` and `earliest_post_year` are already
stored and already exposed. No migration, model, or GraphQL type change.

## 3. Frontend design

### Files touched (all frontend)

| File | Change |
|---|---|
| `frontend/src/queries/useStatsForUser.ts` | Add `publishedOn` to the `perWorkSeries` selection set and `publishedOn: string \| null` to `interface PerWorkSeries`. |
| `frontend/src/components/WorkComparisonSection.tsx` | Compute each selected work's zero-basis date (own `publishedOn` or `earliestPostYear` fallback), gate it, pass it into each `SeriesDatum` as `leadIn`, and render the visible caption when applicable. |
| `frontend/src/components/charts/MultiSeriesTrendChart.tsx` | Extend `SeriesDatum` with optional `leadIn`; extend `buildChartData` to inject zero-basis slots and per-work `lead-*` dataKeys; render per-work dashed muted lead lines + zero dots; add zero-basis entries to sr-only markers and table; expose whether any lead-in is currently rendered (for the caption's conditional). |

No new files. No new dependencies (Recharts already approved). Test/story
companions get updated (section 7).

### Component tree (unchanged shape)

```
DashboardPage
  └─ WorkComparisonSection  (computes zeroBasis per work; renders caption)
       ├─ WorkPicker
       ├─ DateRangeSlider        (untouched — see slider decoupling)
       ├─ MultiSeriesTrendChart  ×2 (Hits, Kudos) — extended, not replaced
       │    └─ ComparisonLegend   (untouched — see legend decision)
       └─ lead-in caption (new, conditional)
```

### The structural mechanism (the one real design problem)

`TrendChart` anchors its lead-in at numeric `xValue = 0` on a `type="number"`
axis. `MultiSeriesTrendChart`'s axis is `type="category"` over string dates.
The port is therefore **additive to the categorical union**, not a numeric
zero-slot:

**`SeriesDatum` gains** `leadIn?: { capturedOn: string; label: string }`.
Value is always 0, so only the date and an accessible label are carried.

**`buildChartData` changes:**
- Axis union = `[...new Set( all works' point.capturedOn ∪ all works'
  leadIn.capturedOn )].sort()`. Works with distinct accurate publish dates
  each add a distinct leading slot; all fallback works share the single
  `${earliestPostYear}-01-01` slot (they collapse to one column, which is
  desirable).
- Each row keeps the existing main dataKey `work-${id}` = the work's value
  at that date or `null`.
- Each row gains a lead dataKey `lead-${id}` = `0` at that work's
  `leadIn.capturedOn` slot, the work's **first real point value** at that
  work's first real captured date slot, and `null` at every other slot.
  Rendered with `connectNulls` (true) so exactly one segment is drawn
  between the two non-null slots — the same two-non-null-points trick
  `TrendChart` uses. Intermediate slots (other works' zero dates, other
  works' captures) stay null and are skipped, so the segment connects
  publish → first-real directly regardless of what sorts between them.

Because different works have different publish dates, several leading slots
will each hold exactly one work's zero (0) with `null` for every other work
at that slot — this is expected and handled by the existing
`connectNulls={false}` on the main lines (nulls are gaps) and `connectNulls`
(true) on the lead lines.

**Lead line rendering** (per work, only when `s.leadIn` present): a
`<Line dataKey="lead-${id}" connectNulls isAnimationActive={false}
strokeDasharray="4 4" stroke={colors.inkSoft} strokeWidth={1.5}>` —
identical style tokens to `TrendChart`'s lead-in and to MASTER.md's
`.chart-leadin-connector` spec. Explicitly **not** the work's own series
color or dash slot.

**Zero dot color (resolved 2026-08-03): muted `inkSoft`**, matching the
dashed connector — not a literal mirror of `TrendChart`'s single `accent`
dot. With up to 6 selected works, 6 accent dots would both multiply the
app's deliberately-scarce "accent spent once" wine color and collide
visually with work slot 1's own wine series color. Muted dots read the
whole lead-in as one cohesive "pre-data" unit regardless of how many works
are selected.

### Decoupling from the date-range slider (deliberate decision, justified)

**Decision: zero-basis dates participate ONLY in `MultiSeriesTrendChart`'s
internal axis. They do NOT enter `comparisonSelection.ts`'s
`unionCapturedOnDates`, and neither `shouldShowRangeSlider`, the slider
`domain`, nor `filterPointsInWindow` are modified.** Rationale:

- `unionCapturedOnDates` feeds the slider's `>2` gate
  (`shouldShowRangeSlider`) and the summary-message year range. Injecting
  publish dates there would flip a 2-point selection into showing the
  slider and would rewrite the summary's "from" year — behavior changes
  that touch slider gating. Out of scope (explicit non-goal: the separate,
  deferred slider-scoping ROADMAP item).
- The slider `domain` already starts at `earliestPostYear`, and every
  work's publish year is `≥ earliestPostYear` by definition, so the
  injected dates never need to widen the domain.
- Keeping them chart-internal means the slider component and
  `comparisonSelection.ts` are literally untouched — the cleanest possible
  guarantee that the deferred slider-scoping item isn't accidentally
  reimplemented here.

**Slider-interaction gating (corner case handled in `WorkComparisonSection`):**
`buildSeries` already slider-filters points via `filterPointsInWindow`. To
stop the injected zero-basis axis slot from re-extending the chart's left
edge below a window the user has explicitly zoomed into, the section passes
a work's `leadIn` to the chart **only when**:
- the work has ≥1 visible (filtered) point, AND
- `yearOf(zeroBasisDate) >= effectiveRange.start` (when a range is active;
  always pass when `effectiveRange === null`), AND
- `zeroBasisDate < firstVisiblePoint.capturedOn` (the degenerate-guard,
  mirroring the aggregate `hasLeadIn` gate).

The lead-in connects to the first *visible* point, so a narrowed low bound
simply lengthens the dashed segment — never draws it backwards. In the
default full-range view (`range === null`, low bound = `earliestPostYear`)
every work's zero-basis passes, satisfying "every selected work gets a
zero-basis." Zooming past a publish date drops only that work's lead-in as
a display-window consequence — this is not the rejected "graceful degrade /
no data" behavior, which was about *missing data*; every work still always
*has* a computed zero-basis at the data layer.

### Axis-label / precision treatment

The chart SVG is `aria-hidden`; the sr-only table + markers are the
accessible source of truth. `WorkComparisonSection` computes each
`leadIn.label`:
- **Accurate `publishedOn` present:** `label = \`Published ${publishedOn}\``
  — a real, precise date.
- **Fallback used:** `label = \`Before ${earliestPostYear} (estimated
  baseline)\`` — year-only wording, identical in spirit to `TrendChart`'s
  own lead-in label, so a synthetic `${year}-01-01` never masquerades as a
  precise capture date in the accessible layer.

`buildChartData` builds a `capturedOn → label` map for zero-basis-only slots
(a slot that is some work's zero-basis and is **not** any work's real
capture date). The sr-only table's date cell and the categorical `XAxis`
`tickFormatter` use this map (falling back to the raw ISO date when
absent). Multiple fallback works share one slot and one label; accurate
publish dates are distinct.

### Design-token consistency (cited against MASTER.md)

- Lead connector: `stroke-dasharray: 4 4`, `--color-ink-soft`, `1.5px` —
  MASTER.md `.chart-leadin-connector` and the "Synthetic lead-in segment:
  dashed `--color-ink-soft`" rule. Resolved via `useChartColors().inkSoft`,
  per MASTER's Chart Guidance note that Recharts needs real hex, not CSS
  vars.
- This is the narrow, additive lead-in use of dash — **not** the separately
  deferred "dash means only pre-data everywhere" restyle ROADMAP item.
  `strokeDasharray="4 4"` coincidentally equals slot-5's dash
  (`seriesStyles.ts`), but slot-5 is green + plus-marker while the lead-in
  is inkSoft + no series marker, so they remain distinguishable; and `4 4`
  is exactly MASTER's prescribed connector dash. No change to
  `SERIES_STYLE_SLOTS`.

### Legend and visible caption (resolved 2026-08-03)

`ComparisonLegend` is **not** changed — the lead-in is a shared,
work-independent convention, not a per-work identity channel, so it stays
out of the per-work glyph legend.

Instead, a short **visible caption** renders beneath the chart pair (Hits,
Kudos), in `WorkComparisonSection`, reading:

> Dashed segments show the period before your first captured stats for a
> work.

Rendered once (not duplicated per chart), styled as small/muted body text
consistent with MASTER.md's caption/helper-text treatment, and shown
**only when at least one currently-selected, currently-visible work has a
rendered lead-in** (i.e. `MultiSeriesTrendChart` needs to expose, or
`WorkComparisonSection` needs to independently derive, whether any passed
`leadIn` actually survived the gating in section 3's "Decoupling from the
date-range slider" - reuse the same gate rather than recomputing it
separately, to avoid the caption and the chart ever disagreeing about
whether a lead-in is showing).

## 4. Corner cases (deviations from happy path, not errors)

- **All selected works pre-enrichment (`publishedOn` all null):** every
  work falls back to `${earliestPostYear}-01-01`; all their lead-ins
  collapse onto one shared axis slot. Works correctly; one leading column,
  N lead segments fanning out.
- **Mixed accurate + fallback publish dates:** multiple distinct leading
  slots plus one shared fallback slot. Each lead line is independent.
- **`earliestPostYear` is null AND `publishedOn` null for a work:** no
  zero-basis date can be formed → that work simply gets no lead-in
  (`leadIn` omitted). Consistent with the aggregate chart, which also
  renders no lead-in when `earliestPostYear` is null. "Always some
  zero-basis" presumes a non-null account earliest-post-year (its own
  source); when even that is absent there is genuinely nothing to anchor
  to.
- **Degenerate same-day publish/capture:**
  `zeroBasisDate >= firstVisiblePoint.capturedOn` → lead-in suppressed by
  the guard, avoiding a zero-width or backwards segment. Mirrors aggregate
  `hasLeadIn`.
- **Slider zoomed past a work's publish year:** that work's lead-in drops
  for the current window (gating rule); reappears when the window widens
  back. No stale/backwards segment. The caption's visibility follows suit.
- **Work with zero visible points after filtering:** no lead-in (nothing to
  connect to); the work already renders as an empty line today.
- **Fallback slot equals a real capture date of another work:** axis-label
  map prefers the raw ISO date for that shared slot (defined as
  "zero-basis-only" excludes any-real-capture dates), so the
  tooltip/tick/table don't mislabel a real capture as a baseline.
- **Single selected work:** works identically to `TrendChart`'s single
  lead-in, just via the categorical mechanism.
- **6 works (the `MAX_SELECTED_WORKS` cap):** up to 6 lead segments; all
  inkSoft/dashed, visually cohesive rather than 6 competing accents.
- **No work currently has a rendered lead-in** (e.g. all six selected
  works' publish dates are outside the zoomed slider window): the caption
  is hidden entirely rather than shown with nothing to refer to.

## 5. Error states

Frontend-only; no network or backend error paths added.
- **Malformed/missing `publishedOn`** (not an ISO date): `publishedOn` is
  typed `string | null`; a malformed non-null string would sort oddly on
  the categorical axis. Backend types it `ISO8601Date`, so this shouldn't
  occur, but `WorkComparisonSection`'s zero-basis computation should treat
  any `publishedOn` that doesn't parse as a valid `YYYY-MM-DD` (or that
  fails the `zeroBasisDate < firstVisiblePoint` guard) as "use the
  fallback," never throwing. Surfaced to the user as: the work still gets a
  (fallback) lead-in; nothing breaks.
- **`buildChartData` robustness:** must not throw on a work with an empty
  `points` array (existing invariant, already guaranteed upstream) or on a
  `leadIn` whose date sorts after all points (guarded upstream).
- No retry/recovery semantics change; the existing `useStatsForUser`
  error/loading handling in `DashboardPage` is untouched.

## 6. Accessibility (first-class)

- **The chart SVG stays `aria-hidden`**; the accessible representation is
  the sr-only marker list and sr-only data table. Both must gain the
  zero-basis points, or the anchoring is invisible to AT users.
- **sr-only per-point markers:** add one per work that has a `leadIn`, e.g.
  `\`${s.title} — ${leadIn.label}: 0 ${valueLabel}\``, alongside the
  existing real-point markers. Keep the `data-testid` marker-counter scheme
  stable.
- **sr-only data table:** zero-basis rows appear automatically because rows
  derive from the chart-data union. The date cell for a zero-basis-only row
  shows `leadIn.label` (via the label map), not the raw ISO date — so "0
  hits before you started capturing" is stated in words, and a synthetic
  `${year}-01-01` is never presented as a precise date. Real-capture cells
  are unchanged.
- **Visible caption is redundant reinforcement, not the sole channel** —
  the lead-in's meaning is already fully conveyed to AT users via label
  text on the accessible markers/table; the caption exists for sighted
  users who don't have that layer, not as a replacement for it.
- **Color independence:** the lead-in is conveyed by dashed line style +
  explicit label text, never color alone — consistent with MASTER.md's
  "differentiated by line style, never color alone" rule. The zero-dot
  color (inkSoft) is decorative reinforcement only.
- **Contrast:** `--color-ink-soft` is a muted secondary token already used
  for axis ticks/legend text; as a non-text graphical object the lead
  line/dot are governed by WCAG 1.4.11 (≥3:1). Confirm inkSoft-on-card
  clears 3:1 in both modes during Testing (light `#7A6B72` on `#FFFFFF`,
  dark `#B7A8AF` on `#2B232A`) — not independently re-computed here; flag
  if marginal. The visible caption text itself must clear normal-text
  contrast (4.5:1) per its chosen token.
- **No focus/keyboard surface added** (no new interactive controls; the
  slider and picker are untouched).

## 7. Task list

One commit per completed item, per `CODE_STANDARDS.md`. Testing (stage 3)
first — write these as failing tests against this plan before any
implementation code exists.

### Testing

1. `useStatsForUser` query/type: assert the `statsForUser` query document
   selects `perWorkSeries { publishedOn }` and that `PerWorkSeries` exposes
   `publishedOn`. Update any existing MSW/GraphQL mocks to include
   `publishedOn`.
2. `WorkComparisonSection` zero-basis derivation: given works with (a)
   accurate `publishedOn`, (b) null `publishedOn` + non-null
   `earliestPostYear`, (c) both null — assert the `leadIn` passed to
   `MultiSeriesTrendChart` is respectively the real date,
   `${earliestPostYear}-01-01`, and absent. Assert the correct label
   wording per branch.
3. Guard tests: `zeroBasisDate >= firstVisiblePoint.capturedOn` ⇒ no
   `leadIn`; slider window narrowed above a work's publish year ⇒ that
   work's `leadIn` dropped while others remain; window at full range ⇒ all
   present.
4. `MultiSeriesTrendChart.buildChartData`: unit-test that the union
   includes injected zero-basis dates; that fallback works share one slot;
   that per-work `lead-*` keys carry `0` at the zero slot and the first
   real value at the first real slot and `null` elsewhere; that main
   `work-*` keys are unaffected.
5. Lead-line rendering: assert a dashed `strokeDasharray="4 4"`,
   `inkSoft`-stroked lead line is rendered per work with a `leadIn`, and a
   muted `inkSoft` zero dot on the zero slot only.
6. Accessibility: assert an sr-only marker exists per zero-basis point with
   the correct label text and `0` value; assert the sr-only table contains
   zero-basis rows whose date cell shows the label (not raw ISO for
   fallback); axis `tickFormatter` maps fallback slots to year-only
   wording. Extend `MultiSeriesTrendChart.stories.tsx` with a zero-basis
   story; ensure Storybook `addon-a11y` and the Playwright axe scan pass on
   the populated comparison state.
7. Regression fences: assert `comparisonSelection.ts`
   (`unionCapturedOnDates`, `shouldShowRangeSlider`), the slider `domain`,
   and `DateRangeSlider` are unchanged by adding zero-basis (no new slider
   slots, gate unaffected) — a test that the summary message year range and
   slider visibility for a 2-union-point selection are identical with vs.
   without publish dates present.
8. Visible caption: assert the caption renders with the exact text above
   when ≥1 rendered lead-in is present, and is absent when zero lead-ins
   are currently rendered (including the "zoomed past every work's publish
   date" corner case); assert it renders exactly once, not once per chart.

### Implementation (make them pass, in this order)

1. `useStatsForUser.ts`: add `publishedOn` to query + `PerWorkSeries`.
2. `MultiSeriesTrendChart.tsx`: extend `SeriesDatum` (`leadIn?`),
   `buildChartData`, lead-line rendering, zero dot, sr-only markers/table,
   `tickFormatter` label map, and a way to report whether any lead-in is
   currently rendered (for the caption).
3. `WorkComparisonSection.tsx`: compute + gate + pass each work's `leadIn`
   in `buildSeries`, and render the visible caption using the same gate.
4. Stories/mocks: update `MultiSeriesTrendChart.stories.tsx` and any
   GraphQL mock fixtures to carry `publishedOn`.
5. Verify file lengths stay within `CODE_STANDARDS.md` limits (`.tsx` 500,
   `.ts` 400). Run ESLint/Prettier; ensure the axe e2e scan is green.

### Retrospective (evaluate against, once shipped)

- Does every selected work show a zero-basis anchor in the default view
  (own publish date or fallback)? Any work silently missing one?
- Did the slider's behavior (gate, domain, summary range) actually stay
  identical — confirm the non-goal wasn't breached?
- Coverage of the new `buildChartData`/derivation branches against the 85%
  baseline.
- Does the visible caption read clearly in practice, or does it need
  tightening/repositioning once seen live?
- Note in `TECH_DEBT.md` if the raw-ISO fallback tick on the *visual*
  (aria-hidden) axis proves confusing enough to warrant further visual-axis
  label polish.

## 8. Infra / hosting cost estimate

N/A — no new paid infrastructure; frontend-only change deployed through the
existing pipeline.

## Cross-references

- `docs/plans/per-work-comparison-graph.md` — the parent feature this
  extends (`MultiSeriesTrendChart`, 6-slot styles, slider).
- `docs/plans/work-page-enrichment-data-model.md` — where `published_on`
  scraping/storage shipped.
- `design-system/ao3-stats-plus/MASTER.md` — lead-in marker + Chart
  Guidance, multi-series color scheme.

## Explicit non-goals (do not implement as part of this plan)

- Reserving dash-styling as the *only* per-series meaning (removing dash as
  a shape/color-independent series differentiator). This plan's lead-in
  dash is a narrow, additive use for exactly the lead-in segments — not
  that broader restyle, which remains a separate, deferred ROADMAP item.
- Scoping the date-range slider's default bounds to selected works'
  publish-to-latest-capture range. This plan deliberately keeps zero-basis
  dates out of the slider's domain/gating computation (see "Decoupling
  from the date-range slider" above).
- Any new AO3 scraping, backend schema change, or GraphQL type change
  beyond what's already shipped.
