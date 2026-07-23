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
