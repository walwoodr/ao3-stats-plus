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
