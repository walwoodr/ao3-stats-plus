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
  corrected. **Still open**: the exact `dt`/`dd` class-name conventions for
  each stat row (`dd.published`/`dd.status`/etc.) match general AO3
  knowledge and the confirmed helper source's field order, but haven't been
  visually diffed against a rendered live page - low risk given how much of
  the surrounding structure is now confirmed, but worth a final live check
  before Deployment per this project's established discipline (see the
  2026-07-31 stats-page fandom-nesting entry below for why this matters).
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
  but not to the same confidence as the outer wrapper. **EXTERNAL-UNVERIFIED
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
  multi-page capture in production.
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
- [2026-08-01] (stage: Implementation) `frontend/src/bookmarklet/fanOut.test.ts`
  exceeds CODE_STANDARDS.md's 400-line `.ts` file-length guideline (was
  already at 422 lines pre-existing before this session's throttle/circuit-
  breaker fix; now 486 after adding three test cases for the Review-flagged
  fix in `fanOut.ts`). Not addressed here per "no unrelated refactoring" -
  splitting this spec file (e.g. by describe-block group) is a reasonable
  future cleanup but out of scope for a targeted bug fix. Flag for Review/
  Retrospective to decide whether to split by scenario group (throttle/
  circuit-breaker/safety-caps/banners) into sibling spec files.
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
- [2026-08-02] (stage: Review) `InstallPage.tsx`'s open-source disclosure
  link ("view it on GitHub") fails WCAG 1.4.1 (link-in-text-block):
  `text-accent` (`#9F1239`) on the surrounding `text-ink-soft` (`#7A6B72`)
  paragraph is only 1.59:1 contrast (needs 3:1), and the link has no
  non-color distinguishing style (underline is `hover:` only, not visible at
  rest) - confirmed failing two real axe scans in `accessibility.spec.ts`
  ("the install page has no detectable a11y violations",
  "...revealed code fallback..."), independently reproduced against `main`
  via `git stash` before any of this session's comparison-graph work, so
  it's pre-existing, not a regression from that feature. Found incidentally
  while verifying an unrelated Testing pass's e2e/a11y coverage. Fix: give
  the link a persistent (not hover-only) underline, and/or a higher-contrast
  color for inline body-text links specifically (MASTER.md may need a
  dedicated "inline link in prose" token distinct from standalone CTA links
  like the dashboard link's `.btn`-style treatment, which doesn't have this
  problem since it's not sitting inside a paragraph of contrasting body
  text).
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
- [2026-08-03] (stage: Review) `WorkComparisonSection.tsx`'s `role="status"`
  summary announcement ("Comparing N works, START to END.") derives its year
  span from the full unfiltered `unionDates` of the selected works, not from
  the currently-applied slider window. Narrowing the date range does not
  change the announced years, so a screen-reader user who narrows the window
  hears a span that doesn't match what the charts now show. Minor a11y/UX
  inconsistency; the plan's example is ambiguous about whether the summary
  should report the data span or the active window. Deferred: decide intended
  semantics, then either feed the windowed range into the summary or document
  that it intentionally reports the full selection span.
- [2026-08-03] (stage: Review) `frontend/src/lib/markerShapes.tsx` trips a
  single ESLint `react-refresh/only-export-components` *warning* (not error):
  it exports both a component (`MarkerGlyph`) and a plain helper
  (`renderMarkerShape`) from one file. The colocation is deliberate - both
  the Recharts custom dot and the legend glyph call `renderMarkerShape` so
  the two never drift - and the rule only affects Fast Refresh DX in dev, not
  production or correctness. Fine to leave as a warning; if a clean lint run
  is wanted, move `renderMarkerShape` (and `starPoints`) into a sibling
  `markerPaths.ts` and re-export, leaving `markerShapes.tsx` component-only.
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
- [2026-08-03] (stage: Maintenance) `frontend/src/bookmarklet/banners.test.ts`
  exceeds CODE_STANDARDS.md's 400-line `.ts` file-length guideline (was
  already at 608 lines pre-existing before this session's banner-stacking-
  wrapper feature; now 668 after adding a "banner stacking wrapper" describe
  block). Not addressed here per "no unrelated refactoring" - splitting this
  spec file (e.g. by banner-type describe-block group, mirroring the
  fanOut.test.ts entry above) is a reasonable future cleanup but out of
  scope for a targeted styling/feature change. Flag for Review/Retrospective
  to decide whether to split.
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
- [2026-07-23] (stage: Review) Re-injection cleanup gap, pre-existing but
  mildly worsened by the shared banner stack (0547df9). `window.__ao3StatsPlus.banner`
  only ever tracks the single last banner passed through `setGuardBanner`;
  fan-out's progress/summary banners are never tracked, so on re-injection
  `existing.banner?.remove()` removes only the tracked banner and never the
  shared stack wrapper - leaving any in-flight progress/summary banner plus a
  now-empty `[data-ao3-stats-plus-banner-stack]` div lingering in document.body.
  Visible outcome is not materially worse than before (orphaned fan-out
  banners were always left behind), but consider removing the whole stack on
  re-injection cleanup.
- [2026-07-23] (stage: Review) The `inputButton` helper (082b38e) omits any
  padding (unlike `primaryButtonStyle`), so the icon Copy button's hit target
  is only as large as the glyph at 1rem. Minor; worth a visual check that the
  target is comfortably tappable on touch.
