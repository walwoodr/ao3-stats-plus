# Tech Debt

## Backlog

- [2026-08-28] (stage: Deployment/main thread) **GitHub Actions CI has been
  red on every push to `main` since at least 2026-07-31** (confirmed via
  `gh run list` history) - this predates and is unrelated to the current
  deploy (`c7a7a8a`); the live app itself is independently verified healthy
  (health checks, GraphQL introspection, HTML shell all responding). Two
  distinct real causes, neither of which is the Deployment agent's initial
  (incorrect) diagnosis of a Fast Refresh ESLint warning on
  `MultiSeriesTrendChart.tsx` - that warning is real but genuinely harmless
  and already logged/accepted (2026-08-04 entry), not a failure cause.
  1. **`frontend-lint-and-unit` CI job ("Frontend (ESLint + Vitest)") -
     genuine CI config bug, not a code defect.** All 715 actual Vitest tests
     pass; the job still fails on an "Unhandled Error" - `vite.config.ts`'s
     second Vitest project (`name: "storybook"`) runs component tests in a
     real headless Chromium via `@vitest/browser-playwright`, but
     `.github/workflows/ci.yml`'s `frontend-lint-and-unit` job never runs
     `npx playwright install` (only the separate `frontend-e2e` job does) -
     so the browser binary genuinely doesn't exist on that job's runner.
     Never caught locally because every dev/agent environment already has
     Playwright browsers installed from other work. Fix: add a `Install
     Playwright browsers` step (mirroring the e2e job's) to
     `frontend-lint-and-unit` before its `Vitest` step.
  2. **`frontend-e2e` job - one already-known issue, one not yet
     root-caused.** "switching Bookmarks to the By Work sub-tab is
     axe-clean" is the exact locator collision already logged 2026-08-09
     (`getByRole("img", {name: "Work A"})` matching both the chart figure
     and the "Remove Work A" chip icon) - not new, still out of scope here.
     "home page loads and renders the app heading" newly fails across all
     three browsers (chromium/firefox/webkit) with a 5s timeout waiting for
     the heading - not yet root-caused in this pass (no `webServer`
     startup-failure evidence found in the job log); needs a dedicated
     Maintenance pass to reproduce and diagnose (dev-server-not-ready-in-time
     under CI load is a plausible candidate given this project's documented
     history of Playwright `webServer` startup flakiness, but this is a
     hypothesis, not confirmed).
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
- ~~[2026-07-23] (stage: Review) The pre-POST scrape-failure banner
  (`renderInfoBanner`) uses `role="status"` (polite live region) and does not
  move focus. It is the *only* feedback when a capture can't proceed (no
  works / not All Years / scrape failed), yet is less assertive than the
  post-POST failure/unauthorized banners (`role="alert"`). Plan section 6
  only mandates focus-move on success, so this is within plan, but a screen
  reader user who triggers the bookmarklet on the wrong view may get a weak
  or missed announcement. Deferred: matches the confirmed plan; revisit if
  the cross-origin a11y smoke test (plan section 6) surfaces it.~~ —
  **RESOLVED 2026-08-09**: `renderInfoBanner` now uses `role="alert"`.
- [2026-07-30] (stage: Implementation, re-examined 2026-08-09 stage:
  Maintenance - still open) `frontend/src/bookmarklet/banners.ts`'s color
  mapping onto MASTER.md's 7-token palette consolidates the previous 4-color
  severity scheme (success/failure/info/retry) into 3 roles (growth/
  destructive/accent) since the palette has no dedicated "warning" role - the
  `retryBanner` (network/POST failure, offers a Retry button) now shares
  `--color-destructive` with hard failures instead of its own amber.
  Distinguished only by copy/button now, not color. Revisit if a future
  design pass wants a dedicated warning/retry role.

  **2026-08-09 re-examination (still deferred, no fix applied):** checked
  whether an EXISTING token could distinguish retry-vs-hard-failure without
  adding a new palette role, per this session's Maintenance instructions,
  before treating this as needing a genuinely new design decision. `accent`
  (this product's signature wine) was the most plausible candidate, but
  reusing it here would create a NEW ambiguity rather than resolve the old
  one: `accent` is already the pre-POST informational banner's color
  (`renderInfoBanner` - "notice this, nothing has failed yet"), a distinctly
  lower-severity register than a real POST/network failure that's offering a
  Retry button. Sharing it would blur that existing, load-bearing
  distinction. `growth` is semantically wrong (positive/success valence) for
  any failure state. `ink`/`inkSoft` (neutral text tones) are never used
  elsewhere as a banner severity color, and would risk under-signaling a
  real failure needing user action as "nothing to worry about." A same-role
  visual variation (e.g. a lighter destructive tint, or a dashed vs. solid
  border) was also considered and rejected: it doesn't touch the underlying
  concern this entry names (still literally `--color-destructive`), and
  inventing a new "dashed = less severe" visual language for banners isn't
  established anywhere in MASTER.md (MASTER.md's only existing dash
  convention is chart-specific - lead-in segments - and repurposing it here
  for a different meaning risks its own confusion). No existing-token
  treatment was clearly better than the status quo, so no fix was applied.
  This remains a genuine "add a dedicated warning/retry token" design
  decision, which per this project's `feedback_ui_design_input.md` standing
  guidance needs real user consultation (a Design or Planning pass), not a
  unilateral Maintenance pick - left open/deferred, not resolved.
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
- [2026-07-31] (stage: Retrospective, investigated further 2026-08-09 stage:
  Maintenance) `npx vitest run --coverage`'s printed report silently omits
  several source files that have real, passing test files -
  `AppLayout.tsx`, `LandingPage.tsx`, `App.tsx`, `TokenEntryForm.tsx`,
  `useTokenStore.ts`, `useTokenFromUrl.ts`, `useStatsForUser.ts`,
  `ingestClient.ts`, `buildIngestPayload.ts`, `tokenStorage.ts`,
  `colorTokens.ts`, and `constants.ts` never appear in the printed console
  table. **The original "multi-project merge" hypothesis is REFUTED**:
  running the SAME suite with only the jsdom project selected
  (`vitest run --project='!storybook*' --coverage`, no Storybook/browser
  project involved at all) reproduces the identical omission, so this is
  not about merging coverage across `test.projects`. **Root cause narrowed
  much further**: the omitted files' coverage data is genuinely present and
  correct - confirmed by parsing the run's own `coverage/coverage-final.json`
  directly (all files present with real, correct statement-hit counts, e.g.
  `colorTokens.ts` shows 2/2 statements hit) and by checking the HTML
  reporter's output (`coverage/frontend/src/components/AppLayout.tsx.html`
  etc. all exist with real per-line data). Feeding that exact
  `coverage-final.json` into a **standalone** `istanbul-lib-report` "pkg"
  tree-summarizer script (bypassing Vitest's live run entirely) correctly
  visits and would print all 46 files, proving `istanbul-lib-report`/
  `istanbul-reports`' `text` reporter is not inherently broken given a
  clean `CoverageMap`. That isolates the defect to something specific about
  Vitest's own **live, incrementally-built in-memory `CoverageMap`**
  (built via many sequential `.merge()` calls as each test file's V8
  coverage is converted and folded in during the run) producing a
  structurally different object than a fresh one loaded from the same
  serialized JSON - correct in aggregate (the printed "All files" summary
  row's percentages are computed by summing the coverage map directly and
  ARE accurate/trustworthy) but apparently confusing whatever tree-walk
  `onDetail`/`onSummary` visitation the live run's `context.getTree('pkg')`
  performs, silently dropping certain file nodes from the printed table
  without affecting the aggregate totals or the other reporters (html,
  json). This is a real, reproducible bug in `@vitest/coverage-v8`
  4.1.10's/`istanbul-lib-report`'s live-run reporting path, not a project
  misconfiguration - no clean in-repo fix available (would mean patching
  Vitest/istanbul internals, out of scope for an app-level fix). **Reliable
  workaround**: don't trust "file absent from the printed table" as "0%/
  uncovered" - cross-check `coverage/coverage-final.json` or open
  `coverage/index.html` (both confirmed complete and accurate for every
  file) instead of the console `text` table for true per-file numbers.
  The aggregate "All files" row IS trustworthy as printed (it already
  includes the omitted files' real data), so - contrary to the original
  entry's caution - it does NOT need to be treated as a lower bound; only
  the per-file breakdown view is unreliable.
- [2026-07-31] (stage: Testing, independently re-verified stage: main
  thread) `frontend/src/bookmarklet/fixtures/work-page-*.html` fixtures
  (backing `scrapeWorkPage.ts`/`scrapeWorkPage.test.ts`, work-page
  enrichment plan's task 5/13). Confirmed against AO3's real source
  (`otwcode/otwarchive`: `app/helpers/works_helper.rb`'s `work_meta_list`,
  `app/views/works/_meta.html.erb`, `app/helpers/series_helper.rb`'s
  `show_series_data`/`series_data_for_work`) and fixed accordingly: (1)
  Comments/Bookmarks rows are omitted entirely when their count is zero
  (`if count > 0` gates the whole `dt`/`dd` pair), not rendered as a bare
  "0" - load-bearing for the plan's NULL-vs-0 design goal, since a naive
  "read text from dd.comments" implementation would have misread "row
  absent because zero" as "not captured"; (2) only the Bookmarks row is
  ever wrapped in a link - Chapters/Comments/Kudos are always plain text;
  (3) the outer `dl.work.meta.group > dt.stats + dd.stats > dl.stats >
  (dt/dd pairs)` nesting is correct as originally modeled; (4) series
  markup was wrong and has been fixed:
  `dd.series > span.series > span.position > a` is the real structure (the
  series title link is nested inside `span.position`, not directly inside
  `span.series`, and AO3 never wraps the position number in `<strong>`) -
  critically, `span.series` can also contain sibling "Previous Work"/
  "Next Work" navigation links for any work that isn't first/last in that
  series, so `parseSeries`'s original `span.series a` selector would have
  incorrectly picked those up as series names for any real multi-work
  series membership. Fixed to `span.series span.position a`, with a
  regression test (`scrapeWorkPage.test.ts`, "excludes Previous Work/Next
  Work navigation links from the series names") and both affected fixtures
  corrected. ~~**Still open**: the exact `dt`/`dd` class-name conventions
  for each stat row (`dd.published`/`dd.status`/etc.) match general AO3
  knowledge and the confirmed helper source's field order, but haven't been
  visually diffed against a rendered live page - low risk given how much of
  the surrounding structure is now confirmed, but worth a final live check
  before Deployment per this project's established discipline (see the
  2026-07-31 stats-page fandom-nesting entry below for why this matters).~~
  — **RESOLVED 2026-08-09**: re-fetched `app/helpers/works_helper.rb`
  directly from `raw.githubusercontent.com/otwcode/otwarchive/master` and
  read `work_meta_list`'s literal `content_tag(:dt/:dd, ..., class:
  list_item.second)` calls line-by-line. Every class name
  `scrapeWorkPage.ts` expects is confirmed exactly as written in the real
  helper source: `"published"`, `"words"`, `"chapters"`, `"comments"`,
  `"kudos"`, `"bookmarks"`, `"hits"`, and `"status"` (inserted at index 1
  when `work.chaptered? && work.revised_at`). No code changes were needed -
  the original inference was correct.
- [2026-07-31] (stage: Testing, partially re-verified stage: main thread)
  `frontend/src/bookmarklet/fixtures/work-bookmarks-*.html` fixtures
  (backing `scrapeWorkBookmarks.ts`/`scrapeWorkBookmarks.test.ts`,
  work-page enrichment plan's task 6/13) model AO3's `/works/:id/bookmarks`
  listing - `ol.bookmark.index.group > li.bookmark` (outer wrapper
  **confirmed** correct against `app/views/bookmarks/index.html.erb`),
  `h5.byline.heading`, a `blockquote.userstuff` note, `h6.landmark.heading`
  + `ul.meta.tags.commas` for tags/collections, `p.datetime` for the
  bookmark date - these per-bookmark fields were cited by Discovery against
  `_bookmark_blurb.html.erb`/`_bookmark_user_module.html.erb` but not
  independently re-fetched by this later pass; treat as probably correct
  but not to the same confidence as the outer wrapper. ~~**EXTERNAL-UNVERIFIED
  and likely wrong**: the fixtures assume Kaminari-style
  `ol.pagination > li.next > a[rel="next"]` pagination, but
  `bookmarks/index.html.erb` actually calls `pagy_nav @pagy` (the **Pagy**
  gem, not Kaminari) - Pagy's default nav markup is not
  `ol.pagination`/`li.next`/`rel="next"`, though the exact real markup
  (default Pagy output vs. a possible AO3 template override) could not be
  located in this pass (GitHub code search requires auth; no `pagy.rb`
  initializer or custom nav template found at the paths checked). If the
  scraper's pagination-detection selector is wrong, the practical failure
  mode is graceful (treats every page as the last, so no data corruption -
  just misses later pages for a heavily-bookmarked work), but this must be
  confirmed against a live `/works/:id/bookmarks` page before trusting
  multi-page capture in production.~~ — **RESOLVED 2026-08-09**: confirmed
  wrong, and fixed. AO3's `Gemfile.lock` pins `pagy (9.3.3)`; fetched that
  exact tagged version's `gem/lib/pagy/frontend.rb` directly from
  `raw.githubusercontent.com/ddnexus/pagy/9.3.3` and read `pagy_nav`'s
  actual string-building code. Real output is
  `<nav class="pagy nav" aria-label="...">` containing a **flat sequence of
  sibling `<a>` tags with no `<ol>`/`<li>` wrapper and no `rel="next"`
  attribute anywhere** - confirmed AO3 doesn't override this template
  (`app/views/bookmarks/index.html.erb` calls bare `pagy_nav @pagy`) or the
  markup-affecting parts of its i18n (`config/locales/views/en.yml`
  overrides only the `next`/`prev` link *text* to "Next →"/"← Previous" and
  `aria_label.nav` to "Pagination" - never the tag structure, classes, or
  `aria-label="Next"`/`"Previous"` on the prev/next controls themselves,
  which stay at Pagy's own defaults). The nav's last child `<a>` is always
  the "next" control: a real `href`-bearing anchor when a next page exists,
  or an `href`-less `<a role="link" aria-disabled="true">` on the last page
  - `scrapeWorkBookmarks.ts`'s `parseHasNextPage` now checks for that
  structurally (last child of `nav.pagy.nav` has an `href`) rather than a
  `rel="next"` attribute that real AO3 markup never has, so the old
  selector matched zero elements and would have silently treated every
  work as single-page in production. Fixed with a regression test suite
  (`scrapeWorkBookmarks.test.ts`, "parseHasNextPage's structural detection
  (synthetic Pagy markup)", including an explicit case proving the old
  Kaminari-shaped markup now correctly reports `hasNextPage: false`) and
  all three paginated fixtures (`work-bookmarks-page1/2/3-last.html`)
  rebuilt to match confirmed real Pagy 9.3.3 output. The per-bookmark field
  markup (byline/note/tags/collections/datetime) remains unverified as
  before - only the pagination markup was in scope for this pass.
- [2026-08-01] (stage: Review) `POST /ingest/work` does not rescue
  `ActiveRecord::RecordInvalid`: a scraped payload that violates a `WorkStat`
  validation (negative count, or `chapters_expected < chapter_count`) makes
  `WorkDetailIngestService#update_work_stat!`/`create!` raise `RecordInvalid`,
  which `IngestController#create_work_detail` does not map, so the request
  returns HTTP 500 instead of a typed 422. Fan-out degrades acceptably
  (`postWorkDetail` maps 500 -> networkError -> work tallied as skipped; the
  per-work transaction rolls back so nothing partial is written) and AO3
  realistically never renders `chapters_expected < chapter_count` (it forces
  M>=N or "?"), so probability is low. Consider rescuing RecordInvalid ->
  InvalidPayload (422) for a clean, typed failure. Deferred: no user-facing
  impact given the graceful fan-out handling.
- [2026-08-01] (stage: Implementation, resolved 2026-08-09 stage: Maintenance)
  ~~`frontend/src/bookmarklet/fanOut.test.ts` exceeds CODE_STANDARDS.md's
  400-line `.ts` file-length guideline (was already at 422 lines pre-existing
  before this session's throttle/circuit-breaker fix; now 486 after adding
  three test cases for the Review-flagged fix in `fanOut.ts`). Not addressed
  here per "no unrelated refactoring" - splitting this spec file (e.g. by
  describe-block group) is a reasonable future cleanup but out of scope for a
  targeted bug fix. Flag for Review/Retrospective to decide whether to split
  by scenario group (throttle/circuit-breaker/safety-caps/banners) into
  sibling spec files.~~ - split into `fanOut.sequencing.test.ts`,
  `fanOut.circuitBreaker.test.ts`, `fanOut.safetyCaps.test.ts`, and
  `fanOut.banners.test.ts` (exactly the scenario groups this entry
  suggested), with shared fixtures/mocks extracted into
  `fanOutTestSupport.ts`. All 16 original tests preserved (16/16 green
  across the 4 files).
- [2026-08-01] (stage: Review) `work_bookmarks.note_html` is stored verbatim
  as the raw `innerHTML` scraped from AO3's bookmark-note blockquote
  (`scrapeWorkBookmarks.ts#parseNoteHtml`) with no sanitization on ingest;
  it is exposed via GraphQL `WorkBookmarkType.note_html` and currently
  rendered nowhere (notes-list UI deferred, plan section 8). No active XSS
  today. AO3 server-sanitizes the note before it reaches the DOM, but relying
  on AO3's sanitizer for our own render context is fragile. Two mitigations:
  (a) MANDATORY when the deferred notes-list UI is built - sanitize on render
  (DOMPurify or equivalent), already flagged in plan section 8; (b)
  defense-in-depth - sanitize/allowlist on ingest so any future consumer
  (not just the planned UI) inherits a safe value. Deferred: (a) belongs to
  the future UI pass, (b) is a nice-to-have hardening.
- [2026-08-02] (stage: Implementation) Broadened curl/non-browser overwrite
  surface (`docs/plans/memorable-token-and-recovery.md` section 9/Q4): the
  always-accept-and-reset model on `/ingest`, `/ingest/work`, and the new
  `/ingest/token` means a non-browser client (not bound by CORS) can now
  overwrite a *claimed* username's token/snapshot, not just claim an
  unclaimed one - a direct, user-confirmed entailment of decision 2 (a
  successful stats-page capture is itself proof of ownership), not a new
  decision made during Implementation. Genuine widening of the existing,
  separately-accepted Tier-3 "personal tool, CORS-gates-browsers" posture.
  Candidate mitigations (not built): a Rack::Attack throttle on `/ingest*`;
  binding a claim to something only the real author can produce. Deferred:
  explicitly signed off by the user during Planning; not closed here.
- [2026-08-02] (stage: Implementation) Token entropy (~16.5 bits) as the
  read path's only remaining secret strength (`docs/plans/memorable-token-
  and-recovery.md` section 9/Q1): 300 words, two distinct ordered picks =
  89,700 combinations. Deliberately weak as a *secret* per the user's
  explicit memorability choice - under decision 2 the capture path's
  security no longer rests on token unguessability, so the token's
  remaining job is gating `statsForUser` (GraphQL read path, unchanged/
  still enforced). ~16 bits gates read access to a personal stats dashboard
  if an attacker also knows the exact AO3 username. Candidate mitigation
  (not built): a `statsForUser`/`/ingest` rate limit. Deferred: accepted at
  personal-tool scale, explicitly signed off by the user during Planning.
- [2026-08-02] (stage: Review) The read_token index-drop migration
  (backend/db/migrate/..._remove_unique_index_from_ao3_users_read_token.rb)
  uses `remove_index :ao3_users, name: "..."` inside `change`; with no column
  given, Rails cannot recreate the index on rollback, so `rails db:rollback`
  raises `ActiveRecord::IrreversibleMigration`. Forward deploy is unaffected.
  Deferred: matches the plan verbatim and rolling back a dropped index is
  unlikely; would be tidier as explicit `up`/`down` or with the column named.
- [2026-08-02] (stage: Review) `generateTokenSuggestion` (frontend/src/
  bookmarklet/tokenSuggestion.ts) uses unbounded reject-and-retry to enforce
  distinct words; a pathological injected `rng` that returns a constant would
  loop forever. Not reachable via the `Math.random` default in production
  (measure-zero); only an adversarial/buggy injected rng. Deferred: cosmetic
  robustness only.
- ~~[2026-08-02] (stage: Review) `InstallPage.tsx`'s open-source disclosure
  link fails WCAG 1.4.1 (link-in-text-block): `text-accent` on
  `text-ink-soft` is only 1.59:1 (needs 3:1), no persistent non-color
  style.~~ — **RESOLVED 2026-08-09** (together with the 2026-08-05
  duplicate finding below - same bug, one fix).
- [2026-08-03] (stage: Implementation) `groupWorksByFandom` (per-work
  comparison graph feature, `docs/plans/per-work-comparison-graph.md`)
  splits the `fandoms` field on `", "` to recover the fandom list for
  `WorkPicker`'s grouped checkbox UI, since the backend exposes `fandoms`
  as a single comma-joined `String`, not a list
  (`backend/app/services/snapshot_ingest_service.rb:129`). This is lossy:
  a fandom *name* that itself literally contains `", "` is indistinguishable
  from two fandoms joined by the delimiter, and splits into two
  pseudo-fandom groups (`groupWorksByFandom.test.ts` pins this as accepted,
  current behavior, not a bug to silently fix). Harmless in practice - the
  work is still listed and selectable under both fragments; worst case is
  an extra, slightly-wrong-looking group heading. Accepted limitation, not
  a backend change here - the proper fix is storing fandoms as an
  array/jsonb column on `Work`, a data-model change explicitly deferred by
  the plan as out of scope for this feature.
- [2026-08-03] (stage: Review, resolved 2026-08-03 stage: Implementation)
  ~~`WorkComparisonSection.tsx`'s date `range` state was only reset when the
  selection dropped below the `>2` union-points gate, never reconciled to
  the live slider `domain` when the domain shifted while staying above the
  gate, so a stale narrowed window could silently exclude a newly-selected
  work's points~~ — fixed: `buildSeries`/`sliderValue` now derive an
  `effectiveRange` that re-clamps `range` against the *live* `domain` on
  every render (falling back to the full domain when the stored window no
  longer overlaps the domain at all, rather than collapsing to a
  degenerate single-point clamp), matching the plan's Error-states
  invariant. Regression test:
  `WorkComparisonSection.test.tsx` > "stale range window across a selection
  swap (regression)".
- ~~[2026-08-03] (stage: Review) `WorkComparisonSection.tsx`'s `role="status"`
  summary announcement derives its year span from the full unfiltered
  `unionDates`, not the currently-applied slider window - narrowing the
  range doesn't change what's announced.~~ — **RESOLVED 2026-08-09**:
  resolved in favor of parity with the visible charts - the summary now
  reports `effectiveRange` (the active windowed range) when one is applied,
  else falls back to the full `unionDates` span as before. Regression test
  in `WorkComparisonSection.regression.test.tsx`.
- ~~[2026-08-03] (stage: Review) `frontend/src/lib/markerShapes.tsx` trips a
  single ESLint `react-refresh/only-export-components` *warning* (not error):
  it exports both a component (`MarkerGlyph`) and a plain helper
  (`renderMarkerShape`) from one file.~~ — **RESOLVED**: `renderMarkerShape`
  (and its geometry helpers) extracted into `markerPaths.tsx`;
  `markerShapes.tsx` now exports only `MarkerGlyph`. Fixed by commit
  `3d4eab1` in the 2026-08-09 Maintenance batch; this entry was never struck
  through despite the fix landing in-range, caught while answering a
  "what's still open" question (2026-08-29).
- [2026-08-03] (stage: Maintenance) **Resolved, but the root cause is a
  process gap worth recording.** `npm run build` failed with 12 real
  TypeScript errors (6 in `DateRangeSlider.stories.tsx`/`WorkPicker.stories.tsx` -
  Storybook's CSF3 `Story` type requires `args` whenever a component has
  required props, even when a custom `render` supplies its own local
  `useState` and never reads `args`; 6 in `seriesStyles.test.ts` - a fixture
  typed as the full `SeriesStyleSlot[]` was missing `dashLabel`, a field
  Implementation added to the real interface after Testing wrote this local
  fixture, for a `toMatchObject` partial-match test that never needed the
  full shape). Both classes fixed: the two stories files now supply a
  static `args` object alongside `render` (matching each render's initial
  values); the test fixture's type annotation changed to
  `Partial<SeriesStyleSlot>[]`, matching what `toMatchObject` actually
  checks.

  **The root cause every "tsc clean" check this project ran throughout the
  per-work-comparison-graph feature (Testing, Implementation, Review, and
  the main thread's own verification) missed these entirely - confirmed via
  `git stash` that `npx tsc --noEmit -p .` reports 0 errors against the
  exact same broken files that `npm run build` correctly fails on with 12.**
  `tsconfig.json` at the repo root is a solution-style file
  (`"files": [], "references": [...]`) - `tsc -p .` in plain `--noEmit` mode
  does not traverse into referenced projects (`tsconfig.app.json`,
  `tsconfig.node.json`); only `tsc -b` (build mode, what `npm run build`
  actually runs) does. So `npx tsc --noEmit -p .` has been a **false-green
  no-op** the entire time it was used as this project's ad hoc typecheck
  verification step - the same "check runs, returns exit 0, but isn't
  actually checking what it claims to" shape as the `staticSites:` and
  fandom-nesting false-greens logged earlier in this file. Going forward,
  use `npx tsc -b` (or just `npm run build`) for any ad hoc frontend
  typecheck verification, never bare `tsc --noEmit -p .` - this project's
  own CI (`.github/workflows/ci.yml`) already runs the real `npm run build`
  step, so CI itself was never fooled by this; only ad hoc local/agent
  verification was.
- [2026-08-03] (stage: Maintenance) ~~`frontend/src/bookmarklet/banners.test.ts`
  exceeds CODE_STANDARDS.md's 400-line `.ts` file-length guideline (was
  already at 608 lines pre-existing before this session's banner-stacking-
  wrapper feature; now 668 after adding a "banner stacking wrapper" describe
  block). Not addressed here per "no unrelated refactoring" - splitting this
  spec file (e.g. by banner-type describe-block group, mirroring the
  fanOut.test.ts entry above) is a reasonable future cleanup but out of
  scope for a targeted styling/feature change. Flag for Review/Retrospective
  to decide whether to split.~~ - **RESOLVED 2026-08-09 (stage: Maintenance)**:
  split by banner-type describe-block group, mirroring `fanOut.test.ts`'s own
  split. `banners.success.test.ts` (renderSuccessBanner + its "Save token"
  sub-flow + visual treatment, 369 lines), `banners.states.test.ts`
  (renderFailureBanner/renderInfoBanner/renderRetryBanner/
  renderUnauthorizedBanner, 141 lines), `banners.progress.test.ts`
  (renderProgressBanner/updateProgressBanner/renderSummaryBanner, 133 lines);
  `banners.test.ts` itself now holds only the genuinely cross-cutting
  describe blocks that span multiple banner types (shared readability
  styling, the shared stacking wrapper, `removeBannerStack`), trimmed to 160
  lines. All four now clear the 400-line budget; full suite still 47/47
  green across the split.
- [2026-07-23] (stage: Review, resolved 2026-08-03 stage: Maintenance)
  ~~Success-banner Copy button (082b38e) became an icon glyph ("⧉") whose
  only label is a `title="Copy"` attribute. For a `<button>`, accessible-name
  computation prefers text content (the glyph) over `title`, so screen
  readers announce the meaningless symbol, not "Copy" - an a11y regression
  from the prior text label in a codebase that otherwise invests in a11y
  (roles, aria-live, @axe-core). Fix: add `aria-label="Copy"` (and set it to
  "Copied!" alongside the title on click). Same applies to the transient "☑"
  copied state. Not blocking anything live, but a real follow-up.~~ - fixed:
  `successBannerTokenField.ts`'s Copy button now sets `aria-label="Copy"`
  alongside `title="Copy"`, updated to `aria-label="Copied!"` alongside
  `title="Copied!"` in the click handler.
- [2026-08-04] (stage: Testing) EXTERNAL-UNVERIFIED: `frontend/src/lib/
  colorTokens.cvd.test.ts`'s three CVD simulation matrices (protanopia/
  deuteranopia/tritanopia, applied to linear sRGB) are a good-faith
  transcription of the commonly-published Machado, Oliveira & Fernandes
  (2009) full-severity dichromacy matrices, not independently re-verified
  against the original paper or Chromium's "Emulate vision deficiencies"
  source in this pass - this environment has no live web access to do that
  byte-for-byte check. The plan's own >=3.0 ΔE floor has comfortable
  headroom against its measured worst case (3.7-3.8), so small coefficient
  drift is unlikely to flip a pass/fail verdict, but this should be
  confirmed against a primary source (the paper's supplementary matrices,
  or a maintained reference implementation) before treating the automated
  CVD gate as fully authoritative.
- [2026-08-04] (stage: Testing) `docs/testing/usds-shape-distinguishability-
  pass.md` (Testing task 11) verified the 10-shape marker *strategy* via a
  standalone illustrative SVG rendering script
  (`docs/testing/assets/usds-shape-distinguishability/generate-shapes.mjs`),
  not the real `markerShapes.tsx` component (which doesn't exist with the 4
  new shapes yet, since Testing precedes Implementation). Its geometry for
  triangle-down/cross/circle-hollow/square-hollow is a reasonable, but not
  binding, illustration - Implementation is free to choose different exact
  coordinates in `markerShapes.tsx` as long as the 10 shapes stay distinct.
  Once Implementation lands the real component, its manual DevTools
  CVD/grayscale pass (plan Implementation task 9) should re-confirm
  distinguishability against the actual rendered shapes, not just rely on
  this pre-Implementation illustrative pass.
- [2026-07-23] (stage: Review, resolved 2026-08-03 stage: Maintenance)
  ~~The banners.test.ts assertions for the Copy button were changed
  (082b38e) to look it up by `getAttribute("title")` rather than an
  accessible name. `title` is not the accessible name, so the test now
  passes while the button's actual AT-exposed name is a glyph - masking the
  regression above rather than catching it. When the a11y fix lands, assert
  on the accessible name (aria-label) instead.~~ - fixed: the 3 affected
  tests in `banners.test.ts` ("provides a keyboard-operable Copy button",
  "copies the CURRENT input value...", "confirms the copy visibly...") now
  look up and assert on `getAttribute("aria-label")` instead of `title`;
  confirmed they failed against the unfixed source before the aria-label
  fix landed.
- [2026-07-23] (stage: Review) ~~Re-injection cleanup gap, pre-existing but
  mildly worsened by the shared banner stack (0547df9). `window.__ao3StatsPlus.banner`
  only ever tracks the single last banner passed through `setGuardBanner`;
  fan-out's progress/summary banners are never tracked, so on re-injection
  `existing.banner?.remove()` removes only the tracked banner and never the
  shared stack wrapper - leaving any in-flight progress/summary banner plus a
  now-empty `[data-ao3-stats-plus-banner-stack]` div lingering in document.body.
  Visible outcome is not materially worse than before (orphaned fan-out
  banners were always left behind), but consider removing the whole stack on
  re-injection cleanup.~~ - **RESOLVED 2026-08-09 (stage: Maintenance)**:
  added `banners.ts`'s `removeBannerStack(container)`, which queries and
  removes the whole `[data-ao3-stats-plus-banner-stack]` wrapper element (not
  just the single tracked banner); `entrypoint.ts`'s re-injection guard now
  calls it alongside the pre-existing `existing.banner?.remove()` (kept as a
  no-op-safe belt-and-suspenders). Regression tests added: `banners.test.ts`
  ("removeBannerStack" describe block, unit-tests the helper directly) and
  `entrypoint.test.ts` ("also removes the whole shared banner-stack wrapper
  on re-injection..."), both confirmed red against the unfixed code before
  the fix, green after.
- [2026-07-23] (stage: Review) ~~The `inputButton` helper (082b38e) omits any
  padding (unlike `primaryButtonStyle`), so the icon Copy button's hit target
  is only as large as the glyph at 1rem. Minor; worth a visual check that the
  target is comfortably tappable on touch.~~ - **RESOLVED 2026-08-09 (stage:
  Maintenance)**: `bannerStyles.ts`'s `inputButton` now sets explicit
  `min-width:2.75rem;min-height:2.75rem;` (44px at this codebase's 16px rem
  base - the common WCAG/mobile touch-target minimum) plus `padding:0.625rem;`
  and `display:inline-flex;align-items:center;justify-content:center;` so the
  glyph stays centered within the now-larger box, rather than pinned to a
  corner. min-width/min-height (not padding alone) were used since a
  lone-glyph button has no text to naturally pad the box out to size.
  MASTER.md has no existing touch-target guidance to cross-check against (none
  found), so no snapshot update needed. Tests added:
  `bannerStyles.test.ts` (unit-tests the helper's cssText directly) and a new
  case in `banners.success.test.ts` (asserts the actual rendered Copy
  button's min-width/min-height, not just the style helper in isolation).
- [2026-08-04] (stage: Review) Exporting `buildChartData` from
  `MultiSeriesTrendChart.tsx` (previously an internal helper) newly trips the
  `react-refresh/only-export-components` ESLint warning on that file (0 errors,
  warning only; HMR fast-refresh degraded for the file in dev). The
  zero-basis-dates final commit described both remaining warnings as
  "pre-existing-pattern, unchanged" - accurate for `markerShapes.tsx` but this
  MultiSeriesTrendChart instance is genuinely new. Non-blocking; the plan
  explicitly chose to export the pure helper for unit-testability. Consider
  extracting `buildChartData` into its own module (mirroring
  `lib/comparisonSelection.ts`, the codebase's existing convention for
  directly-tested pure transforms) to clear the warning and match that pattern.
- ~~[2026-08-04] (stage: Implementation) `frontend/src/lib/useChartColors.test.ts`'s
  "ColorTokens.series (multi-series categorical palette)" describe block
  hardcodes literal pins of the *old* 6-hex `series` palette
  (`docs/plans/per-work-comparison-graph.md`'s decision A) and was not among
  the files Testing updated for `docs/plans/usds-dataviz-color-scheme.md`
  (confirmed via `git log` - its last touch predates this feature's 6
  Testing-stage commits). It now fails 5/5 tests against the finalized,
  approved 10-slot palette actually shipped in `colorTokens.ts` (verified
  correct by the new, canonical `colorTokens.test.ts`/`colorTokens.cvd.test.ts`,
  which this Implementation pass made green). Per this stage's standing
  instruction not to edit tests to make them pass, this file was left
  untouched and flagged instead: needs its hardcoded `LIGHT_SERIES_HEXES`/
  `DARK_SERIES_HEXES` arrays (and the `toHaveLength(6)` assertions) updated
  to the new 10-hex plan values, or the whole duplicate-pinning describe
  block removed now that `colorTokens.test.ts` owns that coverage - a call
  for Testing/Review, not Implementation.~~ **RESOLVED 2026-08-04:** updated
  `LIGHT_SERIES_HEXES`/`DARK_SERIES_HEXES` and the two `toHaveLength`
  assertions to the real 10-hex values (verified directly against
  `colorTokens.ts`), rather than deleting the block - it still adds value as
  an independent cross-check against `colorTokens.test.ts`/
  `colorTokens.cvd.test.ts`, not pure duplication. All 573 tests green.
- [2026-08-04] (stage: Review) **RESOLVED — EXTERNAL-UNVERIFIED CVD matrices
  verified against primary source.** The three Machado-2009 CVD simulation
  matrices hardcoded in `frontend/src/lib/colorTokens.cvd.test.ts` (protanopia/
  deuteranopia/tritanopia) were independently re-verified this pass against the
  paper authors' own primary-source page (Manuel M. Oliveira, UFRGS:
  `https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html`,
  Machado, Oliveira & Fernandes 2009). All 27 coefficients across the three
  severity-1.0 (full-dichromacy) matrices match byte-for-byte. The linear-RGB
  application order used in the repo (sRGB→linear→matrix→sRGB) was also
  confirmed correct against DaltonLens' reference implementation, which
  documents these matrices as operating on linear RGB. The `EXTERNAL-UNVERIFIED`
  assumption is discharged. NOTE: the code comment in `colorTokens.cvd.test.ts`
  (lines 18-29) still carries the un-discharged `EXTERNAL-UNVERIFIED` caveat
  wording — Implementation should update that comment to reflect this
  verification (Review is read-only on the code under review, so it was not
  edited here).
- ~~[2026-08-04] (stage: Review) Documented CVD ΔE headroom is overstated vs. the
  actual shipped palette.~~ — **superseded 2026-08-06**: the series palette this
  entry was about (wine/orange/amber/...) was fully replaced by the
  post-retrospective color re-review (Muted Archive/Halfway, see MASTER.md's
  "Multi-Series Comparison Charts" section and `docs/plans/usds-dataviz-color-scheme.md`'s
  2026-08-06 addendum). The new palette's worst-case floor was computed the same
  way (7.9 light / 8.0 dark, both well clear of 3.0) and documented directly from
  that computation rather than estimated, so the original "documentation trails
  reality" risk this entry flagged doesn't recur here — no action needed.
- ~~[2026-08-04] (stage: Review) Stale explanatory comment in
  `frontend/src/lib/useChartColors.test.ts`.~~ — **resolved 2026-08-06**: the
  comment and pinned hex arrays were rewritten as part of the same-day palette
  re-review (Muted Archive/Halfway) and now correctly describe the current
  10-slot role order.
- [2026-08-09] ~~Remove worded description from legend.~~ - resolved 2026-08-09
  (stage: Maintenance): `ComparisonLegend.tsx` no longer renders the worded
  "{colorRole} {shape} marker" text next to each work's title - it now shows
  only the glyph and title. Checked and preserved the accessible/screen-reader
  surface this text was the sole source for: `MultiSeriesTrendChart.tsx`'s
  pre-existing sr-only accessible data table now carries the wording instead
  (column headers extended from `"<title>"` to `"<title> — <colorRole> <shape>
  marker"`), so the (shape, color) identity mapping still reaches assistive
  tech, just via that surface instead of a visible, sighted-only duplicate.
  MASTER.md's Multi-Series Comparison Charts section updated to match. Tests
  updated in `ComparisonLegend.test.tsx`, `MultiSeriesTrendChart.test.tsx`,
  `WorkComparisonSection.bookmarksByWork.test.tsx`, and
  `WorkComparisonSection.persistence.test.tsx`; full suite green (746/746).
- ~~[2026-08-05] (stage: Maintenance) `InstallPage`'s "GitHub" link fails
  `accessibility.spec.ts`'s axe scan: `fgContrast` 1.59:1 (needs 3:1) plus
  no non-color distinguishing style. Reproduces across chromium/firefox/
  webkit - not the WebKit-only flake above.~~ — **RESOLVED 2026-08-09**:
  gave the link a persistent underline instead of adjusting `--color-accent`
  (darkening it enough to clear 3:1 would drift the shared accent token used
  for CTAs/focus rings/the chart marker - dark mode is worse anyway, 1.10:1
  - and WCAG 1.4.1 accepts either technique). Confirmed via
  `accessibility.spec.ts` (chromium/firefox green); WebKit's remaining
  failure is the unrelated 2026-07-30 `bg-ink`/`text-paper` flake. No
  MASTER.md token change needed.
- [2026-08-05] (stage: Maintenance, re-checked 2026-08-09 stage: Maintenance)
  ~~`frontend/src/components/WorkPicker.tsx` is 579 lines, over
  CODE_STANDARDS.md's 500-line `.tsx` budget - grew during the
  work-comparison-picker-redesign feature (MUI Autocomplete rebuild + the
  bulk-select-bar-as-listbox-sibling accessibility fix, see
  `docs/plans/work-comparison-picker-redesign.md`). Not split here per "no
  unrelated refactoring" during a targeted feature; a reasonable split would be
  extracting the hand-rolled icon components (`CloseIcon`/`CheckIcon`/`TriStateIcon`)
  and/or the `BulkSelectPaper`/`renderBulkSelectBar` pairing into their own
  module(s). Flag for Review/Retrospective to decide.~~ - re-checked: the file
  is now 497 lines (under budget), having shrunk via unrelated intervening
  changes since 2026-08-05. No split needed at this time; the suggested
  extraction (icon components / BulkSelectPaper pairing) remains a reasonable
  option if it grows past 500 again.
- [2026-08-05] (stage: Review) `WorkComparisonSection.tsx` mutates the external
  `useWorkComparisonStore` during the render phase in two places: the
  `styleAssignment` lazy `useState` initializer calls `store.setSelection(...)`
  when reconciliation changes the restored ids (line ~159), and the render body
  calls `setRangeInStore(username, null)` in the gate-drop reset when the slider
  disappears (line ~188). Both are the "adjust state during render" pattern that
  React sanctions for its OWN `useState` setters (where a discarded render also
  discards the queued update), but zustand's `set` is a real external mutation
  that a discarded/concurrent render cannot undo, and it synchronously notifies
  every store subscriber. Today only `WorkComparisonSection` subscribes and the
  writes are idempotent/self-terminating, so it is green across 617 unit tests +
  the 24-test 3-browser combobox e2e subset and no cross-component "cannot update
  while rendering" warning fires. But once the deferred bookmarks/comments/
  subscriptions feature also subscribes to this store (the whole point of §2.1's
  shared contract), a render-phase write here could schedule an update into that
  other component mid-render. Safer: move the gate-drop `setRange(null)` into a
  `useEffect`, and do the mount-time reconciliation write in an effect (or accept
  the store already exposing the reconciled value). Deferred from Review — not a
  reproducible defect today, flagged for the metrics-feature work / Retrospective.
- [2026-08-05] (stage: Implementation, resolved 2026-08-05 stage: Maintenance)
  ~~Two tests in `frontend/tests/accessibility.pickerRefinements.spec.ts` fail
  against a correct implementation of
  `docs/plans/work-comparison-picker-refinements.md` §1 (the synthetic
  tracked `role="option"` header), for two distinct test-authoring reasons
  rather than an app defect - not fixed here per "don't modify tests to make
  them pass," flagged for Testing/Planning to revisit instead: (1) "the works
  combobox's accessible name comes from the static label..." calls
  `page.goto("/u/testauthor")` with no token and no `mockStatsForUser` -
  `DashboardPage.tsx`'s no-token state renders `TokenEntryForm`, not
  `WorkComparisonSection`, so the combobox never exists on that page at all,
  regardless of implementation; needs a `?token=` + `mockStatsForUser` call
  like every sibling test in the file. (2) "the fandom-header option is
  reachable via ArrowDown from a freshly opened popup..." assumes a
  freshly-opened popup's roving highlight starts at -1 (so one ArrowDown
  reaches the first tracked option, the header) - true only when NO option is
  yet selected. `WorkComparisonSection` always auto-selects the first work on
  mount, so in the real app (and this test's own `MULTI_WORK_STATS_RESPONSE`
  fixture) a value always already exists when the popup opens; MUI's own
  `useAutocomplete.js` `syncHighlightedIndex` pre-highlights the option
  matching `value[0]` on open in that case (not -1), so one ArrowDown lands
  one option past the pre-selected work, not on the header. Manually verified
  live (Playwright, chromium) that the header IS still genuinely
  keyboard-reachable and Enter-operable in this exact scenario - just via one
  ArrowUp from the pre-highlighted selection, not one ArrowDown from an
  assumed-empty highlight - confirming §1.1's underlying tracked-option/
  keyboard-parity finding still holds; only the test's specific "first
  ArrowDown" framing is wrong. Fix: rewrite the assertion to either deselect
  first, or navigate via ArrowUp/repeated ArrowDown+wraparound to actually
  reach the header from the pre-selected highlight, matching real app
  state.~~ - already fixed by commit `116469d` ("test: fix two test-authoring
  defects Implementation flagged, not fixed") but this entry was never marked
  resolved; confirmed during this Maintenance pass that both tests pass as
  written (10/10 green in `accessibility.pickerRefinements.spec.ts`,
  chromium) with no further code changes needed.
- [2026-08-08] (stage: Testing, resolved 2026-08-09 stage: Maintenance)
  ~~`frontend/tests/dashboard-populated.spec.ts` has two pre-existing,
  already-broken tests found incidentally while extending this file for
  docs/plans/additional-metric-trend-charts.md (T-T8): "renders the per-work
  comparison chart with a grouped checkbox picker" and "shows the
  dashed-lead-in caption once a selected work has a zero-basis leadIn" both
  query `getByRole("checkbox", { name: "Work A" })`, which no longer exists -
  `docs/plans/work-comparison-picker-redesign.md` replaced the
  grouped-checkbox `WorkPicker` with an Autocomplete combobox + removable
  chips (confirmed already-broken against `main` via `git stash` before any
  of this session's changes, so not a regression introduced here). Out of
  scope for this feature plan (frontend-only chart additions, not the
  picker) - left unfixed. Fix: update both to the combobox interaction
  pattern already used elsewhere in this file/accessibility.spec.ts (e.g.
  `getByLabel("Remove Work A")` for presence, and select via the combobox
  rather than a checkbox).~~ - fixed: both tests now assert via
  `getByLabel("Remove Work A")` (the chip's delete-icon accessible name)
  instead of the removed checkbox role; the first test also swapped its
  `role="group"` assertion for the combobox role and dropped the stale
  "old combobox not visible" assertion (that was checking the OLD dropdown
  was gone, but the picker itself is a combobox now). Both pass (9/9 other
  tests in the file also green; one unrelated pre-existing failure - "By
  Work sub-tab is axe-clean" hits a strict-mode `getByRole("img", {name:
  "Work A"})` collision with the "Remove Work A" chip's own `role="img"`
  delete icon, reproduced identically on `main` before this fix, logged
  separately below rather than fixed here as it's outside this item's scope).
- [2026-08-08] (stage: Implementation) `RatioChart.tsx` (plus its own
  `RatioChart.test.tsx`/`RatioChart.stories.tsx`), and the `kudosToHitsRatio`
  GraphQL field (both the aggregate-series field and the top-level
  `statsForUser.kudosToHitsRatio` field, still selected by
  `STATS_FOR_USER_QUERY`), are now unreferenced by rendered UI after the
  Kudos-to-hits ratio chart was removed from `DashboardPage` per
  docs/plans/additional-metric-trend-charts.md §3.0.1 (user-requested -
  Option B's metric toggle has no slot for a derived 0-1 proportion on a
  different scale/chart type). Kept deliberately, not deleted, for possible
  future reuse - flagged here so it isn't mistaken for a live feature nor
  silently deleted as dead code later. Future cleanup could drop the
  `kudosToHitsRatio` selections from `STATS_FOR_USER_QUERY` if the ratio
  view isn't reinstated.
- [2026-08-09] (stage: Review) ~~`PerWorkPoint`'s `comments`/`bookmarks`/
  `subscriptions` and `AggregateSeriesPoint`'s `totalUserSubscriptions` are
  typed OPTIONAL in `frontend/src/queries/useStatsForUser.ts`, deviating from
  docs/plans/additional-metric-trend-charts.md §7's explicit recommendation to
  make the always-present (backend non-null) fields REQUIRED and churn the
  fixtures. Testing's §4 discretion covers the choice and it's behaviorally
  safe (the query always selects them, so the `?? 0` / `?? null` fallbacks at
  `perWorkMetrics.ts` and `DashboardPage.tsx` never actually fire), but the
  interface is now less faithful to the non-null backend contract than the
  plan intended, and the fallbacks are effectively dead defensive code. Note:
  the asymmetry the Consultation Check flagged (aggregate optional vs per-work
  required) does NOT exist in the shipped code — all four fields are uniformly
  optional, so the code is internally consistent. Future cleanup could tighten
  all four to required once the fixture churn is worth doing.~~ - **RESOLVED
  2026-08-09 (stage: Maintenance)**: all four fields tightened to required in
  `useStatsForUser.ts` (`PerWorkPoint.comments`/`bookmarks`/`subscriptions`,
  `AggregateSeriesPoint.totalUserSubscriptions`); `publicBookmarks`/
  `privateBookmarks` deliberately left optional+nullable (genuinely absent at
  the backend pre-enrichment, unlike the other four). Removed the now-dead
  `?? 0`/`?? null` fallbacks at their call sites in `perWorkMetrics.ts`
  (`PER_WORK_METRICS`'s comments/subscriptions `valueOf`s,
  `BOOKMARK_TYPES`'s Total `valueOf`) and `DashboardPage.tsx` (the
  Subscribers tab's `totalUserSubscriptions` mapping). Did the full fixture
  churn `npx tsc -b` demanded (90 errors -> 0) across
  `WorkComparisonSection.test.tsx`/`.leadIn.test.tsx`/`.caption.test.tsx`/
  `.persistence.test.tsx`/`.regression.test.tsx`/`.stories.tsx`,
  `DashboardPage.test.tsx`, and `comparisonSelection.test.ts` - mostly a
  scripted regex pass (`hits: N, kudos: N }` -> add
  `comments: 0, bookmarks: 0, subscriptions: 0`; similarly for
  `totalUserSubscriptions: 0` on `AggregateSeriesPoint` literals), plus a
  handful of hand-fixed non-literal-number cases and one genuine
  duplicate-type cleanup (`DashboardPage.test.tsx`'s
  `mockWithEarliestPostYear` had its own local, narrower `perWorkSeries`
  point type that had silently drifted out of sync with the real
  `PerWorkPoint` - replaced with the real `PerWorkSeries` type directly so it
  can't drift again).
  `WorkComparisonSection.regression.test.tsx`'s fixture update for this same
  tightening landed in a separate commit (`e0c2767`). Full suite green
  (755/755), `npx tsc -b` clean, `npx eslint .` clean (0 errors).
- ~~[2026-08-09] (stage: Review) Two superfluous
  `// eslint-disable-next-line no-await-in-loop` directives flagged as unused
  warnings by `npx eslint .` — `WorkComparisonSection.metrics.test.tsx:202`
  and `DashboardPage.test.tsx:208`.~~ — **RESOLVED**: both removed by commit
  `3d4eab1`; this entry was never struck through despite the fix landing
  in-range, caught during the post-batch independent Review pass
  (2026-08-12).
- [2026-08-09] (stage: Maintenance) `frontend/tests/dashboard-populated.spec.ts`'s
  "switching Bookmarks to the By Work sub-tab is axe-clean" test fails with a
  Playwright strict-mode violation: `getByRole("img", { name: "Work A" })`
  resolves to two elements - the By-Work chart's `figure[role="img"]` (real
  target) AND the works-to-compare picker's "Remove Work A" chip delete icon
  (`svg[role="img"][aria-label="Remove Work A"]`), since Playwright's default
  substring name matching treats "Work A" as matching "Remove Work A" too.
  Confirmed pre-existing (reproduces identically on `main` before this
  session's changes via `git stash`), found incidentally while fixing the
  two `getByRole("checkbox", ...)` tests in the same file (2026-08-08 entry
  above). Not fixed here - out of scope for that item. Fix: scope the
  locator more precisely, e.g. `getByRole("img", { name: "Work A", exact:
  true })` or scope to the By-Work chart container.
- ~~[2026-08-09] (stage: Review) `MetricToggle.tsx`'s `role="tab"` buttons omit
  `aria-controls` pointing at their owned `tabpanel`.~~ — **RESOLVED
  2026-08-09**: tabpanel now has a stable `id`; every tab's `aria-controls`
  points at it. Test added in `MetricToggle.test.tsx`.
- [2026-08-12] (stage: Review) The 2026-08-09 required-field fixture churn
  (`dc76f8e`) pushed two test files past CODE_STANDARDS.md's 500-line `.tsx`
  budget: `frontend/src/components/WorkComparisonSection.test.tsx` (466 -> 596)
  and `frontend/src/routes/DashboardPage.test.tsx` (483 -> 588). Separately,
  `frontend/src/bookmarklet/entrypoint.test.ts` (523 -> 553) remains over the
  400-line `.ts` budget (pre-existing, +30 this batch). Non-blocking (a
  file-length signal to split, not a rejection), and somewhat ironic given the
  same batch split `fanOut.test.ts`/`banners.test.ts` for exactly this reason.
  Candidate split: by describe-block group, mirroring the fanOut/banners
  splits this batch already did.
- [2026-09-12] (stage: main thread) **Feature idea, not yet scoped**: replace
  the current hover-tooltip/popover interaction on the trend/comparison charts
  (`TrendChart`, `RatioChart`, `MultiSeriesTrendChart`, and the
  `WorkComparisonSection` per-work charts) with a horizontally scrollable data
  table rendered below each figure, listing the metric's numeric values across
  time points. The two views should stay in sync in both directions: hovering
  a point on the chart highlights the corresponding column in the table, and
  hovering a column in the table highlights the corresponding point on the
  chart. Motivation (user's words): the current popover is "a huge popover" -
  this is meant to shrink the on-hover footprint and make it easier to read
  exact values across multiple series at once. Deferred rather than
  implemented directly: this touches shared chart-rendering behavior across
  several components and the project's design-context snapshot
  (`design-system/ao3-stats-plus/MASTER.md`), so it should go through Planning
  (with the user's UI/UX preferences solicited up front, not assumed) before
  Testing/Implementation - not a quick Maintenance-style tweak. Open questions
  for that Planning pass: does the table replace the tooltip entirely or
  supplement it; does it apply to every chart component uniformly or only the
  multi-series ones where cross-series comparison is the actual pain point;
  keyboard/touch equivalent for the hover-sync interaction (accessibility
  parity, per this project's existing axe-scan discipline); and whether the
  table should be virtualized/paginated for long time series or just
  horizontally scrollable as stated.
