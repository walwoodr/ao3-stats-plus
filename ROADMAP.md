# Roadmap

This document tracks scope explicitly deferred past v1 during Planning, so it
doesn't get lost. It is not a replacement for `TECH_DEBT.md` (which tracks
things found to be wrong/incomplete during work) — this is forward-looking
feature scope, agreed as out of scope for v1 on purpose.

## v1 scope (confirmed)

- Total hits over time
- Total kudos over time
- Kudos-to-hits ratio over time
- Per-work hits over time (work-selectable)
- Per-work kudos over time (work-selectable)

## v2 candidates (confirmed 2026-07-22, deferred from v1 on purpose)

- Per-work bookmarks over time, from both the stats page and the individual
  work page (these may expose different/more detailed bookmark data — worth
  comparing both sources when this is picked up)
- Subscriptions over time (per-work `subscriptions` and account-level
  `total_user_subscriptions` are already captured in the v1 data model as of
  Planning — this item is about graphing them, not new data collection)
- Per-work comments over time (also already captured in the v1 data model;
  graphing only)
- User subscriptions over time (account-level; see subscriptions note above)

## v2 candidates (confirmed 2026-07-30, deferred from the earliest-post-year
baseline feature on purpose)

- Per-work creation-date scraping and per-work zero-basis baselines: the
  account-level "earliest post year" synthetic zero-point (added for the
  aggregate hits/kudos trend charts) deliberately does NOT extend to
  per-work trend charts, since a specific work's own trend should start
  from when that work was actually posted, not the author's earliest
  posting year overall. This needs a new scraping step (the bookmarklet
  would need to capture each work's creation/posted date, not currently
  collected) plus per-work data-model/ingest changes before per-work charts
  can get their own accurate zero-basis starting point.
- Present per-work statistics as a graph with a interface allowing the user
  to select a list of multiple works to see the statistics graphed alongside 
  one another. Each work should have a unique line-and-point style to allow 
  for differentation within work, up to a reasonable maximum. 
- The per-work statistics graph selection should offer an option to select
  all works within a fandom to display in the graph at the same time
- When the user has > 2 data points, allow the user to choose a time range 
  to present via a two point slider that ranges from earliestPostYear to the 
  current date.

## v2 candidates (confirmed 2026-07-31, deferred from ongoing Maintenance work)

- Mobile-friendly bookmarklet installation/capture flow. Today's InstallPage
  assumes a desktop browser with a visible bookmarks bar (drag-to-install,
  with a keyboard-accessible "copy the code" fallback for desktop users who
  can't drag) - neither path really works on mobile: dragging to a
  bookmarks bar isn't a mobile gesture, and most mobile browsers (notably
  iOS Safari) either don't support installing/running `javascript:`
  bookmarklets the same way, restrict them, or make manually pasting one
  into a new bookmark's URL field a poor experience. Needs Discovery/
  Planning on what's actually feasible per mobile browser (iOS Safari vs.
  Android Chrome may differ significantly) before committing to an
  approach - candidates include a documented manual-install flow per
  platform, a companion approach that doesn't rely on bookmarklets at all
  for mobile (e.g. a share-sheet/shortcut-based capture), or explicitly
  scoping mobile out with a clear in-app message instead of a broken/
  confusing attempt.

## v2 candidates (confirmed 2026-08-02)

- Visual improvements for the bookmarklet's injected UI. The success/
  failure/progress/summary banners (`frontend/src/bookmarklet/banners.ts`,
  `bannerStyles.ts`, `successBannerTokenField.ts`) are functional and follow
  MASTER.md's palette/typography tokens via inline styles, but haven't had
  a dedicated design pass - they're plainer than the rest of the app's UI.
- A "don't close this page" block/warning while Phase 2 fan-out capture is
  in progress. The fan-out (`fanOut.ts`) walks every scraped work
  sequentially and throttled, which can take a real amount of time for a
  prolific author (up to `maxWorksPerRun` works, each with up to
  `maxBookmarkPagesPerWork` bookmark pages) - if the user navigates away or
  closes the AO3 tab mid-run, only whatever was already incrementally
  POSTed survives; the rest is silently abandoned rather than resumed or
  retried. A `beforeunload` prompt (or similar) while a run is active would
  prevent that data loss from being accidental/unnoticed.

## v2 candidates (confirmed 2026-08-03)

- Per-work graphs (`WorkComparisonSection`/`MultiSeriesTrendChart`, and the
  older single-work `PerWorkTrends` if still applicable) should include the
  work's own publish date as a de-facto zero-basis data point, rather than
  starting each line from its first captured stats snapshot. This is the
  per-work analogue of the account-level "earliest post year" synthetic
  zero-point already used for the aggregate hits/kudos charts, and depends
  on the per-work creation-date scraping/data-model work already listed
  above under "Per-work creation-date scraping and per-work zero-basis
  baselines."
- ~~In the multi-work comparison graph, differentiate series using ONLY the
  marker-shape and color-role (`seriesStyles.ts`'s 6-slot table) - stop
  using dash pattern as a per-series differentiator. Instead, reserve
  dashing for a single shared meaning: the segment of a line between a
  work's zero-basis publish date and its first actually-recorded data
  point is drawn dashed (representing "no data captured yet, interpolated
  back to zero"), while every segment from the first real data point
  onward is solid, regardless of which work/slot it belongs to.~~
  **RESOLVED 2026-08-04:** consolidated into the USDS color scheme item
  below - a 10-slot table makes per-series dash impossible regardless
  (10 mutually distinguishable dash patterns don't exist), so that plan
  necessarily sets series lines solid and reserves dash solely for the
  zero-basis lead-in, reaching this same end-state as one piece of work.
  See `docs/plans/usds-dataviz-color-scheme.md`.
- The date-range slider's default bounds should be the union, across the
  currently-selected works, of (each selected work's own publish date)
  through (the most recent captured date among them) - not the author's
  full earliest-post-year-to-now range as today. Depends on the same
  per-work publish-date data described above. **Amended 2026-08-04:** the
  slider should also make unselectable any date strictly between the
  latest (most recent) zero-basis date across currently-selected works and
  the earliest real captured date across currently-selected works - i.e.
  you cannot choose a window that falls entirely inside that span. Every
  selected work is either not-yet-published or published-but-not-yet-
  captured throughout that range, so a window chosen entirely inside it
  would show nothing but flat interpolated lead-in lines, with no real
  data to compare. Depends on the per-work zero-basis-dates feature
  (shipped 2026-08-04, see `docs/plans/per-work-zero-basis-dates.md`) for
  both the per-work zero-basis dates and each work's first real captured
  date.
- ~~Establish a proper data-visualization color scheme for the graphs,
  modeled on the U.S. Digital Service's Data Design Standards color system
  (https://xdgov.github.io/data-design-standards/components/colors) rather
  than the current 6 series colors in `colorTokens.ts` (derived during the
  per-work-comparison-graph feature's Planning stage). Pairs the resulting
  palette with a larger set of distinguishable SVG marker shapes so
  shape x color combinations raise the multi-work comparison graph's
  selection cap from 6 to ~10, with a formal colorblind (CVD) verification
  step.~~ **SHIPPED 2026-08-04** (`docs/plans/usds-dataviz-color-scheme.md`;
  the shape set was further corrected same-day - plus/star/cross swapped
  for hollow diamond/triangle-up/triangle-down per user review - see that
  plan's addendum).
- Adjust the vertical (Y) axis range on all graphs (aggregate and
  per-work) to pad around the actual min/max values present in the
  plotted data set, rather than always anchoring the axis to 0. Where
  this leaves a gap between 0 and the padded starting value, render a
  visible axis break/truncation indicator there so the non-zero-origin
  axis isn't misread as starting at 0.

## v2 candidates (confirmed 2026-08-04)

- Display per-work bookmark notes/comments in the UI. **Verified 2026-08-04:
  this is NOT a new data source**, correcting the 2026-07-22 batch's
  original framing ("likely requires scraping the work's bookmarks page").
  `scrapeWorkBookmarks.ts` already scrapes each public bookmark's note
  (`noteHtml`), bookmarker name, tags, date, and collections from the
  work's `/works/:id/bookmarks` page; this is already stored (the
  `work_bookmarks` table) and already exposed via GraphQL
  (`WorkBookmarkType`, `PerWorkSeriesType#bookmarks`) - all shipped as
  part of `docs/plans/work-page-enrichment-data-model.md`. That plan
  explicitly scoped the consuming UI out ("The toggle-graph UI that
  consumes this data remains explicitly out of scope and needs its own
  consultation + Planning pass"). What's actually left is pure frontend
  work: designing and building a UI to list/display this already-captured
  data - no scraping, backend, or data-model work needed.
- Persist the "compare works" selection (`WorkComparisonSection`'s
  selected-work-ids state, currently plain `useState` that resets on every
  page load) to browser storage - e.g. `localStorage`, scoped per-username
  similar to `tokenStorage.ts`'s existing pattern - so a chosen comparison
  set of works survives a page reload or a later revisit instead of
  starting empty every time.
- The date-range slider (`DateRangeSlider`, currently year-granularity only
  - a `[number, number]` pair of years) should allow filtering with
  month-level specificity, not just whole years. Needs Discovery/Planning
  on the actual UI mechanism (e.g. a finer-grained slider, paired
  month+year pickers, or a different control entirely) and how
  month-granularity interacts with the existing `capturedOn`-date-keyed
  chart axis and the year-only union/domain logic in
  `comparisonSelection.ts`.

## v2 candidates (confirmed 2026-08-07)

- Offer a table view as an alternative to the graph view, for every chart
  (account-level and per-work). Each chart already ships an accessible
  data-table alternative for screen-reader users (per MASTER.md's
  accessibility conventions) - this item is about surfacing that as a
  visible, user-facing toggle for anyone who prefers tabular data, not just
  as an a11y fallback. Needs Discovery/Planning on scope: does this apply
  uniformly to every chart type shipped so far (`TrendChart`, `RatioChart`,
  `MultiSeriesTrendChart`), and does the underlying accessible-table
  markup already used for screen readers just get exposed directly, or
  does a user-facing table need its own presentation (sorting, per-work
  columns, etc.)?
