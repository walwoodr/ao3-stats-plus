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
- List of per-work bookmark comments (new data source — likely requires
  scraping the work's bookmarks page, not just the stats page; more scraping
  surface than anything in v1)
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
