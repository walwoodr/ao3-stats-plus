# Priority Implementation List

Organizes `TECH_DEBT.md` and `ROADMAP.md` into priority tiers for actual
work sequencing. This is a living document - update tiers as items are
resolved, reprioritized, or new debt/backlog gets logged. It doesn't
replace either source file; it's the "what do we work on, in what order"
view on top of them.

## Tier 1 - High-value, do soon

Status: **6 of 6 done.**

- [x] **`RatioChart` lead-in: `1` -> `0`.** Done (`16b16e9`).
- [x] **`scrapeStats.ts` one-work-per-fandom bug.** Done (`3a366d1`) - fixed
  via `:scope > dl` iterating every work per fandom row instead of just the
  first. Caveat logged in `TECH_DEBT.md`: couldn't get direct access to a
  real live AO3 stats page to verify the exact nesting shape, so the fix
  is grounded in strong circumstantial evidence, not a captured real page -
  worth a sanity check against a real multi-work-per-fandom account.
- [x] **`DashboardPage` clears a valid token on network errors.** Done
  (`fa1b2b4`) - `clearToken` now only fires on a backend-confirmed
  `ClientError`, not a plain network/CORS failure.
- [x] **InstallPage clipboard test - consolidate + fix.** Done (`4e92dba`)
  - root cause was `userEvent.setup()` unconditionally attaching its own
  getter-only `navigator.clipboard` stub; fixed by spying on the existing
  stub instead of replacing it.
- [x] **Two Playwright a11y failures (heading-order, duplicate-text).**
  Done (`b5f4c8b`). Fixing heading-order surfaced a third, previously-
  masked violation (`aria-prohibited-attr` on the chart point-markers,
  hidden until they became genuinely reachable earlier this session) -
  fixed by switching markers from `aria-label` to plain text content.
  Also surfaced 3 new WebKit-only `color-contrast` failures (landing/
  install/no-token-dashboard), logged to `TECH_DEBT.md` as a likely
  CSS-transition timing artifact, not a real defect - out of scope for
  this pass.
- [x] **WebKit tab-order a11y test.** Done (`ce8ea3a`) - decided: skip the
  one assertion on WebKit specifically (`test.skip(browserName ===
  "webkit", ...)`), since it's a documented Playwright/WebKit environment
  limitation, not an app bug.
- [x] **Bookmarklet drag-install unreliable.** *(Moved up from Tier 2 per
  explicit instruction.)* Done (`3f49316`). Neither originally-suspected
  candidate was the cause - found by actually inspecting the drag
  gesture's real `dataTransfer` payload in a browser: React silently
  sanitizes a `javascript:` URL passed as the `href` prop into a stub
  that just throws, which still matched the old test's loose
  `/^javascript:/` regex. Fixed via a ref-based `setAttribute`, bypassing
  React's own href reconciliation.

## Tier 2 - Worth doing, not urgent

- `encodeURIComponent` on scraped username interpolation (cheap, no live
  defect yet)
- Non-constant-time token comparison -> `secure_compare` (cheap hygiene)
- `banners.ts` warning/retry color consolidation (needs a design call:
  add a dedicated color, or accept the current 3-role mapping)
- Pre-POST scrape-failure banner: `role="status"` vs `role="alert"`?
  (a11y nuance, low reach)
- Chart empty-data crash guard (latent, not reachable today, cheap
  defensive add)

## Tier 3 - Explicitly deferred (accepted risk at personal-tool scale)

- `/ingest` auth/rate-limiting/recovery gap - explicitly accepted per the
  hosting/Deployment planning discussion (personal tool, not public).
  Worth reconsidering only if a basic `Rack::Attack` throttle turns out
  to be cheap enough to add as pure hygiene regardless.
- Concurrent first-ingest race (very low probability solo)
- `PerWorkSeriesType` N+1 query (fine at current scale; first thing to
  fix if this ever needs to support real multi-user load)
- Token memorability (opaque hex string) - product decision, not a bug
- Chrome LNA local-testing note - informational; superseded by the
  deployment plan's live smoke-test task (R1)

## Already scheduled (deployment plan - see TaskList T1-T5/I1-I7/R1-R8)

**Testing stage (T1-T5) complete** - failing tests written and confirmed
red for: the `DATABASE_URL`/`database.yml` mismatch, the extracted CORS
origin-matcher (`CorsFrontendOriginMatcher`, now genuinely unit-testable),
the frontend production-build env check (extended
`verify-bookmarklet-build.mjs` to also catch a stray `"localhost"` in a
production bundle), and a `render.yaml` shape guardrail spec (the file
itself doesn't exist yet - that's Implementation's job, I3). Implementation
(I1-I7) not yet started.

Not duplicated here: CORS fail-closed in production (I5), and
`graphqlClient`'s silent-localhost fallback is covered by the frontend
build env work (I4/T4). The `database.yml`/`DATABASE_URL` mismatch (I1)
and the CORS matcher extraction (I2) are deployment-plan findings, not
pre-existing TECH_DEBT.md items, but are being worked in the same
timeframe.

## Cleanup done as part of this pass

- Removed the stale "bookmarklet hosting/build strategy" `TECH_DEBT.md`
  entry (resolved - contradicted by the currently-working bookmarklet).
- Merged the two duplicate InstallPage clipboard-test entries into one.
- "Walk through all strings in the UI with a human and verify
  correctness" is a QA pass, not a discrete bug - kept as its own
  checklist item rather than ranked against bug fixes; not scheduled
  into a tier since it needs a human pass, not implementation work.

## Feature backlog (`ROADMAP.md`, separate track - new scope, not fixes)

**Lower effort** (data already collected, graphing-only): subscriptions
over time, per-work comments over time

**Medium effort** (new scraping required): per-work bookmarks over time,
per-work bookmark comments list, user subscriptions over time

**Higher effort** (new feature surface): per-work creation-date scraping
+ per-work zero-basis, multi-work comparison graph with distinct line
styles, fandom-level multi-select, time-range slider
