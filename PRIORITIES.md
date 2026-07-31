# Priority Implementation List

Organizes `TECH_DEBT.md` and `ROADMAP.md` into priority tiers for actual
work sequencing. This is a living document - update tiers as items are
resolved, reprioritized, or new debt/backlog gets logged. It doesn't
replace either source file; it's the "what do we work on, in what order"
view on top of them.

## Tier 1 - High-value, do soon

- **`RatioChart` lead-in: `1` -> `0`.** Reverses the earlier explicit
  `ratio: 1` decision. Cheap - same shape as the `earliestPostYear`
  lead-in work already done; a value + test change in `DashboardPage.tsx`
  and the relevant chart specs.
- **`scrapeStats.ts` one-work-per-fandom bug.** Root cause of the
  "data ingestion is drastically wrong" note - real works are silently
  dropped today when a fandom heading has more than one. Needs
  `querySelectorAll` (or equivalent) per fandom row, plus rebuilt test
  fixtures captured from a real saved AO3 stats page. Highest
  data-correctness impact of anything on this list.
- **`DashboardPage` clears a valid token on network errors.** Active bug
  affecting real usage right now - a network blip logs the user out while
  showing a message that says it isn't their token's fault. Scope the
  `clearToken` call to the token-mismatch (`ClientError`) branch only.
- **InstallPage clipboard test - consolidate + fix.** Logged twice in
  `TECH_DEBT.md` (merging into one entry as part of this pass); currently
  the only red test in the frontend suite. Fix via
  `Object.defineProperty` instead of `Object.assign`, or use
  `userEvent`'s own clipboard stub.
- **Two Playwright a11y failures (heading-order, duplicate-text).** Real,
  currently-failing a11y checks, pre-existing (confirmed via `git stash`
  not introduced by the re-skin). Heading-order needs an `h2` promoted
  for the aggregate-charts section; duplicate-text needs the mismatch
  assertion scoped to one element.
- **WebKit tab-order a11y test.** Needs a decision (scope the assertion
  to non-WebKit projects, or accept as a documented WebKit-only gap) -
  cheap either way, just needs someone to decide and act.
- **Bookmarklet drag-install unreliable.** *(Moved up from Tier 2 per
  explicit instruction.)* Not yet root-caused (candidates: the `onClick`
  `preventDefault()` interfering with native drag semantics, or a
  browser-specific `javascript:` URI drag restriction). **Blocked**: the
  user will describe the exact repro/issue when it's ready to be worked.

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
