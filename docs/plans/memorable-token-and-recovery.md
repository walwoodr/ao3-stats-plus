# Plan: Memorable capability tokens + recovery from a lost/claimed token

Status: **DRAFT — awaiting user confirmation before Testing (stage 3).**

Addresses two accepted `TECH_DEBT.md` items together:

1. **Token memorability** (2026-07-30, Maintenance): `read_token` is an opaque
   `SecureRandom.hex(24)` (192-bit) string, painful to retype if the "View
   your dashboard" link is lost.
2. **No recovery path from a claimed username** (2026-07-30, Review): `/ingest`
   has no real proof-of-ownership, so a lost token means a permanent 403
   lockout with no way to reclaim your own username.

The user's chosen shape (verbatim): *"Whenever a user activates the bookmarklet
on a logged in stats page, display a pre-chosen token from a list of two of 300
4-8 letter words in the format 'word-word' and allow the user to type a token
that they'd like to use on the website. In either case, if the user is
triggering the bookmarklet on the stats page, we should assume that they get to
have access to that user's stats page on stats+."*

**Why this is sound (verified against AO3's real source).** AO3's
`stats_controller#load_user` sets `@user = current_user` — the *logged-in* user,
ignoring the `:username` in the URL. You can only ever successfully scrape real
stats for the account you are logged in as. So a browser that scrapes real stats
for username X is airtight proof it is authenticated as X *right now*. This is a
materially stronger ownership signal than the app has ever had, and it is what
justifies the "capture always succeeds and (re)sets the token" model below.

## Three structural decisions confirmed by the user (not re-litigated here)

1. Token uniqueness is **scoped per-username, not global**.
2. A stats-page capture **always succeeds and (re)sets the token** — this fully
   replaces the old "wrong token -> 403 `TokenMismatch`" rejection for the
   ingest path.
3. Flow timing is unchanged (one click, immediate scrape+POST); the **success
   banner** shows the suggested word-pair token with an **inline edit** option.

---

## What exists today (verified against the codebase)

- **`ao3_users.read_token`**: `string, null: false`, with a **global unique
  index** `index_ao3_users_on_read_token (unique: true)` and a model
  `validates :read_token, presence: true, uniqueness: true`. `username` is also
  uniquely indexed (one row per username).
- **Write path `/ingest`** (`SnapshotIngestService`): `find_or_create_user!`
  either creates a new user with a server-minted `generate_token`
  (`SecureRandom.hex(24)`), or, for an existing user, `authorize_existing_user!`
  does a `secure_compare` and raises `TokenMismatch` (mapped to **403**) on
  mismatch. Same-day snapshots dedup.
- **Write path `/ingest/work`** (`WorkDetailIngestService`, Phase 2 fan-out):
  `authorize!` does the same `secure_compare` -> `TokenMismatch` (403);
  otherwise attaches enrichment to today's snapshot.
- **Read path** (GraphQL `statsForUser(username, token)`,
  `query_type.rb`): `find_by(username:)` then `secure_compare(read_token, token)`
  -> `"Invalid token"` `GraphQL::ExecutionError` on mismatch.
- **Bookmarklet** (`frontend/src/bookmarklet/`): `tokenStorage.ts` persists the
  token in AO3-origin localStorage, keyed per username, and replays it on repeat
  captures. `entrypoint.ts` scrapes -> `buildIngestPayload` (`readToken` =
  stored token or `null`) -> `postIngest` -> `routeResult` renders banners.
  `renderSuccessBanner` (`banners.ts`) shows the token as a **read-only** `<code>`
  block + Copy button + "View your dashboard" link. On success it starts the
  Phase 2 fan-out (`fanOut.ts`), which POSTs each work to `/ingest/work`.
- **CORS** (`config/initializers/cors.rb`): `/ingest` and `/ingest/work` are
  scoped to `AO3_ORIGINS` only; `/graphql` to the frontend origin only.

---

## Resolved open questions (with reasoning)

### Q1 — Word-pair generation lives in the **frontend (TypeScript)**; wordlist lives once, in TS

Given decision 2 (always accept and reset), the backend no longer needs to be
the source of truth for token *generation*. Moving generation to the client is
strictly simpler and best realizes decision 2:

- The backend becomes **uniformly "accept and store"** across every write path —
  `SnapshotIngestService#generate_token` (`SecureRandom`) is **deleted**, not
  repurposed. No branch between "mint a token" and "accept-and-reset a token";
  both collapse into "store the client-supplied token."
- The displayed suggestion, the editable field, and any future "re-roll"
  affordance all live in one place (the banner), with no round-trips.
- Per-username scoping (Q-decision 1) means word-pair collisions across users
  are fine, so there is **no server-side uniqueness reason** for generation to
  be server-side.

**Wordlist location:** `frontend/src/bookmarklet/wordlist.ts`, exporting
`export const WORDLIST: readonly string[]` — a plain in-repo array (no npm/gem
dependency, per the tech-stack policy). Generation helper:
`frontend/src/bookmarklet/tokenSuggestion.ts`,
`generateTokenSuggestion(rng = Math.random): string`.

**Wordlist constraints (for Testing/Implementation to satisfy the literal 300
words against):** exactly 300 entries; each word lowercase ASCII `[a-z]`, length
4–8; all unique; no profanity / slurs / visually ambiguous pairs. The two picked
words must be **distinct** (no `cat-cat`), joined by a single `-`.

**Entropy — surfaced, not a blocker.** 300 words, two distinct ordered picks =
300 x 299 = 89,700 combinations = ~16.5 bits. This is deliberately weak as a
*secret* — the user explicitly chose memorability, and under decision 2 the
*capture* path's security no longer rests on token unguessability (being on the
real stats page is the proof). The token's remaining job is gating the **read**
path (`statsForUser`), where ~16 bits gates read access to a personal stats
dashboard *if the attacker also knows your exact AO3 username*. At "personal
tool scale" this is acceptable and consistent with the app's existing Tier-3
posture; a candidate future mitigation (a `statsForUser` / `/ingest` throttle) is
noted under Residual Risk, not built here.

### Q2 — Wordlist as data (covered above)

Plain `wordlist.ts` array, TS only, distinct-words-only pairing. No second copy
in Ruby, because the backend never generates or validates the token's *format* —
it only stores whatever string the client sends.

### Q3 — The "edit my token" action uses a small new endpoint `POST /ingest/token`, always-accept, same AO3-origin CORS boundary

The edit happens in the **same page-load, same-origin trusted context** as the
capture that just succeeded (the "I am on my own stats page right now" proof).
It is a distinct user action *after* the banner renders, so it needs its own
request. Two options were weighed:

- **Reuse `/ingest`** (resend the whole stats payload with the new token):
  wasteful (resends aggregate + works just to change a string) and semantically
  muddy (a token edit masquerading as a capture). It would technically work —
  the token is set in the user-find step *before* the same-day dedup branch, so
  a deduped re-POST still rotates the token — but it is the wrong contract.
- **A dedicated `POST /ingest/token`** (chosen): minimal payload, cheap, clear,
  and reuses the existing `IngestController` rescue pattern and the existing
  `AO3_ORIGINS` CORS block.

**Contract:**
```
POST /ingest/token
{ "schemaVersion": 1, "username": "<name>", "readToken": "<new desired token>" }
-> 200 { "ok": true, "readToken": "<stored token>" }
```
- **Always-accept** (matching decision 2): the service sets
  `read_token = readToken` for that username with **no current-token proof**.
  Requiring the current token would be inconsistent — the capture that *set* the
  token in the first place required no proof beyond the AO3-origin CORS boundary,
  so rotating it must not require more. The CORS boundary is the only gate, same
  as `/ingest`.
- Backed by a tiny `TokenUpdateService` (consistent with the "one narrow service
  per write path" pattern): validates `username`/`readToken` present +
  `schemaVersion`; `Ao3User.find_by(username:)`; unknown username ->
  `InvalidPayload` (422); else `update!(read_token:)`.
- Rescues: `InvalidPayload` -> 422, `UnsupportedSchemaVersion` -> 426. **No 403**
  (always-accept). No snapshot/dedup interaction at all.

### Q4 — The pre-existing curl/non-browser claim risk is UNCHANGED in kind, slightly BROADER in degree — explicitly out of scope

This redesign only strengthens the story for legitimate *browser* captures.
`curl`/scripts are not bound by CORS and can still forge `/ingest`/`/ingest/work`/
`/ingest/token` calls. Note one honest consequence of decision 2: because
`/ingest` now **always accepts** (no token gate), a non-browser client can not
only *claim an unclaimed* username (as before) but also **overwrite a claimed**
one's token/snapshot. That is a genuine widening of the existing, separately
accepted Tier-3 "personal tool, CORS-gates-browsers" risk — it is a direct
entailment of the user-confirmed always-accept decision, not a new decision this
plan makes. It is called out here so it is not conflated with what this plan
fixes, and re-logged under Residual Risk with the same candidate mitigations
(Rack::Attack throttle; binding a claim to proof only the real author can
produce). **Not closed here.**

### Q5 — Existing hex-token rows: no migration

`read_token` is a plain `string` column, format-agnostic. Existing rows (e.g.
the local `lark_ral` dev row with real snapshot history) keep their 192-bit hex
tokens, which keep working on both the read path and repeat captures. On the
user's next capture the banner shows the hex token in the editable field and the
user *may* rotate it to a word-pair via Save — a natural, opt-in upgrade. **No
data migration; nothing special to handle.** The only schema change is dropping
the unique index (below), which is required for correctness, not data migration.

### Q6 — `TokenEntryForm` needs no change

It is already a plain labeled text `<input>` that accepts any string, short or
long (`frontend/src/components/TokenEntryForm.tsx`). Short word-pairs work as-is.
No change required. (Optional, non-blocking: a copy tweak mentioning the
`word-word` format — not planned.)

---

## 1. Happy path (end to end)

1. User, logged in to AO3, opens their own `/users/<me>/stats`, All Years view,
   and clicks the existing bookmarklet — same single trigger as today.
2. `scrapeStats` runs (unchanged). The bookmarklet picks the token to send:
   the **stored** token if one exists (replay), otherwise a freshly generated
   **word-pair** from `generateTokenSuggestion()`.
3. `POST /ingest` with `readToken` = that token. `SnapshotIngestService`
   **always accepts**: find-or-create the `Ao3User`, **set `read_token` to the
   client-supplied token**, persist today's snapshot (or dedup). Response echoes
   the now-stored `readToken` (200 dedup / 201 new).
4. The **success banner** renders with the token in an **editable text input**
   (pre-filled), a Copy button, a "Save token" button, and the "View your
   dashboard" link.
5. Phase 2 fan-out proceeds exactly as today (see section 5) — `/ingest/work`
   now ignores the token, so nothing about enrichment changes for the user.
6. *(Optional)* The user edits the input to a token they prefer and clicks
   **Save** -> `POST /ingest/token` -> backend sets `read_token` -> client
   updates AO3-origin localStorage, rewrites the dashboard link's `?token=`, and
   announces "Token saved."
7. The user clicks "View your dashboard" ->
   `/u/<username>?token=<current token>` (URL-encoded) -> GraphQL
   `statsForUser(username, token)` `secure_compare`s -> stats render.
8. **Recovery:** if the user later loses the link, they either retype
   username + the memorable word-pair into `TokenEntryForm`, **or** simply re-run
   the bookmarklet on their stats page — which, being always-accept, re-establishes
   access and lets them reset the token. **No permanent lockout.**

---

## 2. Data model (backend) — one schema change

Migration (single, small):

```
remove_index :ao3_users, name: "index_ao3_users_on_read_token"
```

- **Required for correctness, not cosmetic.** Word-pairs collide across users;
  with a global unique index the second user to land on `cat-dog` would raise
  `RecordNotUnique`. `SnapshotIngestService`'s existing `RecordNotUnique` rescue
  is written for a *username* race (it re-finds by username) and would misbehave
  on a *read_token* collision, so the index must go. Per-username uniqueness is
  already guaranteed by the existing unique index on `username` (one row per
  username), so no replacement index is needed — `read_token` is never a lookup
  key (every path finds by `username` then compares).
- `read_token` stays `string, null: false`.

Model change (`Ao3User`): drop `uniqueness: true`, keep presence:

```
validates :read_token, presence: true   # uniqueness removed
```

No new tables, columns, or associations. No data backfill (Q5).

---

## 3. Backend write-path changes

### 3a. `SnapshotIngestService` — always accept, store client token, delete minting

- **Delete** `generate_token`, the `TokenMismatch` error class, and
  `authorize_existing_user!`.
- `validate_payload!` now also requires `readToken` present (non-blank) ->
  `InvalidPayload` if missing. (The frontend always supplies it; a null token is
  a malformed/legacy client.)
- `find_or_create_user!`:
  - existing user -> `ao3_user.update!(read_token: client_read_token)` (the
    always-(re)set behavior; a replayed same token is a harmless no-op update).
  - new user -> `create!(username:, read_token: client_read_token)`.
  - keep the `RecordNotUnique` rescue for the concurrent-first-ingest **username**
    race (re-find by username), unchanged in intent.
- The same-day dedup branch is unchanged. Because the token is set in the
  find-or-create step (before the dedup check), even a deduped same-day re-POST
  correctly reflects the current token — but token *edits* go through
  `/ingest/token`, not a re-POST.

### 3b. `WorkDetailIngestService` — drop the token check entirely

- **Delete** the `TokenMismatch` class and the `authorize!` `secure_compare`.
  Rationale: `/ingest/work` is part of the same fan-out from the same just-proved
  page-load; requiring a token match here would also break the edit-during-
  fan-out race (if the user edits the token mid-run, in-flight `/ingest/work`
  calls still carry the *old* token and would 403). Always-accept removes that
  race cleanly.
- `call` becomes: validate -> `Ao3User.find_by(username:)` (nil ->
  `NoSnapshotForToday`, since there is nothing to attach to) ->
  `locate_todays_work_stat!` -> update. `readToken` in the payload is no longer
  read (may still be sent by the client and is ignored).
- `NoSnapshotForToday` (409), `InvalidPayload` (422), `UnsupportedSchemaVersion`
  (426) are unchanged.

### 3c. New `POST /ingest/token` + `TokenUpdateService`

- Route: `post "/ingest/token", to: "ingest#update_token"`.
- CORS: add `resource "/ingest/token", headers: :any, methods: %i[post options]`
  to the existing `AO3_ORIGINS` allow block (same trust boundary as
  `/ingest`/`/ingest/work`).
- `IngestController#update_token`: call `TokenUpdateService`; render
  `{ ok: true, readToken: }` 200; rescue `InvalidPayload` -> 422,
  `UnsupportedSchemaVersion` -> 426 (same rescue-and-render shape as the other
  two actions). See Q3 for the service contract.

### 3d. `IngestController` rescue changes

- `#create`: **remove** the `TokenMismatch` -> `:forbidden` rescue.
- `#create_work_detail`: **remove** the `TokenMismatch` -> `:forbidden` rescue.
- Neither `/ingest` nor `/ingest/work` can return **403** any more.

### 3e. Read path (`statsForUser`) — UNCHANGED

The GraphQL read path keeps `secure_compare(read_token, token)` and its
`"Invalid token"` error. A wrong token on the dashboard still cannot read your
stats — this is now the token's primary security job. This is deliberate and
must not be relaxed.

---

## 4. Frontend design (small, contained — one existing surface changed)

The only new UI is an **editable token field + "Save token" button** inside the
existing injected success banner (`renderSuccessBanner`, `banners.ts`). This is a
small change to an existing surface, not a new page, so it references the design
snapshot (`design-system/ao3-stats-plus/MASTER.md`) rather than establishing a
new one.

`banners.ts` uses **inline styles only** (it is injected into AO3's page with no
build-time CSS pipeline) and already resolves MASTER.md's palette as literal hex
via `colorTokens.ts`. The new field mirrors MASTER.md's `Inputs` spec as inline
styles:

- **Token input** (`<input type="text">`, replaces the read-only `<code>`):
  background `--color-card`; `1px` border `color-mix(ink 20%, transparent)`;
  `border-radius: 6px`; `padding: 10px 14px`; **`font-size: 16px`** (MASTER.md's
  explicit "never smaller — avoids iOS auto-zoom"); value font **IBM Plex Mono**
  (MASTER.md data/figures tier — the token is a figure to be transcribed
  precisely, consistent with today's `tokenStyle`); focus -> `--color-accent`
  border + `0 0 0 3px color-mix(accent 15%, transparent)` ring (MASTER.md
  `.input:focus`). Pre-filled with the captured/suggested token.
- **"Save token" button**: MASTER.md `.btn-secondary` inline equivalent
  (transparent bg, `1px --color-ink-soft` border, `border-radius: 6px`,
  weight 600, color/border-only transition — no transforms, per MASTER.md).
  Keeps the banner's single accent CTA on the dashboard link.
- **Copy button**: unchanged role; now copies the **current input value**.
- **Dashboard link**: `href` recomputed from the current (saved) token, and the
  token is **`encodeURIComponent`-d** in the `?token=` param (see Corner cases —
  user-typed tokens can contain URL-significant characters; today's code does not
  encode the token because hex is URL-safe).

**States of the banner:**
1. *Just captured* — input pre-filled with suggested/replayed token; Copy + Save
   + dashboard link.
2. *Saving* — Save button disabled/"Saving...".
3. *Saved* — polite confirmation "Token saved"; dashboard link + copy reflect the
   new token.
4. *Save failed* — assertive inline error; typed value preserved; Save re-enabled.

No React component is involved (this is DOM injected on AO3). `TokenEntryForm.tsx`
(the frontend-origin dashboard component) is untouched (Q6).

---

## 5. Corner cases

- **First-ever capture, localStorage available** -> no stored token ->
  `generateTokenSuggestion()` produces a fresh word-pair; it becomes the stored
  and server-side token.
- **First-ever capture, localStorage blocked** (Safari private/webview) ->
  `getStoredReadToken` returns undefined and `setStoredReadToken` silently no-ops
  -> a fresh suggestion is generated each run and set server-side, but not
  persisted locally; the user must Save/copy it to keep it. Acceptable
  degradation (already how `tokenStorage` degrades).
- **Repeat capture (word-pair already stored)** -> replayed, `/ingest`
  re-accepts the same value (no-op update), banner shows it editable.
- **Repeat capture for a pre-existing hex-token row** (`lark_ral`) -> replays the
  hex, banner shows the hex editable; user may rotate to a word-pair via Save.
- **Edit to empty/whitespace** -> client-side validation blocks; no POST.
- **Edit to the same value** -> optionally short-circuit (skip the POST) since it
  is a no-op; either way harmless.
- **Edit to a URL-unsafe value** (spaces, `&`, `#`, `?`) -> client trims and
  should constrain to a URL-safe charset before Save; the dashboard link
  `encodeURIComponent`s the token regardless; backend stores verbatim.
- **Edit during an in-flight fan-out** -> harmless: `/ingest/work` ignores the
  token now (3b), so already-queued per-work POSTs do not 403.
- **Word-pair collision across two different users** -> allowed (per-username
  scoping); no error now that the unique index is dropped.
- **Concurrent same-day captures for the same username** -> snapshot dedup and
  the `(snapshot_id, work_id)` uniqueness protect data; token is last-writer-wins
  with near-identical values.

---

## 6. Error states

**Backend**
- `/ingest`: `InvalidPayload` (422, now also for a missing `readToken`),
  `UnsupportedSchemaVersion` (426). **No 403 any more.**
- `/ingest/work`: `InvalidPayload` (422), `UnsupportedSchemaVersion` (426),
  `NoSnapshotForToday` (409). **No 403 any more.**
- `/ingest/token`: `InvalidPayload` (422, incl. unknown username / blank token),
  `UnsupportedSchemaVersion` (426). No 403.
- `statsForUser` (read): `"No stats found for that username"` /
  `"Invalid token"` GraphQL errors — unchanged.
- All logged via the existing controller/Rails logging; no new logging surface.

**Frontend**
- Success banner Save failure -> assertive inline `role="alert"` error, typed
  value preserved, Save re-enabled; a network failure offers retry (re-click
  Save). No new global banner type.
- The old `tokenMismatch` -> `renderUnauthorizedBanner` path for **ingest** is
  **removed** (ingest can no longer 403). `renderUnauthorizedBanner` itself stays
  for the read/dashboard side. `ingestClient` and `workDetailIngestClient` drop
  their `403 -> tokenMismatch` mapping (a stray 403 would fall through to
  `networkError`, which the fan-out already treats as a skip).

---

## 7. Accessibility

The new editable field lives in the injected banner (inline-styled, no build CSS)
and must meet the same bar as the existing banners:

- **Programmatic label**: a real `<label for=...>` bound to the input's `id`
  ("Your access token — edit to choose your own"), not placeholder-only.
- **Input semantics**: `type="text"`, `autocomplete="off"`,
  `spellcheck="false"`, `autocapitalize="off"` (it is a token, not prose).
- **Focus**: the banner keeps `role="status"` + `tabindex="-1"` + `.focus()` on
  render (existing pattern); the input, Copy, Save, and link are all reachable by
  Tab in a sensible order. Enter inside the input triggers Save
  (`preventDefault`, no page navigation).
- **Buttons**: real `<button>`s (Copy, Save) — already the pattern.
- **Dynamic announcements**: the "Token saved" confirmation goes in a **polite**
  live region (`role="status"`/`aria-live="polite"`); a Save **failure** is
  assertive (`role="alert"`). Do not spam new alert nodes — update text in place.
- **Contrast**: reuse the MASTER.md-verified token pairs already in
  `colorTokens.ts` (input value `--color-ink` on `--color-card` = 15.28:1 light /
  13.35:1 dark). The accent focus ring meets the same bar as the app's inputs.
- **Colour is not the only signal**: Save state is conveyed by text
  ("Saving..."/"Token saved"/error copy), not colour alone.

---

## 8. Infra / hosting cost — N/A

No new paid infrastructure. One dropped index and one tiny endpoint on the
existing Render Postgres + Rails service; negligible cost/storage impact.

---

## 9. Residual risk (surfaced, out of scope, re-logged for TECH_DEBT)

- **Curl/non-browser claim surface is now broader** (Q4): always-accept means a
  non-browser client can overwrite a *claimed* username's token/snapshot, not
  just claim an unclaimed one. Direct entailment of the user-confirmed decision.
  Candidate mitigations (not built): Rack::Attack throttle on `/ingest*`; binding
  a claim to something only the real author can produce.
- **~16.5-bit token entropy** (Q1): weak as a read-path secret if the attacker
  also knows the exact AO3 username. Candidate mitigation (not built): a
  `statsForUser` rate limit. Accepted at personal-tool scale per the user's
  explicit memorability choice.

Both are consistent with the existing accepted Tier-3 posture and should be
appended to `TECH_DEBT.md` (or the existing `/ingest` entry updated) by
Implementation/Review so the broadened surface is on record.

---

## 10. Task list (for Testing, Implementation, Retrospective)

### Testing (stage 3) — write failing specs first

1. **Migration/schema spec**: `index_ao3_users_on_read_token` is gone; a second
   user can be created with a `read_token` equal to an existing user's (no
   `RecordNotUnique`); `read_token` still `null: false`.
2. **`Ao3User` model spec**: `read_token` presence still validated; uniqueness
   **no longer** validated (two rows may share a token).
3. **`SnapshotIngestService` spec**: new user stores the client-supplied
   `readToken` (no server minting); existing user with a *different* client token
   **succeeds and resets** `read_token` (no `TokenMismatch`); missing/blank
   `readToken` -> `InvalidPayload`; same-day dedup still returns the (current)
   token; `generate_token`/`TokenMismatch` no longer exist; username-race
   `RecordNotUnique` rescue still works.
4. **`WorkDetailIngestService` spec**: token mismatch no longer raises (enrichment
   applies regardless of any `readToken`); unknown username -> `NoSnapshotForToday`;
   existing `NoSnapshotForToday`/enrichment behavior intact.
5. **`TokenUpdateService` spec** (new): sets `read_token` for a known username;
   unknown username -> `InvalidPayload`; blank token -> `InvalidPayload`; bad
   `schemaVersion` -> `UnsupportedSchemaVersion`; always-accept (no current-token
   proof required).
6. **`POST /ingest` request spec**: no 403 path any more; 201/200 with echoed
   token; missing token -> 422; CORS still AO3-origin-only.
7. **`POST /ingest/work` request spec**: remove the 403 case; other mappings
   (200/201/409/422/426) intact; CORS unchanged.
8. **`POST /ingest/token` request spec** (new): 200 success + echoed token;
   422 (unknown username / blank token); 426 (schema); CORS scoped to
   `AO3_ORIGINS`; **not** reachable from the frontend origin.
9. **GraphQL `statsForUser` spec**: unchanged behavior — wrong token still
   `"Invalid token"` (regression guard that the read path was NOT relaxed).
10. **`wordlist.ts` / `tokenSuggestion.ts` spec**: exactly 300 words; each
    `[a-z]{4,8}`; all unique; `generateTokenSuggestion` returns `word-word` with
    **distinct** words, format `^[a-z]{4,8}-[a-z]{4,8}$`; deterministic under an
    injected RNG.
11. **`ingestClient` / `workDetailIngestClient` spec**: drop the `403 ->
    tokenMismatch` result; a stray 403 now maps to `networkError`.
12. **New `tokenUpdateClient` spec** (mirrors `ingestClient`): success / invalid
    (422) / schemaMismatch (426) / networkError.
13. **`entrypoint.ts` spec**: first capture with no stored token generates and
    sends a word-pair; repeat capture replays the stored token; the `tokenMismatch`
    -> unauthorized-banner route is gone; success still starts the fan-out.
14. **`banners.ts` (`renderSuccessBanner`) spec**: editable input pre-filled with
    the token; Copy copies the current input value; Save calls the token-update
    client and, on success, updates the dashboard-link `?token=`
    (`encodeURIComponent`-d) and announces via a polite live region; Save failure
    -> `role="alert"`, value preserved; label/`id` association; keyboard order +
    Enter-to-save; contrast tokens reused.

### Implementation (stage 4) — make them pass

15. Migration: `remove_index :ao3_users, name: "index_ao3_users_on_read_token"`;
    update `Ao3User` validation (drop uniqueness).
16. `SnapshotIngestService`: delete `generate_token`/`TokenMismatch`/
    `authorize_existing_user!`; require + store client `readToken`; always-(re)set.
17. `WorkDetailIngestService`: delete `TokenMismatch`/`authorize!`; stop reading
    the token; unknown username -> `NoSnapshotForToday`.
18. `TokenUpdateService` (new) + `IngestController#update_token` +
    `POST /ingest/token` route + CORS `resource "/ingest/token"`; remove both
    `TokenMismatch -> :forbidden` rescues from `IngestController`.
19. Frontend data: `wordlist.ts` (300 words), `tokenSuggestion.ts`,
    `tokenUpdateClient.ts`; `entrypoint.ts` token selection (stored-or-generate)
    and removal of the ingest `tokenMismatch` route; drop `403 -> tokenMismatch`
    from `ingestClient`/`workDetailIngestClient`.
20. `banners.ts`: editable token input + Save button + save/confirm/error states
    + `encodeURIComponent`-d dashboard link, per section 4 (mind the 500-line
    `.ts`... this is `.ts` at 400 — watch the file-length budget; split a helper
    if needed).
21. Append the broadened curl surface + entropy notes to `TECH_DEBT.md`.

### Retrospective (stage 8) — evaluate against

22. Recovery actually works end to end: a user who lost their token reclaimed
    access by re-running the bookmarklet (no lockout), and a mistaken/edited token
    resets cleanly.
23. No 403 remains reachable on any `/ingest*` path; the read path (`statsForUser`)
    was **not** relaxed (still rejects wrong tokens).
24. The wordlist lives in exactly one place (TS), backend carries no wordlist and
    no token minting.
25. Broadened claim surface (Q4) and token entropy (Q1) are recorded in
    `TECH_DEBT.md`, not silently lost.
26. Editable-token banner a11y verified (label, focus, live-region announcements)
    including the cross-origin injected context.
27. Coverage of new/changed backend + bookmarklet files vs. the 85% baseline.

---

## 11. Items genuinely needing user sign-off before Testing

Short, per the standing bar. Everything above I resolved with reasoning; only
these are worth an explicit nod:

- **(A) Broadened curl/overwrite surface (Q4).** Always-accept (a confirmed
  decision) means non-browser clients can now overwrite a *claimed* username, not
  just claim an unclaimed one. I recommend proceeding and logging it as Tier-3
  residual risk, but flag it for awareness since it is a real security-posture
  change, not just UX.
- **(B) Token entropy (~16.5 bits) as the read-path gate.** Implied by the user's
  own "300 words, word-word" choice; I am treating it as accepted. Flagging only
  so it is a conscious acceptance, given the read path (`statsForUser`) is the one
  place the token is still a real secret.

If both are acknowledged, this plan is ready for Testing.
