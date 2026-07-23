# Plan: Bookmarklet runtime entrypoint + `bookmarklet.js` build/hosting

Status: **finalized, confirmed by user 2026-07-23**. Ready for Testing (stage 3).

Source: TECH_DEBT.md item logged 2026-07-22 (stage: Implementation) — the
bookmarklet's runtime entrypoint (scrapeStats -> buildIngestPayload ->
POST /ingest -> banners) and how `bookmarklet.js` gets bundled/hosted was
never pinned down by a test, so InstallPage's `${origin}/bookmarklet.js`
link points at a stub that doesn't exist.

## Decisions confirmed

- **Hosting (Option A):** `bookmarklet.js` is built as a second Vite IIFE
  library target in the frontend and served from the SPA's own origin at
  `/bookmarklet.js`. InstallPage requires no change — its loader already
  targets `${window.location.origin}/bookmarklet.js`. No backend change.
- **Loader vs inline (loader):** keep the existing loader pattern (a small
  `javascript:` bookmarklet that injects `<script src="...">`), not a fully
  inlined IIFE. Updatable server-side without user reinstalls. A task is
  included to empirically verify the loader isn't blocked by AO3's live CSP;
  inlining is the documented fallback if it is.

Both were presented as an architectural fork (hard to reverse — the loader
URL gets baked into every user-installed bookmarklet) and confirmed
explicitly by the user rather than picked silently.

## Grounding (verified against the actual codebase)

- Three tested, unwired units already exist: `frontend/src/bookmarklet/
  scrapeStats.ts`, `buildIngestPayload.ts`, `banners.ts`.
- There is **no POST-to-`/ingest` code on the frontend yet** — the entrypoint
  must add it (backend `/ingest` + `SnapshotIngestService` already exist).
- InstallPage (`frontend/src/routes/InstallPage.tsx`) already builds its
  `javascript:` loader against `window.location.origin` — i.e. the frontend
  origin, not the backend origin. Its test only asserts the href shape and
  the copy fallback; it does not pin build/hosting.
  scoped `/ingest` to AO3 origins (`archiveofourown.org`, `www.`) for
  `POST`/`OPTIONS` — the bookmarklet's cross-origin POST from an AO3 page is
  already covered, no backend change needed.
- **Token flow forces the core design constraint:** `SnapshotIngestService
  #find_or_create_user!` mints a `readToken` on first ingest and raises
  `TokenMismatch` (403) on subsequent ingests unless the payload's token
  matches. The dashboard's `useTokenStore`/`useTokenFromUrl` persist the
  token on the **app origin**; the bookmarklet runs on the **AO3 origin** —
  a different localStorage. The entrypoint must persist the returned
  `readToken` in AO3-origin localStorage and replay it, or every repeat
  capture 403s.
- The backend origin can't be read from `document.currentScript` (that gives
  the frontend origin the script was loaded from) — it must be baked in at
  build time via a `VITE_*` env var.
- Stack check: Vite library/IIFE mode + a second Vite config + a
  `document.currentScript` read are all built-in. No new dependency.

## 1. Happy path

1. User clicks the installed bookmarklet on their AO3 all-years stats page.
2. The `javascript:` loader injects `<script src="${frontendOrigin}/bookmarklet.js?t=<ts>">`.
3. `bookmarklet.js` (IIFE) runs; captures frontend origin via
   `document.currentScript?.src` and the build-time-baked API origin.
4. Re-injection guard: if `window.__ao3StatsPlus` already set, remove any
   existing banner and stop; else set the flag.
5. `scrapeStats(document, location.pathname)`. On failure, render the
   matching failure banner and stop.
6. Read any stored `readToken` from AO3-origin localStorage keyed by
   scraped username.
7. `buildIngestPayload(data, { schemaVersion: 1, readToken })`.
8. `fetch(`${apiOrigin}/ingest`, POST, JSON body)`.
9. On success: persist the returned `readToken` to AO3-origin localStorage;
   render success banner with a dashboard link
   `${frontendOrigin}/u/<username>?token=<readToken>`.
10. User clicks through; existing `useTokenFromUrl` captures/persists the
    token app-side and strips it from the URL.

## 2. Data model (backend) — N/A

No schema/migration/model changes. `/ingest`, `SnapshotIngestService`, and
CORS scoping already exist and are correctly scoped for this use.

## 3. Frontend design

- **InstallPage:** no change (Option A keeps its existing loader target
  valid).
- **New files:**
  - `frontend/src/bookmarklet/entrypoint.ts` — IIFE orchestrator (guard,
    origin capture, scrape→payload→POST→banner routing).
  - `frontend/src/bookmarklet/ingestClient.ts` — `postIngest(apiOrigin,
    payload)`; classifies responses into a discriminated result (`success |
    tokenMismatch | schemaMismatch | invalid | networkError`).
  - `frontend/src/bookmarklet/tokenStorage.ts` — AO3-origin localStorage
    read/write keyed by username (`ao3-stats-plus:readToken:<username>`),
    guarded against localStorage being unavailable.
  - `frontend/src/bookmarklet/constants.ts` (optional) — shared
    `SCHEMA_VERSION = 1`.
- **Build wiring:**
  - `frontend/vite.bookmarklet.config.ts` — `build.lib`, `formats:
    ['iife']`, entry `src/bookmarklet/entrypoint.ts`, `emptyOutDir: false`,
    fixed output `bookmarklet.js`; API origin inlined via `define`/
    `import.meta.env`.
  - `frontend/package.json` — add `build:bookmarklet`, chain into `build`.
  - Add `VITE_API_ORIGIN` (or derive from `VITE_GRAPHQL_URL`) to
    `.env.example`; document it.

## 4. Corner cases

- First-ever capture (`readToken` null) → 201, token minted/stored/shown.
- Same-day re-capture → backend dedups (`deduped: true`, 200) → still
  treated as success.
- Double-click / re-injection on the same page → guard flag + remove
  existing banner before re-render.
- `document.currentScript` null → don't crash; fall back sensibly.
- `localStorage` blocked on AO3 (private mode) → first capture still
  succeeds; repeat capture 403s → surfaced via the token-mismatch error
  banner telling the user to re-copy the token.

## 5. Error states

- Scrape `no-works` / `not-all-years` / `scrape-failed` → distinct
  informational/failure banners.
- HTTP 403 (`TokenMismatch`) → `renderUnauthorizedBanner`.
- HTTP 426 (`UnsupportedSchemaVersion`) → `renderFailureBanner` ("bookmarklet
  is out of date, reinstall").
- HTTP 422 (`InvalidPayload`) → failure banner with server message.
- Network error / 5xx → `renderRetryBanner`, `onRetry` re-POSTs without
  re-scraping.
- Backend error handling is unchanged (`IngestController` already maps to
  422/403/426).
- **Banner-naming gap:** no existing banner cleanly fits a generic
  informational message without a `schemaVersion` suffix. Recommendation:
  add `renderInfoBanner(container, {message})` to `banners.ts` during
  Implementation (extends an existing in-stack module, no new dependency).

## 6. Accessibility

- Preserve `banners.ts`'s existing patterns: `role="status"`/`role="alert"`,
  `tabindex="-1"` + `.focus()` on success, real `<button>`s with Enter
  handling on retry.
- Append banners to `document.body`; move focus to the banner so screen
  readers announce it; success token must be visible/selectable text, not
  just clipboard-only.
- Remove the old banner before adding a new one on re-injection, to avoid
  duplicate live-region announcements.
- Verify contrast/overlay behavior on the real AO3 page (manual/e2e-lite,
  since this runs cross-origin and isn't covered by the existing axe route
  scan).
- InstallPage a11y already covered and unchanged.

## 7. Task list

### Testing (stage 3) — write failing specs first

1. `tokenStorage` spec: round-trip read/write keyed by username; missing key
   → undefined; localStorage unavailable → no throw.
2. `ingestClient` spec (mock `fetch`): 201/200 → success; 403 →
   tokenMismatch; 426 → schemaMismatch; 422 → invalid; network/5xx →
   networkError. Assert POST URL/method/headers/body.
3. `entrypoint` orchestration spec (jsdom, mocked scrape/ingestClient/
   banners): happy path wiring; each scrape failure → correct banner; each
   HTTP error → correct banner; retry banner re-POSTs without re-scraping;
   re-injection guard blocks duplicate banners.
4. `renderInfoBanner` spec, if adopted (role, message, no `schemaVersion`
   suffix).
5. Build-output assertion: `npm run build` emits `bookmarklet.js` at the
   served root as a self-contained IIFE with no React import.
6. Backend CORS request spec: AO3-origin `OPTIONS`+`POST /ingest` preflight
   allowed (extend commit 105f6e2's specs only if not already covered).

### Implementation (stage 4) — make them pass

7. `frontend/src/bookmarklet/tokenStorage.ts`.
8. `frontend/src/bookmarklet/ingestClient.ts` (+ optional `constants.ts`).
9. `frontend/src/bookmarklet/entrypoint.ts`.
10. `renderInfoBanner` added to `banners.ts` (if adopted).
11. `frontend/vite.bookmarklet.config.ts` + `package.json` `build:bookmarklet`
    chained into `build` + CI Build step emits it.
12. `.env.example` + README: document `VITE_API_ORIGIN`.
13. Confirm InstallPage needs no code change under Option A.
14. Manual/empirical CSP verification against live AO3; execute inline
    fallback if the loader is blocked.

### Retrospective (stage 8) checks

15. Repeat-capture works end to end (token persisted on AO3 origin → no 403
    on second capture) — the load-bearing risk of this plan.
16. Coverage of new `bookmarklet/*` files vs. 85% baseline; bundle stayed
    tiny (no accidental React/heavy-dep inclusion).
17. CSP verification outcome recorded (and reinstall/versioning implication
    if inline fallback was used); banner-naming decision left no semantic
    debt; `VITE_API_ORIGIN`/CORS deploy config documented enough for
    Deployment (ties to existing `TODO(deployment)` in `cors.rb`).

## Files referenced

- `frontend/src/routes/InstallPage.tsx` (+ `.test.tsx`)
- `frontend/src/bookmarklet/{scrapeStats,buildIngestPayload,banners}.ts`
- `frontend/src/store/{useTokenStore,useTokenFromUrl}.ts`
- `frontend/{vite.config.ts,package.json,.env.example}`, new
  `frontend/vite.bookmarklet.config.ts`
- `backend/config/initializers/cors.rb`
- `backend/app/controllers/ingest_controller.rb`
- `backend/app/services/snapshot_ingest_service.rb`
