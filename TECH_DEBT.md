# Tech Debt

## Backlog

- [2026-07-30] (stage: Maintenance) Three `accessibility.spec.ts` axe scans
  (landing page, install page, no-token dashboard state) fail only under the
  WebKit Playwright project with `color-contrast` violations reporting
  values like `fgColor: #8f8df4` / `bgColor: #837d85` on elements styled
  with `bg-ink`/`text-paper` (whose real design-token values are nowhere
  near those hex codes - the light-mode token pairs were computationally
  verified >=4.5:1 during the design re-skin). These read like WebKit
  capturing colors mid-`transition-colors` (the affected elements all use
  `transition-colors duration-200`) rather than a real contrast defect -
  same "WebKit-testing-environment gap, not an app bug" shape as the
  tab-order item above, but not yet root-caused with the same confidence.
  Confirmed unrelated to this session's other changes (`git log` shows
  `LandingPage.tsx` untouched since the design re-skin). Needs Testing to
  either wait for the transition to settle before scanning (e.g.
  `page.waitForTimeout` or disabling transitions in the test env) or
  confirm/refute the timing theory and scope accordingly.
- [2026-07-23] (stage: Implementation) Manual verification of the
  bookmarklet against live AO3 (plan item 14 in
  `docs/plans/bookmarklet-entrypoint-and-hosting.md`) hit Chrome's **Local
  Network Access (LNA)** restriction (rolling out in Chrome 141/142):
  clicking the bookmarklet on `https://archiveofourown.org` while the
  frontend runs locally at `http://localhost:5173` gets silently blocked -
  a public HTTPS site can't load a script from `localhost` over plain HTTP,
  and since the target isn't a secure context, Chrome blocks outright
  rather than prompting (`prompt action: (null)` in the DevTools Issue).
  Not an app bug: in production both frontend and backend will be real
  public HTTPS origins, so LNA won't apply. Worked around for local manual
  testing via an HTTPS tunnel (documented in README.md, "Testing the
  bookmarklet against real AO3") rather than a code change. Leaving this
  logged in case Deployment or Retrospective want to fold the tunnel step
  into a documented pre-Deployment smoke-test procedure, or confirm
  production origins are enough to make LNA moot.
- [2026-07-23] (stage: Review) `entrypoint.ts` interpolates the scraped
  `username` into the dashboard URL (`${frontendOrigin}/u/${username}?token=`)
  and into the localStorage key without `encodeURIComponent`. AO3's username
  charset is restricted enough that this is low-risk today, but encoding it
  would be more robust against any URL-special character and is cheap.
  Deferred: not a live defect, no failing case with real AO3 usernames.
- [2026-07-23] (stage: Review) The pre-POST scrape-failure banner
  (`renderInfoBanner`) uses `role="status"` (polite live region) and does not
  move focus. It is the *only* feedback when a capture can't proceed (no
  works / not All Years / scrape failed), yet is less assertive than the
  post-POST failure/unauthorized banners (`role="alert"`). Plan section 6
  only mandates focus-move on success, so this is within plan, but a screen
  reader user who triggers the bookmarklet on the wrong view may get a weak
  or missed announcement. Deferred: matches the confirmed plan; revisit if
  the cross-origin a11y smoke test (plan section 6) surfaces it.
- [2026-07-30] (stage: Maintenance) `InstallPage`'s draggable bookmarklet
  link doesn't reliably drag-install into the bookmarks bar in at least one
  browser tested manually - users have to fall back to the "Show code" /
  Copy button flow instead. Not yet root-caused (candidates: the `onClick`
  `preventDefault()` interfering with native drag semantics, or a
  browser-specific `javascript:` URI drag restriction). Deferred: the
  copy/paste fallback already works and is keyboard-accessible; revisit if
  drag-install turns out to be commonly expected.
- [2026-07-30] (stage: Implementation) `frontend/src/bookmarklet/banners.ts`'s
  color mapping onto MASTER.md's 7-token palette consolidates the previous
  4-color severity scheme (success/failure/info/retry) into 3 roles
  (growth/destructive/accent) since the palette has no dedicated "warning"
  role - the `retryBanner` (network/POST failure, offers a Retry button) now
  shares `--color-destructive` with hard failures instead of its own amber.
  Distinguished only by copy/button now, not color. Revisit if a future
  design pass wants a dedicated warning/retry role.
- [2026-07-30] (stage: Maintenance) The bookmarklet's capability token
  (`read_token`, `SecureRandom`-generated) is an opaque, hard-to-transcribe
  string. Users who lose the "View your dashboard" link and have to
  manually retype the token (`TokenEntryForm`) find it unwieldy. Deferred
  product decision: consider generating a short, memorable word/two-word
  phrase instead (e.g. a small wordlist-based generator) - needs Planning
  to weigh memorability against the token's job as a capability secret
  (shorter/more guessable phrases are weaker if this is meant to gate
  write access, not just convenience).
- [2026-7-30] Walk through all strings presented to users in the end UI
  with a human and verify that they are correct. 
- [2026-07-30] (stage: Maintenance) **Resolved**, with a caveat: the
  "Improve data ingestion" one-work-per-fandom bug (`scrapeStats.ts`'s
  `parseWorks`, previously a single `querySelector("dl > dt a")` per fandom
  row) is fixed - it now iterates every direct-child `<dl>` under a fandom
  row (`:scope > dl`), so multiple different works under one fandom heading
  are all captured, not just the first. A new fixture
  (`fixtures/multiple-works-same-fandom.html`) and three tests cover it.
  **Caveat**: I could not get a real, currently-live saved AO3 stats page to
  verify the exact nesting shape directly (would need an authenticated
  session) and attempted to confirm it against AO3's open-source repo
  (otwcode/otwarchive) but hit an auth wall on GitHub's code search. The fix
  is grounded in strong circumstantial evidence (the existing fixtures'
  established per-work `<dl>` shape, "grouped by fandom" as AO3's documented
  default stats view, and the fact that a single `querySelector` was
  guaranteed-wrong regardless of the exact nesting), but the new fixture is
  a best-evidence reconstruction, not a captured real page. Worth a quick
  real-world sanity check against an actual AO3 stats page with a
  multi-work fandom the next time someone has one handy.
- [2026-07-30] (stage: Review) `config/initializers/cors.rb`'s
  `DEFAULT_FRONTEND_ORIGINS` fallback now includes an open
  `https://*.trycloudflare.com` wildcard, and cors.rb is active in every
  environment (including production). If a production deploy forgets to set
  `FRONTEND_ORIGINS` explicitly, any Cloudflare Quick Tunnel origin would be
  allowed to call `/graphql`. Low risk today: GraphQL has no cookie/session
  auth (`GraphqlController` context carries no `current_user`; access is
  gated by the per-request `read_token` capability, which a cross-origin
  page cannot read), so the wildcard grants no ambient-credential access.
  Already acknowledged by the in-file `TODO(deployment)`. Deferred: consider
  failing closed (raise/empty allowlist) in production when `FRONTEND_ORIGINS`
  is unset, rather than falling back to a dev default at all.
- [2026-07-30] (stage: Review) `TrendChart.tsx`/`RatioChart.tsx` now read
  `chartData[0].xValue` and `chartData[chartData.length - 1].xValue` for the
  numeric XAxis `domain` with no empty-data guard, so rendering either chart
  with an empty `points` array and no `leadIn` throws a TypeError (the prior
  `dataKey="capturedOn"` version tolerated empty data). Not currently
  reachable - every caller in `DashboardPage.tsx` renders the charts only
  when the series is non-empty (`aggregateSeries.length > 0`; per-work works
  always carry >=1 point) - but the components are reusable and have
  Storybook stories, so a future caller/story with empty points would crash.
  Deferred: latent robustness gap, not a live defect; add an empty-data
  early return if these charts gain other callers.
- [2026-07-30] (stage: Review) `/ingest` has no authentication, no rate
  limiting, and no recovery path from a claimed username. Any HTTP client
  (CORS only constrains browsers, not `curl`/scripts) can POST an unclaimed
  AO3 username and permanently bind it to a token it chose the app to mint;
  the real author then gets a permanent 403 with no way to reclaim (there's
  no proof-of-AO3-ownership step). Same surface allows username enumeration
  (403 = already claimed, 201 = was free), data poisoning, and unbounded
  user/snapshot/work row creation (storage DoS). Accepted as inherent to the
  credential-less "personal tool" design for now; revisit if the app becomes
  multi-tenant or public - candidate mitigations: a Rack::Attack throttle on
  `/ingest`, and/or binding a claim to something only the real author can
  produce.
- [2026-07-30] (stage: Review) `graphqlClient.ts` silently falls back to
  `http://localhost:3000/graphql` when `VITE_GRAPHQL_URL` is unset -
  inconsistent with the bookmarklet build, which deliberately fails loudly
  when `VITE_API_ORIGIN` is unset (see vite.bookmarklet.config.ts). A
  production frontend build with the env var forgotten would silently ship a
  dashboard pointed at localhost. Consider failing the build/boot loudly, or
  at least warning, when it's unset in a production build.
- [2026-07-30] (stage: Review) Capability-token comparisons use plain `==`
  (`QueryType#stats_for_user`, `SnapshotIngestService#find_or_create_user!`),
  not a constant-time compare (`ActiveSupport::SecurityUtils.secure_compare`).
  Timing attacks against 192-bit `SecureRandom.hex(24)` tokens over the
  network are impractical, so this is hygiene, not a live hole; cheap to
  harden if touched.
- [2026-07-30] (stage: Review) `SnapshotIngestService#find_or_create_user!`
  does `find_by` then `create!` with no uniqueness handling, so two
  concurrent first-ingests for the same brand-new username race: the loser
  hits the DB unique index, raises `ActiveRecord::RecordNotUnique` (not
  rescued by `IngestController`), and returns a 500 instead of retrying/
  deduping. Very low probability for a personal tool; revisit with a
  `retry`-on-RecordNotUnique or upsert if it ever matters.
- [2026-07-30] (stage: Review) `PerWorkSeriesType#points` issues one query
  per work (N+1) since it's resolved per parent `Work` with no batch/
  preload. Fine at personal scale (tens of works); revisit with a GraphQL
  dataloader/preload if per-work counts grow.
