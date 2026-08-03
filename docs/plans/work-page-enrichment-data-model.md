# Plan: Per-work page enrichment (public bookmarks, visible comments, bookmark notes, work metadata) via stats-page fan-out

Status: **FINALIZED — both design decisions resolved by user 2026-07-31.**
(a) chapter tracking is time-series; completion + series are latest-state.
(b) capture mechanism is **Option 2, "capture all" fan-out from the stats
page**. Ready for Testing (stage 3). The toggle-graph UI that consumes this
data remains explicitly **out of scope** and needs its own consultation +
Planning pass (see "Resolved decisions", item (c)).

Source: two completed Discovery passes on what AO3's stats page vs. work
page vs. work-bookmarks sub-page expose (findings treated as ground truth;
AO3 markup claims verified against `otwcode/otwarchive` and not re-verified
here). This plan is the follow-up the user asked for: *"I'd like to look at
the planned shape of the stored data before this code is committed to ensure
it's comprehensive and not redundant or unnecessary."* The data-model
section below is written to be reviewed on its own for exactly that.

## What exists today (verified against the codebase)

- **Stats-page scrape** (`frontend/src/bookmarklet/scrapeStats.ts`): one
  same-origin pass on `/users/:username/stats`, All-Years view. Produces
  aggregate totals + per-work rows + `earliestPostYear`.
- **Write path**: `POST /ingest` -> `IngestController` -> `SnapshotIngestService`
  (find-or-create `Ao3User` by capability token, dedup same-day snapshots,
  transactionally persist `Snapshot` + `Work` + `WorkStat`). Payload contract
  in `backend/spec/support/ingest_payloads.rb`, `schemaVersion: 1`.
- **Read path**: GraphQL `statsForUser(username, token)` ->
  `StatsForUserResult` -> `StatsForUserType` (aggregate series + per-work
  series + ratio + earliest post year).
- **Schema** (`backend/db/schema.rb`): `ao3_users`, `snapshots` (per-day
  aggregate), `works` (identity: `ao3_work_id`, `title`, `fandoms`,
  `last_seen_on`), `work_stats` (per-work per-snapshot: `hits`, `kudos`,
  `comments`, `bookmarks`, `subscriptions`, `word_count`), all counters
  `NOT NULL default 0`.

Critical semantic facts carried forward from Discovery, because they drive
every naming choice below:

| Field on the stats page (already stored) | What it actually is |
|---|---|
| `work_stats.bookmarks` / `snapshots.total_bookmarks` | **ALL** bookmarks (public + private combined) |
| `work_stats.comments` / `snapshots.total_comments` | comment **THREAD** count (top-level only) |

The work page (`/works/:id`) exposes two *different, larger* per-work
numbers, plus data the stats page has none of:

| Field on the work page (NEW) | AO3 source method | Relationship to existing |
|---|---|---|
| `public_bookmarks_count` | `public_bookmarks_count` | **PUBLIC** bookmarks only; a strict subset of the all-bookmarks count above |
| `count_visible_comments` | `count_visible_comments` | **TOTAL** individual comments incl. replies; strictly >= the thread count above |
| published date | `dd.published` (`work_meta_list`) | no existing equivalent |
| chapter count + completion | `chapter_total_display` (e.g. "3/?") | no existing equivalent |
| series membership | work meta | no existing equivalent |

The work-bookmarks sub-page (`/works/:id/bookmarks`, **paginated ~20/page**,
**public bookmarks only for everyone including the author** — an inherent AO3
limitation the user has accepted) exposes per public bookmark: bookmarker
name (may be absent for deleted/orphaned accounts), note HTML, bookmarker's
tags, date bookmarked, collections.

---

## 1. Data model (the part to review most carefully)

Design goals, in priority order: (1) no redundancy — never store a number we
can derive; (2) correct NULL-vs-0 semantics — "not captured yet" must be
distinguishable from "captured, and it's zero"; (3) same `captured_on` time
axis for every per-work time-series value, so the deferred toggle-graph can
plot all bookmark/comment lines against one date scale without cross-table
date alignment.

### 1a. New time-series values -> columns on `work_stats` (nullable)

Everything that changes over a work's life and has graph value lives on
`work_stats` so it shares the row's `snapshot_id` (and therefore its
`captured_on`) with the existing per-work counters — one row, one date.

```
add_column :work_stats, :public_bookmarks,   :integer, null: true
add_column :work_stats, :visible_comments,   :integer, null: true
add_column :work_stats, :chapter_count,      :integer, null: true
add_column :work_stats, :chapters_expected,  :integer, null: true
```

- **All nullable, NO default.** NULL = "this work page was not scraped for
  this snapshot." 0 = "scraped, and it genuinely has zero." This distinction
  is load-bearing for the graph and for the derivations below; a `default 0`
  would silently fabricate zero-points for every stats-only snapshot.
- `public_bookmarks` / `visible_comments` names map 1:1 to AO3's own method
  names (`public_bookmarks_count`, `count_visible_comments`), keeping
  provenance obvious and — for `visible_comments` — deliberately avoiding a
  collision with the existing, confusingly-named `total_comments` (=threads)
  on `snapshots`.
- **`chapter_count` is time-series** (user decision (a)): chapter count
  growing over a WIP's life is directly analogous to `word_count`, which is
  *already* time-series on `work_stats`; tracking it there gives WIP-progress
  history for free and keeps it consistent with word count.
- **`chapters_expected` is ALSO time-series** (my judgment, per the
  coordinator's prompt to reconsider): `chapter_total_display` renders as a
  single "posted/expected" pair (e.g. "3/12", or "3/?" where expected is
  unknown -> NULL). The *expected* total is not fixed — an author revising
  their planned chapter count changes it, exactly as posting a chapter changes
  the count. The two are two halves of one reading captured in the same
  instant; splitting them (count time-series, expected latest-state) would
  let a historical `chapter_count` of 3 pair with a *latest* expected of 20,
  producing nonsensical "3/20"-at-an-old-date displays. Keeping both
  time-series preserves the true "N/M as seen that day" pairing. NULL
  `chapters_expected` means the work was ongoing/open-ended ("?") at capture.

**Derived, NOT stored** (the redundancy the user asked us to avoid):

- **private bookmarks** = `bookmarks - public_bookmarks`, computed only when
  `public_bookmarks` is present. Clamp to `>= 0` (the all-count and the
  public-count come from two scrapes seconds-to-minutes apart within the same
  fan-out; a bookmark added in between could momentarily make public exceed a
  slightly older all-count). No column.
- **completion** for display can be read off `complete` (below) and/or
  `chapter_count == chapters_expected`; the explicit `complete` flag is stored
  because AO3 lets an author mark a work complete independent of the numbers.
- **aggregate public bookmarks / aggregate visible comments** = SUM of the
  per-work values across a snapshot's `work_stats`. **No column on
  `snapshots`.** Two reasons: (1) AO3 exposes no account-wide public-bookmark
  or total-comment figure anywhere — it could *only* ever be a sum-of-works
  derivation, so storing it stores a derived number; (2) fan-out capture is
  expected to be partial (some works fail/skip on any given run — see §5), so
  a stored aggregate would bake in a silently-incomplete total. Deriving it at
  query time, clearly labelled "sum over captured works," is both honest and
  non-redundant.

### 1b. New per-work identity / metadata -> columns on `works`

`published_on` never changes; `series` and `complete` change rarely and are
work status/identity rather than a per-day reading. They live on `works`
(latest-known-state), next to the existing latest-state `fandoms`/`title`,
overwritten on each capture.

```
add_column :works, :published_on,          :date,     null: true
add_column :works, :series,                :string,   null: true  # comma-joined, mirrors :fandoms
add_column :works, :complete,              :boolean,  null: true  # user decision (a): latest-state
add_column :works, :work_page_captured_at, :datetime, null: true  # provenance: when work-page data last refreshed
```

- `series`: comma-joined string, identical pattern to the existing `fandoms`
  column (a work can be in multiple series). Latest-state (user decision (a)).
- `complete`: explicit completion flag, latest-state (user decision (a)).
  A minor, intentional asymmetry: chapter *numbers* are time-series (1a) while
  the completion *flag* is latest-state — this is the user's explicit split
  and is coherent (you get progress history from the numbers; "is it finished
  right now" from the flag).
- `work_page_captured_at`: distinguishes a work that has never had a
  work-page capture (NULL) from one that has, and dates the latest-state
  fields. Optional — droppable if the reviewer considers it surplus.

### 1c. New bookmark-notes list -> new table `work_bookmarks` (latest-state)

Per the user's decision: build the list, accept it is inherently public-only,
store as **latest-known-state, not time-series** (re-scraping overwrites,
does not accumulate history). One row per public bookmark on a work, replaced
wholesale on each work-bookmarks capture.

```
create_table :work_bookmarks do |t|
  t.references :work, null: false, foreign_key: true
  t.string   :bookmarker_name    # NULL for deleted/orphaned accounts
  t.text     :note_html          # sanitized HTML from AO3; NULL if no note
  t.string   :bookmarker_tags    # comma-joined, mirrors :fandoms pattern; NULL if none
  t.date     :bookmarked_on      # NULL if unparseable
  t.string   :collections        # comma-joined; NULL if none
  t.timestamps
end
# index on work_id added by t.references
```

- **Replace semantics**: each work-bookmarks capture does
  `work.work_bookmarks.delete_all` then bulk-inserts the freshly scraped list,
  inside the same transaction as that work's enrichment. No stable
  per-bookmark external key is scraped, so delete-and-replace is the simplest
  correct "latest state" model and matches "overwrite, don't accumulate."
- The row count here and `work_stats.public_bookmarks` describe the same
  underlying public bookmarks but are **not redundant**: the scalar is a
  historical time series (kept per snapshot forever), the list is a single
  current detail snapshot (kept once, overwritten). They should roughly agree;
  we do not enforce equality (pagination timing, hidden/admin content).

### 1d. What is deliberately NOT added

- No new `snapshots` columns (aggregate public/visible are derived — 1a).
- No language / rating / warnings / category / tags / collections-on-the-work
  columns — the user scoped work-page bonus metadata to **chapter count,
  completion, series only**.
- No renames of the existing mis-named `comments`/`total_comments`
  (=threads) columns — out of scope, pure migration churn; documented here
  instead so the collision with the new `visible_comments` is unambiguous.

### 1e. Full proposed schema delta at a glance

| Table | Column | Type | Null? | Time-series or latest-state | Why |
|---|---|---|---|---|---|
| `work_stats` | `public_bookmarks` | integer | yes | time-series | public bookmark count per snapshot |
| `work_stats` | `visible_comments` | integer | yes | time-series | total comments incl. replies per snapshot |
| `work_stats` | `chapter_count` | integer | yes | time-series | posted chapters (analogous to `word_count`) |
| `work_stats` | `chapters_expected` | integer | yes | time-series | expected total; NULL = "?"; paired with `chapter_count` |
| `works` | `published_on` | date | yes | latest-state | per-work AO3 published date (never changes) |
| `works` | `series` | string | yes | latest-state | comma-joined series membership |
| `works` | `complete` | boolean | yes | latest-state | completion flag |
| `works` | `work_page_captured_at` | datetime | yes | latest-state | provenance (optional) |
| `work_bookmarks` (new) | (see 1c) | — | — | latest-state | public bookmark notes list |

---

## 2. Happy path (fan-out is the real mechanism)

1. User clicks the **existing** bookmarklet on their All-Years stats page —
   same single trigger as today, no second bookmarklet to install.
2. **Phase 1 (reliable core, unchanged):** `scrapeStats` + `POST /ingest`
   create/dedup today's `Snapshot`, base `WorkStat` per work, and `Work`
   rows. This completes and is persisted *before* any fan-out begins, so the
   fast, reliable path a user already depends on is never blocked or slowed by
   Phase 2, and today's snapshot is guaranteed to exist for enrichment to
   attach to.
3. **Phase 2 (fan-out enrichment):** the bookmarklet renders a live progress
   banner ("Capturing work N of M...") and iterates the scraped work IDs
   **sequentially, throttled** (see §5):
   - same-origin `fetch('/works/:id')` -> `DOMParser` -> parse
     `public_bookmarks`, `visible_comments`, `published_on`,
     `chapter_count`/`chapters_expected`, `complete`, `series`;
   - same-origin `fetch('/works/:id/bookmarks?page=N')`, following pagination
     to the last page (bounded page cap), collecting the public-bookmark list;
   - `POST /ingest/work` for that one work (token replayed from AO3-origin
     localStorage, exactly like Phase 1), which persists that work's
     enrichment immediately.
4. Because each work is POSTed as it finishes, an interrupted or aborted
   fan-out (browser closed, AO3 slow, circuit-breaker tripped — §5) leaves
   every already-processed work saved; only unprocessed works are missing.
5. When the loop finishes (or hits a cap / circuit-breaker / user navigation),
   a final banner summarizes: core capture succeeded; enriched X of M works,
   Y skipped/failed (with the reason class).
6. The GraphQL read path exposes the new per-work fields + bookmark-notes list
   (aggregate public/visible sums are derived and exposed when the deferred
   graph work happens — §4).

---

## 3. Backend write path

- **`POST /ingest` is unchanged.** Phase 1 keeps using
  `SnapshotIngestService` exactly as-is; the reliable core path takes no risk
  from this feature.
- **New endpoint `POST /ingest/work`**, sibling to `/ingest`, keeping the
  "one narrow non-GraphQL action per bookmarklet capability" design the
  existing `IngestController` comment values. Own service
  `WorkDetailIngestService`, own schema-version constant (starts at 1,
  independent of the stats-page `schemaVersion: 1`).
- **Why a second endpoint rather than folding enrichment into the `/ingest`
  payload** (reconsidered under fan-out): fan-out makes Phase 2 a long,
  interruptible sequence of AO3 fetches (§5), so *incremental* persistence is
  the priority — one POST per work means completed works survive an
  interrupted run. Folding everything into a single fat `/ingest` POST at the
  *end* of the fan-out would buffer all enrichment in the browser and lose the
  entire batch if the long run is interrupted; it would also collide with
  `/ingest`'s same-day dedup (a second same-day POST currently returns
  `deduped` and writes nothing). Incremental per-work POSTs avoid both.
- **`WorkDetailIngestService`** per call: authorize by capability token
  (reusing the existing `secure_compare` check); locate **today's** `Snapshot`;
  **find-or-update** the `WorkStat` for (today's snapshot, work) — filling
  `public_bookmarks`, `visible_comments`, `chapter_count`, `chapters_expected`
  in place (idempotent: a same-day re-run updates rather than dedup-skips);
  update the `Work` latest-state fields (`published_on`, `series`, `complete`,
  `work_page_captured_at`); `delete_all` + bulk-insert `work_bookmarks` for
  the work — all in one transaction per work.
- **Snapshot ordering / `NoSnapshotForToday`: downgraded to defensive-only.**
  Under fan-out, Phase 1 creates today's snapshot before Phase 2 runs, so the
  normal path always has it. The service still checks and, if today's snapshot
  is genuinely absent (a partial/interrupted run where Phase 1's POST failed,
  a malformed or out-of-order client), returns a typed error; the fan-out
  skips that work and continues rather than crashing. It is no longer a
  user-facing "capture your stats first" workflow gate — just a guard against
  writing enrichment with nowhere valid to attach it.

---

## 4. Frontend / read API shape

No new persistent UI is designed in this pass beyond the fan-out progress/
result banner (reusing `banners.ts`). The toggle-graph UI is deferred. API
*shape* (in scope) changes:

- `Types::PerWorkPointType`: add `public_bookmarks: Int` (nullable),
  `visible_comments: Int` (nullable), `chapter_count: Int` (nullable),
  `chapters_expected: Int` (nullable), and derived `private_bookmarks: Int`
  (nullable; `bookmarks - public_bookmarks`, clamped `>= 0`, NULL when
  `public_bookmarks` is NULL).
- `Types::PerWorkSeriesType`: add latest-state identity fields
  (`published_on`, `series`, `complete`) and a `bookmarks` field returning the
  `work_bookmarks` list via a new `Types::WorkBookmarkType`
  (`bookmarker_name`, `note_html`, `bookmarker_tags`, `bookmarked_on`,
  `collections`, all nullable).
- Aggregate derived sums (`aggregate_public_bookmarks`,
  `aggregate_visible_comments`) on `StatsForUserType`/
  `AggregateSeriesPointType`: **deferred to the graph-UI Planning pass** —
  noted here so that pass knows they are derivations (sum over captured
  `work_stats`), not new stored columns.

---

## 5. AO3 politeness, throttling & partial success (first-class design concern)

Fan-out changes the operating profile fundamentally: **every daily capture now
issues N+1-or-more sequential requests to AO3** (one work page per work, plus
one-or-more bookmark pages per work with a public bookmark), not an occasional
opt-in deep dive. A prolific author with hundreds of works and many-page
bookmark lists could generate many hundreds of requests per run. This must be
designed to be a good citizen and to degrade gracefully, because partial
success is now the *normal* operating mode, not an edge case.

- **Sequential, throttled fetches.** Fan-out requests run one at a time (never
  parallel bursts), with a deliberate delay between AO3 requests (target ~a few
  hundred ms to ~1s; exact value tuned during Implementation against live AO3
  behaviour). Applies to both work-page and bookmark-page fetches.
- **Per-request timeout + abort.** Each fetch uses an `AbortController` with a
  bounded timeout; a slow/hung request is aborted, that work marked skipped,
  and the loop continues rather than stalling the whole run.
- **Circuit-breaker on repeated failures.** If AO3 starts returning errors or
  rate-limit responses (429/503/5xx) or timing out repeatedly (e.g. N
  consecutive failures), the fan-out stops early instead of continuing to
  hammer a struggling server, and reports partial completion. Already-POSTed
  works are safe (§3 incremental persistence).
- **Partial-success handling is the normal path.** Each work either succeeds
  (enrichment POSTed) or is tallied as skipped/failed with a reason class
  (fetch error / timeout / parse failure / deleted work / no snapshot). The
  final banner reports "Saved further data for X of M, Y skipped," and the read API simply
  reflects whatever was captured (NULL for the rest — never fabricated zeros).
- **Safety caps.** A maximum number of works processed per run and a maximum
  bookmark-page depth per work bound worst-case runtime and request volume;
  when a cap truncates, that is surfaced in the summary rather than silently
  dropped.
- **UX signal for long runs.** A live progress banner ("Capturing work N of
  M...") both reassures the user and sets the "this may take a while"
  expectation for prolific authors; it is a polite, cancellable operation
  (navigating away simply stops it, losing only unprocessed works).

---

## 6. Corner cases

- **No snapshot for today at enrichment time** (Phase 1 POST failed / out-of-
  order client) -> `WorkDetailIngestService` returns a typed error; that work
  is skipped and tallied; fan-out continues (defensive path, §3).
- **Work with zero public bookmarks** -> `public_bookmarks = 0` (not NULL);
  `work_bookmarks` replaced with an empty set; bookmarks sub-page renders an
  empty list, not an error.
- **private = all - public would be negative** (cross-scrape timing within the
  run) -> clamp to 0 at derivation time.
- **Ongoing WIP** -> `chapters_expected` NULL ("?"); `chapter_count` still
  recorded; `complete` false/NULL.
- **Deleted/orphaned bookmarker** -> `bookmarker_name` NULL (EXTERNAL-
  UNVERIFIED exact byline rendering — scraper must tolerate a missing/
  placeholder name without dropping the row).
- **Bookmark with no note** -> `note_html` NULL, row still stored (tags/date/
  collections may still be useful).
- **Many bookmark pages** -> follow "next" until absent, bounded by the page
  cap (§5); over the cap -> capture up to the cap + report truncation.
- **Work newly created since Phase 1 / not in today's snapshot** -> no
  `WorkStat` for it today; the fan-out only iterates works Phase 1 scraped, so
  this cannot normally arise; if it does (race), the service skips that work
  with the no-snapshot/ no-work-stat path rather than inventing a row.
- **Work deleted on AO3** (404 on work-page/bookmarks fetch) -> skip that work,
  tally it, continue.
- **Concurrent same-day captures of the same work** -> unique index
  `(snapshot_id, work_id)` on `work_stats` protects; `work_bookmarks`
  delete-and-replace is transactional and idempotent.

---

## 7. Error states

**Backend**: `WorkDetailIngestService` raises typed errors mapped by the
controller — `InvalidPayload` -> 422, `TokenMismatch` -> 403,
`UnsupportedSchemaVersion` -> 426, `NoSnapshotForToday` -> 409 (or 422 with a
specific message). Same rescue-and-render pattern as `IngestController`.

**Frontend**: reuse `banners.ts`. Phase 1 error states are unchanged (existing
plan). Phase 2 adds: a progress banner during fan-out; a summary banner on
completion (success count / skip count / truncation); `renderRetryBanner` is
*not* used per-work (a single failed work is skipped, not retried inline) but
the whole fan-out may be re-run by re-clicking the bookmarklet (idempotent
enrichment makes re-runs safe). 403 during fan-out (token drift) ->
`renderUnauthorizedBanner`; 426 -> `renderFailureBanner` (out of date). No new
banner primitives expected beyond a progress/summary variant; add one only if a
case genuinely does not fit.

---

## 8. Accessibility

The rendered output is the capture/progress banner, which must reuse
`banners.ts`'s existing patterns already validated in the entrypoint plan:
`role="status"`/`role="alert"`, `tabindex="-1"` + `.focus()`, real
`<button>`s. The **live progress banner** is the one new a11y consideration:
it should update via a polite live region (`role="status"`/`aria-live=
"polite"`), updating text in place rather than spamming new alert nodes, so a
screen-reader user hears periodic progress, not a flood. Remove the prior
banner before rendering the final summary to avoid duplicate announcements.
Bookmark `note_html` is sanitized AO3 HTML — when the deferred notes-list UI is
built it must render sanitized and preserve semantics; that a11y work belongs
to that later UI pass, flagged here so it is not forgotten.

---

## 9. Infra / hosting cost — N/A

No new paid infrastructure. Extra columns + one small table on the existing
Render Postgres; storage impact is negligible (`work_bookmarks` is bounded by
public bookmark counts, latest-state only).

---

## 10. Task list (for Testing, Implementation, Retrospective)

### Testing (stage 3) — write failing specs first

1. Migration/schema specs: new nullable `work_stats` columns
   (`public_bookmarks`, `visible_comments`, `chapter_count`,
   `chapters_expected`); new `works` columns (`published_on`, `series`,
   `complete`, `work_page_captured_at`); new `work_bookmarks` table + FK/index.
2. Model specs: `WorkBookmark` (belongs_to :work, nullable fields tolerated);
   `WorkStat` NULL-vs-0 semantics for the new columns; derived
   private-bookmarks clamp; `chapter_count`/`chapters_expected` pairing.
3. `WorkDetailIngestService` specs: token auth reuse; attaches to today's
   snapshot; **idempotent same-day re-run updates in place** (not dedup-skip);
   `NoSnapshotForToday` defensive error; enriches existing `WorkStat`; updates
   `Work` latest-state fields; delete-and-replace of `work_bookmarks`;
   transactional rollback on partial failure; zero-public-bookmarks -> 0 +
   empty list; deleted/orphaned bookmarker tolerated.
4. `POST /ingest/work` request specs: 200/201 success, 403/422/426/409
   mappings, CORS scoped to AO3 origin (mirror existing `/ingest`).
5. Work-page scraper specs (jsdom + fixtures): parse `public_bookmarks_count`,
   `count_visible_comments`, `published`, `chapter_total_display`
   (`chapter_count`/`chapters_expected`, incl. "N/?"), `complete`, series.
6. Work-bookmarks scraper specs: parse + paginate a multi-page fixture;
   missing name, missing note, empty list; page-cap truncation.
7. Fan-out orchestration specs (mocked fetch/scrapers/ingest client): Phase 1
   runs and persists before Phase 2; sequential throttled iteration; per-work
   POST persists incrementally; **partial success** (some works fail -> others
   still saved, tally correct); per-request **timeout/abort** skips a work;
   **circuit-breaker** stops after N consecutive failures; **safety caps**
   (max works, max bookmark pages) truncate + report; progress banner updates;
   final summary banner content.
8. Per-work payload builder + ingest-client specs (mirror existing
   `buildIngestPayload`/`ingestClient`; new schema constant).
9. GraphQL specs: `PerWorkPointType` new fields + derived `private_bookmarks`;
   `PerWorkSeriesType` identity fields + `bookmarks` list; `WorkBookmarkType`.

### Implementation (stage 4) — make them pass

10. Migrations (order: `work_stats` cols, `works` cols, `work_bookmarks`
    table).
11. `WorkBookmark` model + `Work`/`WorkStat` associations & validations.
12. `WorkDetailIngestService` + `NoSnapshotForToday`; wire `POST /ingest/work`
    in `IngestController` (or a sibling controller) + routes + CORS.
13. Frontend: work-page scraper, work-bookmarks paginating scraper, per-work
    payload builder, per-work ingest client.
14. Fan-out orchestration wired into the existing bookmarklet entrypoint:
    Phase 1 (unchanged) then Phase 2 loop with **sequential throttling,
    per-request timeout/abort, circuit-breaker, safety caps, live progress +
    summary banners** (§5). Build wiring is unchanged (same single
    `bookmarklet.js`).
15. GraphQL: new types/fields + resolver derivations; keep aggregate
    public/visible sums out until the graph pass.

### Retrospective (stage 8) — evaluate against

16. NULL-vs-0 semantics held in practice (no accidental `default 0`); no
    redundant stored aggregate crept in; `chapter_count`/`chapters_expected`
    stayed paired.
17. Partial-success behaves sanely (some works enriched, others not; graphs/
    API do not fabricate zeros).
18. **AO3 politeness outcome recorded** — the load-bearing external risk now
    that fan-out hits AO3 N+1 times every run: throttle value used, whether
    rate-limiting/circuit-breaker was observed in real use, typical run
    duration for a large author, whether caps were hit.
19. Bookmark delete-and-replace never left a work with a stale/duplicated
    list; page-cap truncation surfaced, not silent.
20. Coverage of new backend + bookmarklet files vs. 85% baseline.
21. Confirm the deferred toggle-graph consultation actually happened before
    any graph UI shipped.

---

## Resolved decisions

### (a) Chapter tracking / completion / series placement — RESOLVED

- `chapter_count` -> **time-series on `work_stats`** (analogous to
  `word_count`).
- `chapters_expected` -> **time-series on `work_stats`** (kept with
  `chapter_count` so the "N/M" pairing stays historically accurate; see 1a).
- `complete` -> **latest-state on `works`**.
- `series` -> **latest-state on `works`** (mirrors `fandoms`).

### (b) Capture-delivery mechanism — RESOLVED: Option 2, fan-out

The single existing stats-page bookmarklet, after its Phase 1 scrape+POST,
now also same-origin fetches each work's `/works/:id` and
`/works/:id/bookmarks` (paginated) and POSTs per-work enrichment to a new
`POST /ingest/work` in the same run (§§2-3). Chosen by the user over the
hybrid/opt-in options. This makes AO3 politeness/throttling and partial
success first-class concerns (§5), and reduces the snapshot-ordering guard to
a defensive-only check (§3).

### (c) Toggle-graph UI — still deferred / out of scope

The chart that plots all-/public-/private-bookmarks and threads-/visible-
comments together with per-line toggles needs its own consultation and its
own future Planning pass. This plan only shapes the data + API to support it.
