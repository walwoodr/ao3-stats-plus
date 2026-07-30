# Tech Debt

## Backlog

- [2026-07-22] (stage: Implementation) The bookmarklet's runtime entrypoint
  (wiring scrapeStats -> buildIngestPayload -> POST /ingest -> banners
  together into the actual script that runs on an AO3 page) and how that
  gets bundled/hosted as a standalone `bookmarklet.js` (a separate Vite
  build target? served by the Rails app? by the frontend host?) isn't
  pinned down by any test from the Testing stage, so it wasn't built here -
  InstallPage currently points the draggable/copyable bookmarklet href at a
  `${origin}/bookmarklet.js` loader stub that doesn't exist yet. Needs a
  Planning-level decision on hosting/build strategy before it's implemented.
- [2026-07-22] (stage: Implementation) Two pre-existing test-suite bugs
  found and flagged during Implementation (not fixed by editing tests
  without explicit approval, per process): `backend/spec/models/
  ao3_user_spec.rb`'s DB-uniqueness test was fixed with explicit user
  approval (commit 9e51dc3). `frontend/src/routes/InstallPage.test.tsx`'s
  "lets a keyboard user copy the fallback code" test still fails: an
  earlier test in the same file calls `userEvent.setup()`, which
  (`@testing-library/user-event` v14) attaches a getter-only
  `navigator.clipboard` stub to the shared jsdom `window` for the rest of
  that file; the later test's own `Object.assign(navigator, { clipboard:
  ... })` then throws before the component under test ever runs. Confirmed
  environment-only (not implementation-related) by comparing against
  `banners.test.ts`, which uses the identical `Object.assign` pattern with
  no `userEvent` calls in the file, and passes cleanly. Needs Testing to
  either avoid manual clipboard mocking in files that also use
  `userEvent.setup()`, or use `userEvent`'s own clipboard stub instead of
  hand-rolling one.
- [2026-07-22] (stage: Implementation) `frontend/tests/accessibility.spec.ts`
  ("the manual token-entry form has a programmatic label and keyboard tab
  order") fails only under the WebKit Playwright project, not
  Chromium/Firefox. Root cause: WebKit's default keyboard-navigation mode
  only tabs to text inputs/selects/links, not `<button>` elements (mirrors
  real Safari's default "Full Keyboard Access: Text boxes and lists only"
  setting) - Tab from the token input never reaches the submit button in
  WebKit specifically, even though the DOM/tab order is correct (proven by
  the identical test passing on the other two browsers). This is a known
  Playwright/WebKit environment limitation, not an app bug - see Playwright's
  WebKit keyboard-navigation docs/issues. Needs Testing to decide whether to
  scope this assertion to non-WebKit projects or accept it as a documented
  WebKit gap.
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
- [2026-07-30] (stage: Implementation) Two pre-existing Playwright a11y
  failures found while verifying the MASTER.md design-token re-skin
  (confirmed via `git stash` against the pre-re-skin code, both fail
  identically there with the old `slate`/`red` classes visible in the axe/
  error output, so neither was introduced by the re-skin): (1)
  `tests/accessibility.spec.ts` "the populated dashboard has no detectable
  a11y violations" - axe's `heading-order` rule flags `DashboardPage`
  jumping from `h1` straight to `TrendChart`/`RatioChart`'s `h3` with no
  intervening `h2` for the aggregate-charts section (the `PerWorkTrends`
  section below it does have an `h2`). (2) "the token-mismatch error state
  has no detectable a11y violations" - `page.getByText(/doesn't
  match.../i)` hits a Playwright strict-mode violation because the same
  message renders twice (the page-level `<p>` plus `TokenEntryForm`'s
  `role="alert"` echo of the same `error` prop). Both are structural/content
  issues, not styling - out of scope for a re-skin task (no behavior/
  structure changes), left as-is per instructions. Needs Maintenance or a
  future Planning pass to either promote the aggregate-charts heading to
  `h2` (or restructure the heading hierarchy) and de-duplicate/scope the
  mismatch-message assertion.
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
