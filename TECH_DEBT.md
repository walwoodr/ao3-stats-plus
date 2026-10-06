# Tech Debt

## Backlog

- [2026-07-23] (stage: Implementation) Manual bookmarklet testing against
  live AO3 hits Chrome's Local Network Access restriction (a public HTTPS
  site can't load a script from `localhost` over plain HTTP). Not an app
  bug - production origins are both real HTTPS, so LNA won't apply.
  Workaround (an HTTPS tunnel) documented in README.md. Consider folding
  the tunnel step into a documented pre-Deployment smoke-test procedure.

- [2026-07-30] (stage: Maintenance) Three `accessibility.spec.ts` axe scans
  fail only under WebKit with `color-contrast` violations reporting hex
  values nowhere near the actual design tokens on those elements - reads
  like WebKit sampling color mid-`transition-colors` rather than a real
  contrast defect, not yet root-caused with full confidence. Needs Testing
  to wait for the transition to settle before scanning, or confirm/refute
  the timing theory.

- [2026-07-30] (stage: Implementation/Maintenance) Banner severity colors
  were consolidated from 4 roles to 3 (no dedicated "warning" token), so
  the retry banner now shares `--color-destructive` with hard failures,
  distinguished only by copy/button. Re-examined 2026-08-09: no existing
  token is a good fit (accent/growth/neutral all create worse ambiguity
  than the status quo), so this remains a genuine "add a dedicated
  warning/retry token" design decision needing a real Design/Planning
  consultation, not a unilateral pick.

- [2026-07-30] (stage: Maintenance) The bookmarklet's capability token
  (opaque `SecureRandom` string) is hard to transcribe manually. Deferred
  product decision: a short, memorable word-based token generator, weighed
  against the token's job as a capability secret - needs Planning.

- [2026-07-30] Walk through every user-facing string in the app with a
  human and verify it reads correctly.

- [2026-07-30] (stage: Review) `/ingest` has no authentication, rate
  limiting, or ownership-recovery path - any HTTP client can claim an
  unclaimed AO3 username, enumerate usernames via 403-vs-201, or create
  unbounded rows. Accepted as inherent to the credential-less personal-tool
  design; revisit if the app becomes multi-tenant or public. Candidate
  mitigation: a Rack::Attack throttle on `/ingest`.

- [2026-07-30] (stage: Review) `PerWorkSeriesType#points` issues one query
  per work (N+1), fine at personal scale; revisit with a GraphQL
  dataloader/preload if per-work counts grow.

- [2026-07-31] (stage: Review) `spec/deployment/render_yaml_spec.rb`
  validates `render.yaml` against a self-defined expected shape, not
  Render's actual published Blueprint schema - can't catch the file being
  internally consistent yet wrong against Render's real API (how the
  `staticSites:` mistake produced a false-green previously). Consider a
  periodic check against Render's live Blueprint reference.

- [2026-07-31] (stage: Review) `DashboardPage`'s token-clearing effect
  fires on any `ClientError`, which is broader than "bad token" (also
  covers a transient backend 5xx) - a server error would incorrectly clear
  a valid token and show "token doesn't match" copy. Revisit by
  discriminating a genuine auth rejection from a generic server error.

- [2026-07-31] (stage: Maintenance) No documented/convenient way to point
  local frontend dev at the real deployed Render backend instead of
  localhost or a tunnel. Needs a product decision (live-production-data
  dev has its own risks) before building a shortcut for it.

- [2026-07-31] (stage: Retrospective, re-investigated 2026-08-09) **3
  retros running: still not acted on.** `npx vitest run --coverage`'s
  printed console table silently omits several files with real, passing
  tests and real, correct coverage data - confirmed a genuine
  `@vitest/coverage-v8`/`istanbul-lib-report` bug in the live-run reporting
  path (the aggregate "All files" row and `coverage/coverage-final.json`/
  `coverage/index.html` are all correct; only the printed per-file table
  drops rows). No in-repo fix available. **Workaround**: never trust "file
  absent from the printed table" as 0%/uncovered - check
  `coverage/coverage-final.json` or `coverage/index.html` instead.

- [2026-08-01] (stage: Review) `POST /ingest/work` doesn't rescue
  `ActiveRecord::RecordInvalid` on a scraped payload that violates a
  `WorkStat` validation - returns HTTP 500 instead of a typed 422. Fan-out
  degrades gracefully (tallied as skipped, nothing partial written) and
  the trigger condition is realistically unreachable from real AO3 markup.
  Consider rescuing to a typed `InvalidPayload` (422).

- [2026-08-02] (stage: Implementation) The always-accept-and-reset model on
  `/ingest*` lets a non-browser client overwrite a *claimed* username's
  token/snapshot, not just claim an unclaimed one - a direct, explicitly
  signed-off entailment of the memorable-token decision (a successful
  capture is itself proof of ownership), not new scope. Candidate
  mitigation (not built): a Rack::Attack throttle on `/ingest*`.

- [2026-08-02] (stage: Implementation) Token entropy (~16.5 bits) is
  deliberately weak as a secret, per the user's explicit memorability
  choice - its remaining job is gating the `statsForUser` read path.
  Candidate mitigation (not built): a rate limit on `statsForUser`/
  `/ingest`. Accepted at personal-tool scale.

- [2026-08-02] (stage: Review) The `read_token` index-drop migration uses
  `remove_index` with no column given inside `change`, so
  `rails db:rollback` raises `ActiveRecord::IrreversibleMigration`. Forward
  deploy unaffected; would be tidier as explicit `up`/`down`.

- [2026-08-02] (stage: Review) `generateTokenSuggestion`'s reject-and-retry
  loop is unbounded - only loops forever against an adversarial/buggy
  injected `rng`, not reachable via the real `Math.random` default.
  Cosmetic robustness only.

- [2026-08-03] (stage: Implementation) `groupWorksByFandom` splits the
  backend's comma-joined `fandoms` string on `", "`, which is lossy for a
  fandom name that itself contains that exact substring (splits into two
  pseudo-fandom groups). Accepted limitation (pinned by test); the real
  fix is storing fandoms as an array/jsonb column, explicitly deferred as
  out of scope for the comparison-graph feature that introduced this.

- [2026-08-03] (stage: Maintenance) **Process gap worth recording**: bare
  `npx tsc --noEmit -p .` is a false-green no-op for this project - the
  root `tsconfig.json` is solution-style (`references`), so plain
  `--noEmit` mode never traverses into `tsconfig.app.json`/
  `tsconfig.node.json`; only `tsc -b` (what `npm run build` runs) actually
  checks them. Always use `npx tsc -b` for ad hoc frontend typecheck
  verification, never bare `tsc --noEmit -p .`. CI itself was never
  fooled by this (it already runs real `npm run build`) - only ad hoc
  local/agent verification was.

- [2026-08-04] (stage: Testing) `docs/testing/usds-shape-distinguishability-
  pass.md` verified the 10-shape marker strategy via a standalone
  illustrative SVG script, not the real `markerShapes.tsx` component.
  Implementation's own manual CVD/grayscale pass should re-confirm
  distinguishability against the actual rendered shapes, not just rely on
  the pre-Implementation illustrative pass.

- [2026-08-04] (stage: Review) Exporting `buildChartData` from
  `MultiSeriesTrendChart.tsx` for unit-testability trips the
  `react-refresh/only-export-components` ESLint warning (warning only,
  degraded HMR in dev). Consider extracting it into its own module
  (mirroring `lib/comparisonSelection.ts`'s existing pattern) to clear it.

- [2026-08-05] (stage: Review) `WorkComparisonSection.tsx` mutates the
  external `useWorkComparisonStore` during the render phase in two places
  (a lazy-`useState` initializer and a render-body gate-drop reset) -
  React sanctions this pattern for its own `useState` setters, but
  zustand's `set` is a real external mutation a discarded/concurrent
  render can't undo. Green today (only one subscriber, idempotent
  writes), but risks a cross-component render-phase update once a second
  component subscribes to this store. Safer: move both writes into
  `useEffect`.

- [2026-08-08] (stage: Implementation) `RatioChart.tsx`/`RatioChart.test.tsx`/
  `RatioChart.stories.tsx` and the `kudosToHitsRatio` GraphQL fields are
  unreferenced by rendered UI after the ratio chart was removed from
  `DashboardPage` (no slot in the metric-toggle design). Kept deliberately
  for possible reuse, not dead code - flagged so it isn't mistaken for
  either. Could drop the GraphQL selections if the ratio view isn't
  reinstated.

- [2026-08-09] (stage: Maintenance) `dashboard-populated.spec.ts`'s
  "switching Bookmarks to the By Work sub-tab is axe-clean" test hits a
  Playwright strict-mode violation: `getByRole("img", { name: "Work A" })`
  substring-matches both the chart figure and the "Remove Work A" chip's
  delete icon. Pre-existing, confirmed unrelated to any specific feature
  work. Fix: scope the locator (`exact: true` or scope to the chart
  container).

- [2026-08-12] (stage: Review) Three files remain over their
  CODE_STANDARDS.md line budgets: `WorkComparisonSection.test.tsx` (596),
  `DashboardPage.test.tsx` (588), both `.tsx` test files over 500; and
  `frontend/src/bookmarklet/entrypoint.test.ts` (553) over the `.ts` 400
  budget. Non-blocking signal to split by describe-block group, mirroring
  this project's existing `fanOut.test.ts`/`banners.test.ts` splits.

- [2026-09-13] (stage: Implementation) **Deferred exact-bookmark
  permalink** (bookmark-notes-feed plan, Decision D4). The original
  premise (a per-bookmark `id="bookmark_NNNN"` attribute) is REFUTED - the
  2026-09-21 live-HTML verification (below) confirmed real bookmark `<li>`
  items carry no `id` attribute at all. Before picking this up, re-verify
  against a real live-fetched `/works/:id/bookmarks` page (e.g. an `<a>`
  href within the item) - don't trust a secondary source. Also a 5-layer
  change (scraper -> migration -> ingest -> GraphQL type -> frontend
  query) exceeding past plans' "frontend query extension only" scope.

- [2026-09-13] (stage: Implementation) `workPageCapturedAt` isn't exposed
  on `PerWorkSeriesType`, so an empty bookmarks list is ambiguous between
  "genuinely none" and "Phase-2 enrichment never ran." Exposing it (backend
  already has it) would let the feed say "not captured yet" vs "no
  bookmarks" precisely.

- [2026-09-13] (stage: Implementation) The shared `statsForUser` query now
  fetches bookmark HTML `DashboardPage` never renders - a potentially
  large payload for heavily-bookmarked authors. Chosen deliberately for
  free cross-page cache sharing; watch real payload sizes and split to a
  dedicated bookmarks-only query if it becomes a real problem.

- [2026-09-13] (stage: Implementation) `BookmarkFeedPage.tsx` duplicates
  `DashboardPage.tsx`'s token/loading/error state machine nearly verbatim.
  A future pass could extract a shared `useStatsPageState` hook or
  `<StatsGatedPage>` wrapper once a third page needs the same machinery.

- [2026-09-13] (stage: Implementation) `sanitizeHtml.ts` marks alt-less
  `<img>` elements as decorative (`alt=""`) rather than leaving them
  alt-less, to satisfy axe's mandatory `image-alt` rule - only applied
  when no `alt` is already present, so it doesn't fabricate a false
  description. Flagged for Review to confirm this reading is acceptable
  rather than scope overreach (no later entry confirms it either way).

- [2026-09-14] (stage: Review) Rendered bookmark-note `<img>` tags load
  remote resources on view - a bookmarker-controlled image URL leaks the
  author's IP/User-Agent/timing on view (tracking-pixel pattern). Inherent
  to the approved rich-HTML rendering; low concern at personal-tool scale.
  Candidate hardening: referrer-policy/`loading=lazy`, or proxying/
  stripping remote `src`.

- [2026-09-14] (stage: Deployment) **Process gap, retro-confirmed still
  open as of 2026-10-05.** `CODE_STANDARDS.md`'s pre-commit hook only
  gates ESLint/RuboCop on staged files - Prettier is named in the Code
  standards section but never actually enforced at commit time, so
  formatting drift accumulates silently until CI or a manual check
  surfaces it (has recurred at least 3 times). Fix needs a matching update
  to the global `~/.claude/CODE_STANDARDS.md` Enforcement section (a
  pre-commit Prettier `--check` step alongside ESLint/RuboCop), since it's
  a global spec, not project-local.

- [2026-09-15] (stage: Review) `frontend/src/lib/bookmarkFeed.test.ts`
  crossed CODE_STANDARDS.md's 400-line `.ts` budget (474 lines) via a
  legitimate regression describe block. Reasonable future split: separate
  `flattenWorksToRows`/comma-joined-string cases from sort/drop/paginate/
  glyph cases into sibling spec files.

- [2026-09-21] (stage: Maintenance) **Process note, hard-won**:
  `scrapeWorkBookmarks.ts`'s real AO3 markup (outer item selector, note/
  tags/collections headings, pagination shape) was wrong THREE separate
  times because each pass verified against a secondary source (the
  `otwcode/otwarchive` GitHub source, the Pagy gem source) instead of a
  real live-fetched page - confirmed only when a live user report
  surfaced it. Now fixed and verified directly against real HTML fetched
  from a live `/works/:id/bookmarks` page (all 4 pages, ~60 real
  bookmarks), with fixtures rebuilt as trimmed excerpts of the real
  fetched markup. **If this file is touched again, fetch a real live page
  first and read it directly - do not reason from AO3's public source
  code**, which has now been shown twice not to reflect what AO3 actually
  serves for this page type.

- [2026-09-22] (stage: Review) `backend/spec/services/
  work_detail_ingest_service_spec.rb` is 480 lines, over the 450-line
  `_spec.rb` budget. Reasonable split: extract the sanitization/
  defense-in-depth describe block into a sibling spec, mirroring the
  frontend's own `bookmarkFeed.*.test.ts` per-concern splits.

- [2026-09-22] (stage: Review) `bookmark_note_sanitizer.rb`'s header
  comment incorrectly claims `Rails::Html::SafeListSanitizer`'s default
  allowlist permits the form-element family - verified false via
  `rails runner` (it permits none of them). The real, correct reason not
  to use it is different: its narrow 43-tag allowlist would strip
  `<details>`/`<summary>`, which this app explicitly needs preserved. The
  custom blocklist scrubber's runtime behavior is correct; only the
  comment's stated rationale needs fixing.

- [2026-09-23] (stage: Review) The chart-to-table hover sync direction has
  real-interaction test coverage only in jsdom (behind a
  `getBoundingClientRect` polyfill) - no real-browser regression test
  exercises a pointer move over the chart asserting the matching table
  column tints. The mechanism is independently verified via Recharts
  source analysis, but isn't fenced by an executable browser test. Worth
  adding ahead of any Recharts 4 upgrade - this additive-overlay approach
  is the feature's riskiest Recharts coupling.

- [2026-09-23] (stage: Review) `scrollColumnIntoView.ts`'s
  `animateScrollLeft` returns no cancel handle, and `SyncedDataTable`'s
  auto-scroll effect neither stores the rAF id nor cancels a prior
  animation on a new `activeDateKey` or on unmount. A hover sweep can run
  several bounded (<=1.5s each) zombie scroll loops concurrently, and one
  keeps writing to a detached node after unmount until it self-terminates.
  Fix: a standard `cancelAnimationFrame` in effect cleanup + a returned
  cancel handle.

- [2026-09-23] (stage: Review) `SyncedDataTable`'s `selfTriggeredRef` can
  get stuck `true` when a table-originated hover sets a value the parent
  already holds (React bails the no-op setState, so the clearing effect
  never runs) - silently suppresses the next genuine external chart-hover
  auto-scroll once, then self-heals. Low-severity, self-healing; a latent
  flaw in the ref-flag design worth revisiting if it becomes user-visible.

- [2026-09-23] (stage: Review) `MultiSeriesTrendChart` rebuilds and
  re-sorts the full table model on every render, including every
  chart-hover `activeDateKey` change - output order is stable so nothing
  visibly reorders, but the O(series x dates) work reruns each hover
  frame. A `useMemo` keyed on `series`/`seriesColors` would remove it.

- [2026-09-24] (stage: Review (adversarial)) Delta chips aren't run
  through `formatNumber` - a large count delta can read e.g. `+10000` next
  to a cell reading `10,000` (same gap in the sr-only text; worse for the
  ratio metric's raw float precision). Cosmetic, low severity.

- [2026-09-24] (stage: Review (adversarial)) The carried-forward clarifier
  only covers the hovered (B) side of a pin comparison, not the pinned (A)
  side - a row whose A basis was itself carried forward gives a
  screen-reader user a signed delta with no disclosure the A basis isn't
  literally the pinned date. Minor a11y-transparency gap, not a wrong
  number.

- [2026-09-24] (stage: Review (adversarial)) Theoretical, unconfirmed
  reachable: empty `points` + a present `leadIn` yields a `NaN` axis
  domain in `TrendChart.tsx`/`RatioChart.tsx`. No live path found to
  trigger it today (`DashboardPage` only constructs a lead-in when at
  least one real capture exists) - flagged as latent fragility only.

- [2026-09-25] (stage: Implementation) **Standing test-convention gap,
  not yet adopted.** The chart test suite's fixtures skew toward small/
  round numbers and mid-chart positions - two real bugs (unrounded Y-domain
  ceiling, a left-clipped lead-in X-tick label) both passed the full suite
  and were only caught by a real production-build Preview run against real
  account data. The two specific gaps this surfaced are now closed, but
  the broader pattern isn't: consider a standing convention (or review
  checklist item) that new chart tests include at least one large/
  non-round-magnitude case and one domain-edge-label case.

- [2026-09-25] (stage: Implementation) **Known limitation from the X-axis
  tick-collision saga (5 rounds, all now resolved/shipped).** Real (non
  lead-in) date ticks are capped at a constant `MAX_REAL_AXIS_TICKS` (6) in
  `chartTimeAxis.ts`, sized for the dashboard's current fixed-width
  (`max-w-4xl`, non-responsive) desktop layout - not independently
  verified against the project's own narrower (375px) responsive design
  target, which this dashboard hasn't migrated to yet. **Directly relevant
  to any upcoming responsive/breakpoint-driven chart work** - revisit
  against real measured plot width per breakpoint rather than this one
  hardcoded constant.

- [2026-09-27] (stage: Review (adversarial)) Latent duplicate-`dateKey`
  header/body misalignment: `SyncedDataTable.tsx`'s `<tbody>` renders
  from undeduplicated `columnSlots`/`rowSlots`, while its header goes
  through `buildDateHierarchy`'s dedup rule - if `dateAxis` ever contained
  a duplicate `dateKey` (e.g. a lead-in coinciding with a real capture
  date), the header would silently misalign with the body. Unreachable
  today (`DashboardPage` enforces no duplicate `dateKey` ever reaches this
  component). Candidate fix: dedup `dateSlots` the same way, or
  assert/guard against a duplicate reaching this component at all.

- [2026-09-27] (stage: Review (adversarial)) `flattenDateAxisRows` runs
  fresh on every render, once per date row (O(N²) total for N date rows)
  purely to look up one row's own leading cells. Wasted work, not a
  correctness bug at this app's personal-tool table sizes. Candidate fix:
  hoist/memoize the flatten once in `SyncedDataTable.tsx` instead of
  recomputing per row.

- [2026-09-29] (stage: Maintenance) The table's year/month header cells
  don't carry the confirmed design mockup's year-tier accent color
  (`SyncedDataTableHeader.tsx` uses one shared, undifferentiated class for
  both tiers) - traced to the written plan itself specifying this, not an
  Implementation error, so a plausible case exists either way (the table's
  cells already carry unambiguous text, unlike the chart's terser marks).
  Needs an explicit Planning call rather than further silent divergence.

- [2026-09-29] (stage: Maintenance) A month label centered on a lead-in/
  first point sitting at the domain minimum visually collides with the
  Y-axis's own leftmost tick label (renders as e.g. "0Sep" with no gap) -
  a real, user-visible defect. Year labels already have an edge-safety
  collision guard (`yearLabelPlacement.ts`) for exactly this class of
  problem; month labels have no equivalent yet. Candidate fix: extend that
  module (or a sibling) to also place month labels away from the
  Y-axis-reserved width at the plot's left edge.

- [2026-10-01] (stage: Review (adversarial)) Two narrow, currently-
  unreachable edge cases from re-reviewing the `yearOf()`/`DateRangeSlider`
  NaN hardening: (1) `WorkComparisonSection.tsx`'s `domainStart` guards
  `earliestUnionYear` against `NaN` via `??` but not `earliestPostYear`
  (`??` doesn't catch `NaN`) - unreachable since the backend types that
  field as `Integer`/JSON can't carry `NaN`, and DateRangeSlider's own
  clamp would catch it downstream anyway. (2) `yearOf("")`/`yearOf("0000-
  ...")` return `0` (passes the new guard) while `monthIndexOf` returns
  `NaN` for the same inputs - an empty-string `capturedOn` at the earliest
  union date would push the domain floor to year 0, causing ~2000 slider
  marks (a DOM-bloat/perf issue, not a crash). Revisit only if real
  malformed-date reports surface this specific shape.

- [2026-10-01] (stage: Review (adversarial)) `useWorkComparisonStore`'s
  `migratingStorage` wrapper made store rehydration genuinely async (a
  missing-`version` normalization now goes through an async storage
  adapter path) - a brief first-mount window where selection/range state
  may read as not-yet-hydrated defaults. No observed user-facing symptom
  (the component's own lazy-initializer reconciliation already tolerates
  an empty/default selection on first render), but worth a dedicated test
  if hydration-timing bugs surface later.

- [2026-10-01] (stage: Review (adversarial)) `WorkComparisonSection.tsx`'s
  domain computation mixes time bases: local time for `currentYear`/
  `domainStart`'s ceiling, but UTC for `domain.end`. For a user near a
  month/year boundary where local and UTC dates fall in different months,
  this can produce a one-month-off domain ceiling. Low-probability; fixing
  the basis touches locked plan decisions and should go through Planning,
  not a reactive patch.

- [2026-09-24] (stage: Testing) `frontend/src/lib/syncedTableModel.test.ts`
  is 656 lines, well over the 400-line `.ts` budget. Natural split: one
  spec file per builder (`buildTrendTableModel`/`buildRatioTableModel`/
  `buildMultiSeriesTableModel` each already have their own clearly-
  delimited `describe` block) - extractable without touching test content.

- [2026-08-28] (stage: Deployment, retro-confirmed still open/worse as of
  2026-10-05) **GitHub Actions CI has been red on every push to `main`
  since at least 2026-07-31** (231 commits as of the 2026-10-05
  retrospective). The live deployed app itself is independently verified
  healthy - this is a CI-only problem. One known cause (missing Playwright
  browser install on the `frontend-lint-and-unit` job) was already fixed.
  Two failure modes remain, confirmed still unaddressed by the latest
  retrospective:
  1. A Vitest mock-resolution error in `frontend/src/bookmarklet/
     entrypoint.test.ts` that fails in CI but passes on every local run -
     not yet root-caused.
  2. 42 failing Playwright e2e tests across all three browsers, including
     "home page loads and renders the app heading" (open hypothesis since
     August, never investigated: dev-server-not-ready-in-time under CI
     load, given this project's documented history of Playwright
     `webServer` startup flakiness - unconfirmed). Separately, the
     already-diagnosed "By Work sub-tab axe-clean" `getByRole` strict-mode
     collision (2026-08-09 entry above) is part of this same failing e2e
     batch.
  Needs a dedicated Maintenance pass to reproduce and fix both outstanding
  causes so CI is actually green again, not just locally-green.

- [2026-10-06] (stage: Implementation) 4 of the `accessibility.spec.ts`
  e2e failures (on top of the already-tracked webkit color-contrast and
  CI-wide 42-test entries above) are confirmed pre-existing - reproduced
  identically against the chart-table-polish-batch plan's own
  pre-Implementation commit (`a3140dd`), in an isolated worktree, so none
  are caused by this batch: (1) "keyboard walkthrough ... operate both
  slider thumbs" times out focusing `role=slider name=/range start/` on
  all 3 browsers; (2) "the comparison view with multiple works selected
  ... has no detectable a11y violations" (light + dark) can't find that
  same slider after selecting a second work, on all 3 browsers; (3) "the
  populated dashboard's 3-tier date header ..." can't find an expected
  "Before 2025 (estimated baseline)" column header in the Total Hits
  table, on all 3 browsers. All three look related (something about this
  environment's mock/fixture data not producing the >2-union-point
  condition `shouldShowRangeSlider`/account-level leadIn eligibility
  expects) rather than three independent bugs - worth a single root-cause
  pass rather than three.
