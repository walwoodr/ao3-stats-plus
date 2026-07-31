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
- [2026-07-23] (stage: Review) The pre-POST scrape-failure banner
  (`renderInfoBanner`) uses `role="status"` (polite live region) and does not
  move focus. It is the *only* feedback when a capture can't proceed (no
  works / not All Years / scrape failed), yet is less assertive than the
  post-POST failure/unauthorized banners (`role="alert"`). Plan section 6
  only mandates focus-move on success, so this is within plan, but a screen
  reader user who triggers the bookmarklet on the wrong view may get a weak
  or missed announcement. Deferred: matches the confirmed plan; revisit if
  the cross-origin a11y smoke test (plan section 6) surfaces it.
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
- [2026-07-31] (stage: Review/Maintenance) **Resolved, with real evidence.**
  The "Improve data ingestion" one-work-per-fandom bug went through two
  rounds: the first fix (`:scope > dl`, direct children of the fandom row)
  was a best-evidence reconstruction that turned out wrong - Review fetched
  AO3's actual view template (`otwcode/otwarchive`'s
  `app/views/stats/index.html.erb`, `raw.githubusercontent.com`, verified
  directly rather than trusted) and found each work nests one level deeper
  than assumed: `li.fandom.listbox.group > ul.index.group > li > dl`, not
  a direct-child `<dl>`. The first fix's direct-child selector matched
  zero elements against that real shape, so `parseWorks` returned `null`
  and every scrape failed outright - worse than the original bug (which at
  least captured the first work per fandom via a descendant selector).
  Re-fixed to select `:scope > ul.index.group > li`, then `:scope > dl`
  within each. All 5 affected fixtures (`all-years-happy-path.html`,
  `multi-fandom-work.html`, `multi-year-history.html`,
  `multiple-works-same-fandom.html`, `no-year-links.html`) rebuilt to match
  the real nesting; confirmed the corrected fixtures fail against the
  unfixed selector (15/20 tests red) before applying the fix, then green
  after (20/20).
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
- [2026-07-30] (stage: Review) `PerWorkSeriesType#points` issues one query
  per work (N+1) since it's resolved per parent `Work` with no batch/
  preload. Fine at personal scale (tens of works); revisit with a GraphQL
  dataloader/preload if per-work counts grow.
- [2026-07-31] (stage: Review) `spec/deployment/render_yaml_spec.rb` validates
  render.yaml against a *self-defined* expected shape, not against Render's
  actual published Blueprint schema, so it cannot catch the file being
  internally consistent yet wrong against Render's API (exactly how the
  `staticSites:` mistake produced a false-green). Even once the current
  schema error is corrected, this spec will not catch future Render schema
  drift. Deferred: consider a lightweight periodic check against Render's
  live Blueprint reference (or a documented "re-verify against render.com/docs
  before deploy" step), rather than treating a green local spec as proof the
  Blueprint is deployable.
- [2026-07-31] (stage: Review) `DashboardPage`'s token-clearing effect now
  fires on any `error instanceof ClientError` (commit `fa1b2b4`). That is a
  strict improvement over clearing on every error, but `ClientError` is
  broader than "bad token": graphql-request also throws it for a non-2xx
  response or any backend-surfaced GraphQL error, so a transient backend
  5xx would still clear a valid token *and* show the "token doesn't match"
  copy (via `messageForStatsError`, which has the same conflation). Pre-
  existing conflation, low probability for a personal tool; revisit by
  discriminating a genuine auth/token rejection (e.g. an error code/path in
  the GraphQL `errors` payload) from a generic server error before clearing.
- [2026-07-31] (stage: Maintenance) No documented/convenient way to point
  local frontend dev at the real deployed backend
  (`https://ao3-stats-plus-api.onrender.com`, now live on Render) instead
  of `localhost:3000` or a Cloudflare tunnel. Today's `.env.local`
  workflow (see README.md, "Frontend (React + Vite)" and the
  `npm run tunnel:backend` convenience) is oriented entirely around local-
  backend and tunnel-to-local-backend development - there's no equivalent
  quick path to run `npm run dev` against the production API for testing
  frontend changes against real deployed data/behavior without also
  running the backend locally. Candidate shape: a documented
  `.env.local` snippet or a small npm script (mirroring
  `tunnel-backend.mjs`'s pattern) that sets `VITE_GRAPHQL_URL`/
  `VITE_API_ORIGIN` to the real Render origin. Needs a product decision on
  whether this is actually desired (developing against live production
  data has its own risks - accidental writes via `/ingest`, rate limits,
  etc.) before it's built.
- [2026-07-31] (stage: Retrospective) `npx vitest run --coverage`'s printed
  report silently omits several source files that have real, passing test
  files - confirmed via direct verification that `AppLayout.tsx`,
  `LandingPage.tsx`, `App.tsx`, `TokenEntryForm.tsx`, `useTokenStore.ts`,
  `useTokenFromUrl.ts`, `useStatsForUser.ts`, `ingestClient.ts`,
  `buildIngestPayload.ts`, `tokenStorage.ts`, `colorTokens.ts`, and
  `constants.ts` all have dedicated `.test.ts(x)` files that run and pass
  (18 test files total across the suite), yet none of them appear in the
  coverage table - the report only ever lists a handful of files
  (bookmarklet/*, charts/*, lib's graphqlClient+useChartColors,
  routes/Dashboard+Install). Tried `coverage.all: true` plus an explicit
  `include`/`exclude` in `vite.config.ts`'s `test.coverage` block - no
  effect on which files appear, so the cause is likely specific to this
  repo's multi-project Vitest config (`test.projects: [...]`, one jsdom
  project + one Storybook/browser project) not merging/attributing v8
  coverage correctly across projects, rather than a `coverage.all`
  misconfiguration. The printed "91.79% statements" figure is real for the
  files it does cover, but is not the true whole-project number - treat it
  as a lower bound, not a baseline-compliance verdict, until this is
  root-caused. Needs Testing/Maintenance to dig into Vitest's
  multi-project coverage merging (possibly a known Vitest issue/GitHub
  discussion, or a per-project `coverage` override needed instead of a
  top-level one).
- [2026-07-31] (stage: Testing) **EXTERNAL-UNVERIFIED**: all six
  `frontend/src/bookmarklet/fixtures/work-page-*.html` fixtures (backing
  `scrapeWorkPage.test.ts`, per the work-page enrichment plan's task 5) are
  modeled on otwcode/otwarchive's `app/helpers/works_helper.rb`
  (`work_meta_list`) and general community knowledge of AO3's rendered
  work-page template - `dl.work.meta.group`, a nested `dl.stats` with
  `dd.published`/`dd.status`/`dd.chapters`/`dd.comments`/`dd.bookmarks`, a
  "Completed:"-vs-"Updated:" `dt` distinguishing `complete`, and
  `dd.series > span.series > a` for series membership. None of this has
  been verified against a live AO3 page (no web/account access available
  during Testing). Each fixture carries its own `EXTERNAL-UNVERIFIED`
  header comment. Implementation must re-verify these selectors against a
  real AO3 work page (same discipline as the 2026-07-31 stats-page fandom-
  nesting fix logged above) before trusting `scrapeWorkPage.ts` in
  production - if the real markup differs, both the fixtures and the
  selectors written against them will need correcting.
