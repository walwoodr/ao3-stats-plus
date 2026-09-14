# Plan: Bookmark notes feed (cross-work aggregated bookmark-notes list)

Status: **IMPLEMENTED (2026-09-13) — Testing and Implementation stages
complete, all task-list items (T-01–T-11) green, handed off to Review.** All
five decisions (D1–D5) are resolved by direct user answer (see "Decisions
resolved" at the end). Scope, data source, componentry reuse, persistence
model, the DOMPurify approval, and the conditional-glyph rule (D5) were
locked and were NOT relitigated during Implementation. One narrow,
documented deviation surfaced during Implementation (T-10): `sanitizeHtml.ts`
marks alt-less note images decorative (`alt=""`) to satisfy the e2e axe
suite - see TECH_DEBT.md, 2026-09-13, for the reasoning and a flag for
Review.

Source: Discovery (2026-08 roadmap "Display per-work bookmark notes/comments in
the UI" deferral) + direct user consultation. The backend/GraphQL already
exposes every field this feature renders (`WorkBookmarkType` under
`PerWorkSeriesType#bookmarks`); the only backend-adjacent work is one frontend
GraphQL query extension. Everything else is new frontend surface.

---

## Confirmed scope (do not relitigate)

A new top-level, username-scoped page at **`/u/:username/bookmarks`** that
renders a **cross-work, aggregated, newest-bookmark-first feed** of public
bookmark notes pulled from every displayed work into one combined list (one row
per bookmark, not per work). **By default no filter is applied — bookmarks from
ALL of the author's works display**, newest-bookmark-first. An optional filter,
driven by the **same `WorkPicker` component** used by the comparison chart (but
backed by its **own independent, separately-persisted selection state**), narrows
the feed to a chosen subset. Each row shows the fic's title (left column) and
the bookmarker name, note HTML, tags, collections, and bookmarked date (right
column). **The marker glyph next to the title is conditional (Decision D5):
hidden when no filter is applied or the filter is a single work (name only in
both cases), and shown only when the filter narrows the feed to 2–10 works** —
the case where the glyph actually earns its keep, visually grouping rows from
the same work apart from others in view. `noteHtml` is rendered as rich HTML
**through DOMPurify** (approved), never stripped to plain text. The combined
list is shown with **real pagination** (discrete numbered pages + prev/next).

Out of scope / unchanged: no scraping change, no data-model/migration change, no
new backend resolver (the `bookmarks` field already resolves non-null). The
single data-layer change is a frontend GraphQL query + TS interface extension.

---

## 1. Happy path

1. User is on their dashboard (`/u/:username`) with a valid token already
   resolved (via `useTokenFromUrl`/`useTokenStore`) and per-work history present.
2. AppLayout's nav now shows a username-scoped **"Bookmarks"** link (next to a
   "Dashboard" link) whenever the path matches `/u/:username*`. User clicks it
   and lands on `/u/:username/bookmarks`.
3. `BookmarkFeedPage` runs the same token/loading/error state machine as
   `DashboardPage`: token present, `useStatsForUser` returns cached data (same
   React Query key `["stats", username, token]`, so the navigation is instant —
   no second network round-trip).
4. The page renders a `WorkPicker` (the Autocomplete combobox with chips,
   fandom-header bulk-select, 10-work cap **when actively used as a filter**)
   bound to a **new persisted per-username store** (`useBookmarkFeedStore`),
   independent of the comparison chart's `useWorkComparisonStore`.
5. **On first visit the picker's selection is empty, which means "no filter —
   show ALL works,"** NOT "nothing selected, show nothing." A near-the-picker
   hint reads "No filter — showing bookmarks from all works." (This is a
   deliberate departure from `useWorkComparisonStore`'s "empty → fall back to
   first work" convention — see §Corner cases C9 and Decisions resolved D1.)
6. `BookmarkFeed` flattens every displayed work's `bookmarks` array into a flat
   list of rows — **all works when the selection is empty, otherwise only the
   selected subset** — each row carrying its owning work's identity (title,
   fandoms, `ao3WorkId`, and assigned marker style slot). It sorts the combined
   list **newest `bookmarkedOn` first** (undated rows last, stable within ties),
   and drops rows that carry no displayable content at all (no note AND no tags
   AND no collections — Decision D2).
7. The list renders as a semantic `<ul>` of `BookmarkFeedItem` cards. Each card:
   left column = work title + fandoms, **plus a `MarkerGlyph` only when the
   active filter narrows the feed to 2–10 works (Decision D5)** — no filter (all
   works) and a single-work filter show the title alone, unadorned; right
   column = bookmarker name, the **sanitized** note HTML, tag pills, collection
   pills, a `<time>` for the date, and a "View this work's bookmarks on AO3"
   link.
8. If the combined list exceeds one page, only the current page's slice (default
   page size 25) renders, beneath a **pagination control** (numbered pages +
   prev/next). Selecting a page re-slices the already-fetched, already-filtered,
   already-sorted list client-side (Decision D3 — no server round-trip).
9. User reads the notes. Changing the picker selection updates the feed live and
   re-persists to `useBookmarkFeedStore` (localStorage), scoped to this username,
   without touching the comparison chart's selection; a selection change resets
   the feed to page 1.

---

## 2. Data model (backend) — N/A except one frontend query extension

No schema, migration, model, association, validation, or resolver change.
`WorkBookmarkType` and `PerWorkSeriesType#bookmarks` (non-null list, empty when
none, resolved via `object.work_bookmarks`) already exist and are sufficient
(verified in `backend/app/graphql/types/`).

**The one real data-layer change (frontend):** extend
`frontend/src/queries/useStatsForUser.ts`:

- Add a `bookmarks { bookmarkerName noteHtml bookmarkerTags bookmarkedOn
  collections }` selection to the `perWorkSeries` block of `STATS_FOR_USER_QUERY`.
- Add a `WorkBookmark` TS interface (all five fields nullable, matching the
  backend's `null: true` on every field) and a `bookmarks: WorkBookmark[]` field
  on the `PerWorkSeries` interface (the list itself is non-null).

**Tradeoff surfaced (not silently chosen):** extending the *shared* `statsForUser`
query means `DashboardPage` also fetches bookmark HTML it never renders (a
potentially large payload for heavily-bookmarked authors). The benefit is a
single shared React Query cache entry, so dashboard↔feed navigation needs no
second fetch. The alternative is a *separate* feed-only query selecting just
`perWorkSeries { ao3WorkId title fandoms bookmarks {…} }` (no `points`), fetched
only on the feed page. Recommendation: **extend the shared query** (matches the
Discovery framing and gives free cross-page caching); if payload size becomes a
real problem later, splitting to a separate query is a clean, localized change.
Logged to TECH_DEBT as a watch-item, not done now.

**Client-side-hold assumption (relevant to D3 pagination):** because pagination
slices a list we already have fully in memory, the full combined bookmark set
must be reasonable to hold client-side. At personal-tool scale — one author's own
works, public bookmarks only, each work's list already scrape-page-capped
(`maxBookmarkPagesPerWork`) — this is a safe assumption (order of hundreds to low
thousands of rows worst case). Stated explicitly so it can be revisited if an
outlier account ever breaks it; if so, server-side pagination is the escalation
path, but nothing here needs it now.

### Bookmark-permalink investigation — outcome: DEFERRED (documented, not dropped)

The user asked for a link to the bookmark on AO3 "if reasonably possible."
Findings:

- AO3's bookmarks markup **does** carry a per-bookmark id: the fixture shows
  `<li class="bookmark blurb group" id="bookmark_1001">`, and AO3 bookmark
  permalinks are `https://archiveofourown.org/bookmarks/<id>`. So a true
  deep-link is *constructible in principle* from that DOM id.
- **But it is not currently captured anywhere in our pipeline.** `ScrapedBookmark`
  (`frontend/src/bookmarklet/scrapeWorkBookmarks.ts`) has no id field; the
  `work_bookmarks` table
  (`backend/db/migrate/20260731090003_create_work_bookmarks.rb`) has no id
  column; the ingest path doesn't store one; `WorkBookmarkType` doesn't expose
  one. Adding a per-bookmark permalink is therefore a **5-layer change** (scraper
  parse → migration → ingest → GraphQL type → frontend query), which exceeds the
  confirmed "frontend query extension only, no scraping/data-model work" scope.
- The `id="bookmark_NNNN"` attribute is also part of the same
  **EXTERNAL-UNVERIFIED** fixture markup (see the header comment in
  `scrapeWorkBookmarks.ts` and TECH_DEBT), so we can't confidently rely on its
  exact shape against live AO3 without verification.

**Resolution — two-part, honest (confirmed as Decision D4):**

1. **Exact-bookmark permalink: DEFERRED.** Out of scope, cross-cutting, and
   depends on unverified markup. Logged to TECH_DEBT with the concrete future
   path (parse `li[id^="bookmark_"]` → store `ao3_bookmark_id` → expose on
   `WorkBookmarkType` → select in query → link `/bookmarks/:id`).
2. **In-scope substitute shipped now: a per-work bookmarks-page link.** We already
   have `ao3WorkId`, so each row links to
   `https://archiveofourown.org/works/:ao3WorkId/bookmarks` — the public
   bookmarks page for that work — labelled **"View this work's bookmarks on
   AO3"** (NOT "view this bookmark", to avoid implying a deep-link we don't
   have). Frontend-only, zero backend work, no unverified-markup dependency.

---

## 3. Frontend design (new card/list pattern for user-generated prose)

This is the **first** place the app renders arbitrary user-authored text/HTML;
`design-system/ao3-stats-plus/MASTER.md` has no prose-list pattern. This section
establishes one, grounded in existing MASTER tokens (not improvised).

### Route & nav

- New route in `App.tsx`, nested inside the existing `AppLayout` route:
  `<Route path="/u/:username/bookmarks" element={<BookmarkFeedPage />} />`.
- **Nav entry:** `AppLayout` currently renders a single global "Install" link and
  can't know the username. Extend it to render **username-scoped** links
  ("Dashboard" → `/u/:username`, "Bookmarks" → `/u/:username/bookmarks`) only when
  the path matches `/u/:username*`, using react-router's `useMatch`/`matchPath`
  (react-router-dom v7, in-stack). Same link styling/focus-ring classes already
  used for "Install". This keeps nav centralized and gives the feed a reciprocal
  path back to the dashboard.

### Component tree

```
BookmarkFeedPage (route)                     new  frontend/src/routes/BookmarkFeedPage.tsx
├─ token/loading/error state machine (mirrors DashboardPage)
├─ WorkPicker (REUSED, controlled)           frontend/src/components/WorkPicker.tsx
│    driven by useBookmarkFeedStore (new); empty selection = "no filter, show all"
│    + "No filter — showing bookmarks from all works" hint when selection empty
└─ BookmarkFeed                              new  frontend/src/components/BookmarkFeed.tsx
   ├─ role="status" live region (counts / empty state / page-change announce)
   ├─ <ul> (current page slice)
   │   └─ BookmarkFeedItem  (× page size)    new  frontend/src/components/BookmarkFeedItem.tsx
   └─ BookmarkFeedPagination (numbered pages + prev/next)  new (or inline in BookmarkFeed)
```

Pure logic (kept out of the components to respect the 400-line `.ts` budget):
`frontend/src/lib/bookmarkFeed.ts` — resolve displayed works (all when selection
empty, else the subset), flatten works→rows, sort newest-first, drop empty rows,
build the AO3 work-bookmarks URL, page-slice a sorted list, and determine
**whether glyphs are shown at all** for the current filter state (Decision D5:
only when the displayed-works count is 2–10, i.e. an active multi-work filter —
never for the unfiltered "all works" default or a single-work filter). When
glyphs ARE shown, reuse `assignStyleSlot`/`releaseStyleSlot` (`seriesStyles.ts`)
**exactly as the comparison chart does, unmodified** — no new cycling/modulo
scheme is needed, since the filter that enables glyphs is already capped at 10
works by `WorkPicker`'s existing `MAX_SELECTED_WORKS`, so every glyph-shown work
always gets a genuinely unique slot.

### Card / list-item visual spec (tokens cited from MASTER.md)

- **List:** semantic `<ul>` (bounded, paginated list, so the ARIA `feed` pattern
  is deliberately NOT used — a plain list + pagination nav is the correct, simpler
  semantics here). Each `<li>` is a card.
- **Card container:** matches the established `.card` / controls-island pattern —
  `bg-card`, `border border-ink/12`, `rounded-lg`, padding `p-6` (MASTER "Cards /
  chart containers": flat, 1px low-opacity ink border, **no drop shadow**,
  `border-color` transition only on hover — no transform).
- **Two-column layout:** `flex flex-col gap-4 sm:grid
  sm:grid-cols-[12rem_minmax(0,1fr)]` — left column fixed, right column
  `minmax(0,1fr)` so long note prose wraps instead of widening the row (same
  defensive `minmax(0,1fr)` technique the comparison controls grid uses). Single
  column below the `sm` breakpoint.
- **Left column (work identity):**
  - **Conditional `MarkerGlyph` (Decision D5).** The glyph (from
    `frontend/src/lib/markerShapes.tsx`, `SERIES_STYLE_SLOTS[styleIndex].shape` +
    `useChartColors().series[styleIndex]` — the exact glyph the comparison legend
    uses in `ComparisonLegend.tsx`, kept visually consistent between chart and
    feed) is rendered **only when the active filter narrows the feed to 2–10
    works**. It is **omitted entirely** — title text only, no glyph, no reserved
    glyph-width gap in the layout — in both of the other states: **no filter
    (the default, all works)** and **a filter to exactly one work**. Rationale:
    the glyph's only job is helping the eye separate rows from different works
    when several are genuinely mixed together in view; with zero or one work in
    play there is nothing to separate, so showing it there would be decorative
    noise rather than reinforcement. When shown, it is `aria-hidden` (shape+color
    are redundant reinforcement; the **title text** is always the accessible
    name, in every state).
  - **This resolves the glyph-uniqueness question D1 originally raised**
    (an unfiltered author with >10 works exceeding the 10-slot style table) by
    construction: since glyphs are never rendered in the unfiltered state, and
    the only state where they DO render is already capped at 10 works by
    `WorkPicker`'s `MAX_SELECTED_WORKS`, every glyph ever shown is guaranteed
    unique. No cycling/modulo scheme, no repeat-glyph edge case, nothing further
    to document here.
  - Work title: `font-sans text-ink` (Work Sans / ink).
  - Fandoms: `text-sm text-ink-soft` (comma-joined string, as elsewhere; same
    accepted lossy-split caveat as `fandoms` — do not over-engineer).
- **Right column (the bookmark):**
  - Bookmarker name: `text-ink font-medium`. Null → "Anonymous or deleted
    bookmarker" in `italic text-ink-soft` (deleted/orphaned account —
    `parseBookmarkerName` already returns null for these).
  - Date: `<time dateTime={bookmarkedOn}>` in `font-mono text-sm text-ink-soft`
    (MASTER: dates/figures use IBM Plex Mono). Null → omit the `<time>`.
  - **Note prose (`noteHtml`):** rendered via `dangerouslySetInnerHTML={{ __html:
    sanitizeHtml(noteHtml) }}` into a `.bookmark-note` prose container —
    `font-sans text-ink`, constrained width, `break-words`. **New prose
    sub-pattern:** inline links inside notes are underlined `text-ink` (underline
    carries the affordance) rather than `text-accent`, preserving MASTER's "accent
    spent sparingly, reserved for focus rings and the one signature marker"
    discipline; links still receive the standard `--color-accent` focus ring.
    `sanitizeHtml` adds `target="_blank" rel="noopener noreferrer"` to links via a
    DOMPurify hook.
  - **Tags / Collections:** two labelled groups, each a `<ul>` of small Tailwind
    pills (`rounded-full border border-ink/15 px-2 py-0.5 text-xs text-ink-soft`)
    — no MUI/new dep. Visible group labels ("Tags", "Collections") so the two are
    distinguishable to everyone. Each group omitted entirely when empty.
  - **AO3 link:** "View this work's bookmarks on AO3" →
    `https://archiveofourown.org/works/:ao3WorkId/bookmarks`, `rel="noopener
    noreferrer" target="_blank"`, underlined text link with the accent focus ring.
- **Pagination control:** `<nav aria-label="Bookmark feed pagination">` holding
  prev/next `<button>`s and numbered page `<button>`s; the current page carries
  `aria-current="page"`; prev disabled on page 1, next disabled on the last page;
  hidden entirely when there is only one page. Buttons follow MASTER button
  tokens (color/border transitions only, visible accent focus ring, no transform).
  Page size default 25.
- **Page footnote (honesty disclaimers, `text-xs text-ink-soft`):** "Only public
  bookmarks are shown (authors can't see private bookmarks). This reflects your
  most recent capture and may be partial for heavily-bookmarked works." — encodes
  the public-only, snapshot-not-history, and possibly-truncated caveats without
  over-claiming completeness.

### States

- **Loading / no-token / query-error:** reuse `DashboardPage`'s exact patterns
  (loading `role="status"`, `TokenEntryForm`, `messageForStatsError`
  mismatch-vs-network split). Recommend a small shared wrapper/hook later (logged
  to TECH_DEBT) rather than a refactor now.
- **Default (empty selection):** NOT an empty state — shows bookmarks from **all**
  works, page 1, with the "No filter — showing bookmarks from all works" hint by
  the picker.
- **Genuinely empty (no rows to show):** reached when the displayed works (all, or
  the filtered subset) collectively yield zero displayable rows. Honest ambiguity
  message (see Corner cases C1): "No public bookmark notes found. These works may
  have no public bookmarks yet, or their bookmark details haven't been captured.
  Private bookmarks are never shown."
- **Dark mode:** every token above (`bg-card`, `text-ink`, `text-ink-soft`, glyph
  `series` colors, accent focus ring) already has a verified dark value in MASTER;
  the glyph colors come from `useChartColors()` which reactively follows
  `prefers-color-scheme`. No manual toggle.

### Storybook

`BookmarkFeedItem.stories.tsx` and `BookmarkFeed.stories.tsx` covering: populated
card, missing-name card, note-less-but-tagged card, long-note card, XSS-payload
card (shows neutralized output), unfiltered all-works default (**no glyph**),
single-work filter (**no glyph**), 2–10-work filtered subset (**glyph shown**,
per D5), genuinely-empty state, single-page (no pagination) and multi-page
states — each rendered in light and dark so `addon-a11y` scans both.

---

## 4. Corner cases (deviations from happy path, not errors)

- **C1 — zero-bookmarks vs enrichment-never-ran ambiguity.** An empty `bookmarks`
  list means EITHER the work genuinely has no public bookmarks OR Phase-2
  enrichment never ran for it. `workPageCapturedAt` is **not exposed** on
  `PerWorkSeriesType`, so the frontend cannot disambiguate. Do **not** assume
  either interpretation — the empty-state copy names both possibilities. (Logged
  to TECH_DEBT: exposing `workPageCapturedAt` would let a future version say "not
  captured yet" vs "no bookmarks" precisely.)
- **C2 — 10-work cap applies only to the active filter.** Reusing `WorkPicker`
  brings `MAX_SELECTED_WORKS = 10`, so a *filtered* selection is capped at 10
  works. The **default unfiltered feed is NOT capped** — it aggregates across all
  of the author's works regardless of count (this is the whole point of D1's
  "show all by default"). No glyph consequence to track here (D5): the
  unfiltered state never renders glyphs at all, so an author with >10 works
  never produces a glyph-uniqueness problem in the first place.
- **C3 — truncated bookmark list (`maxBookmarkPagesPerWork`).** A heavily-
  bookmarked work's stored list may be truncated at scrape time; the frontend
  can't detect this (truncation isn't exposed). Handled by the page footnote's
  "may be partial for heavily-bookmarked works" disclaimer — never imply
  exhaustiveness.
- **C4 — snapshot, not history.** `work_bookmarks` is replaced wholesale each
  capture; a note could change or vanish between captures with no history.
  Footnote's "reflects your most recent capture" covers this.
- **C5 — partial per-bookmark fields.** Any of name/note/tags/date/collections may
  be null (EXTERNAL-UNVERIFIED markup → tolerate gracefully): null name →
  "Anonymous or deleted bookmarker"; null date → omit `<time>`; empty
  tags/collections → omit that group; null note → see D2.
- **C6 — undated bookmarks in a newest-first sort.** Rows with null `bookmarkedOn`
  sort to the end; stable sort preserves scrape order within ties and among
  undated rows.
- **C7 — same work, many rows.** A work with many bookmarks produces many rows.
  When a 2–10-work filter is active (glyphs shown, D5), its glyph repeats on
  each of its own rows, visually grouping them (intended), and stays stable
  across pages (assigned from work identity, not row/page position). When no
  filter or a single-work filter is active, this is moot — no glyph renders at
  all, so there is nothing to keep stable.
- **C8 — lossy comma-split for tags/collections.** A tag literally containing ",
  " splits wrong — accepted precedent (matches `fandoms`), do not over-engineer.
- **C9 — stale persisted selection, and empty means "all".** A persisted
  `selectedWorkIds` may reference works no longer in `perWorkSeries`
  (deleted/renamed, or a different account's leftovers). Reconcile by **filtering
  to still-existing ids only** — and, critically, **do NOT fall back to the first
  work when that empties the selection** (the deliberate D1 departure from
  `useWorkComparisonStore.reconcileSelection`). An empty result stays empty and is
  interpreted downstream as "no filter — show all works." Empty is a valid,
  meaningful state here, not a degenerate one to be repaired.
- **C10 — pagination bounds after a filter change.** Changing the selection (or
  any change that shrinks the combined list) can leave the current page index out
  of range. Reset to page 1 on any selection change; additionally clamp the active
  page to the last valid page whenever the total page count drops. Hide the
  pagination nav entirely when the list fits on one page.

---

## 5. Error states

**Frontend**

- Query error (token mismatch vs network): reuse `DashboardPage`'s
  `messageForStatsError` split (ClientError → "token doesn't match"; other →
  "couldn't reach the server"); a `ClientError` clears the stored token so a
  reload lands on manual entry rather than re-firing a doomed query. Same retry
  policy (`retry: false`, already set on the shared `QueryClient`).
- Malformed `noteHtml` (unclosed tags, garbage) → DOMPurify tolerates and returns
  safe, well-formed output; never throws, never breaks the row.
- Malicious `noteHtml` (script/onerror/iframe/js: URLs) → **neutralized by
  `sanitizeHtml` before render** (see §6). This is the load-bearing error case and
  gets its own dedicated test (task T-02).
- A row that ends up with nothing displayable → dropped by `bookmarkFeed.ts` (D2),
  not rendered as an empty card.
- Out-of-range page index → clamped (C10), never renders an empty page or throws.

**Backend**

- No new backend paths. Note explicitly: the backend stores and serves `noteHtml`
  **raw and unsanitized by design** (the data model's documented choice) —
  sanitization is the frontend's mandatory responsibility, not a shared one. No
  logging/retry change.

---

## 6. Accessibility & security

**SECURITY — mandatory, non-negotiable (front and center):** every render of
`noteHtml` MUST pass through DOMPurify's `sanitize()` before reaching
`dangerouslySetInnerHTML`. This is a hard requirement from the existing TECH_DEBT
entry (2026-08-01) that first flagged rendering scraped AO3 HTML. Implementation
routes ALL sanitization through a single seam
`frontend/src/lib/sanitizeHtml.ts` (`sanitizeHtml(html: string | null): string`)
so there is exactly one audited call site, one place to configure the DOMPurify
hook (add `target="_blank" rel="noopener noreferrer"` to anchors), and one place
tests target. No component may call `dangerouslySetInnerHTML` directly with
unsanitized input. A dedicated test (T-02) asserts a payload like `<img src=x
onerror=alert(1)>` and a `<script>` tag are neutralized (no `onerror`, no
`<script>`) in the rendered output — this is a required test, not optional.

**DOMPurify dependency (out-of-stack, but user-APPROVED):**
- Add `dompurify` (latest v3.x — v3 bundles its own TypeScript types, so **no**
  `@types/dompurify` is needed; the stub `@types` package explicitly says so) to
  `frontend/package.json` `dependencies`.
- Add a **"DOMPurify" entry to `TECH_STACK.md`'s "Approved exceptions"** section,
  matching the exact what/why/approved-by(+date) structure of the Recharts /
  @axe-core/playwright / SimpleCov entries. What: client-side HTML sanitizer.
  Why: the feed renders raw scraped AO3 `noteHtml` as rich HTML; the in-stack
  alternative (strip to plain text) was explicitly rejected by the user in favor
  of safe rich rendering; no in-stack sanitizer exists. Approved: by the user,
  during Planning, 2026-08-28.

**Accessibility (a11y is a first-class planning concern here):**
- Semantic structure: page `<h1>` "{username}'s bookmark notes"; the feed is a
  `<ul>`/`<li>` list (screen readers announce item count); each card's work title
  is a real heading-or-text accessible name; the marker glyph is `aria-hidden`
  (shape+color are redundant — MASTER's "never color alone" is satisfied because
  the title text is the true identifier).
- **Pagination a11y:** `<nav aria-label="Bookmark feed pagination">`; page buttons
  are real `<button>`s; current page marked `aria-current="page"`; prev/next carry
  accessible names and are `disabled` at the bounds. On page change, the
  `role="status"` live region announces "Page X of Y — showing bookmarks A–B of
  T," and focus is kept on the activated control unless it just became disabled
  (reached a bound), in which case focus moves to the still-enabled sibling
  control (or the list heading). No focus is lost or dumped to `<body>`.
- Focus management: reuse `AppLayout`'s existing route-change focus-to-main
  behavior for arrival on the page.
- Dynamic content: selection changes, result counts, and page changes are all
  announced via a single polite `role="status"` region (same one-region
  convention as `WorkPicker`'s status region — keep it to ONE region on the page
  to avoid competing announcements).
- Links: note-prose links and the AO3 link are keyboard-focusable with a visible
  `--color-accent` focus ring; external links carry `rel="noopener noreferrer"`.
- Images inside notes: DOMPurify keeps `alt` if the author wrote one but can't
  invent one — an AO3 note image with no `alt` will have none (documented
  limitation, not a regression we can fix from here).
- Contrast: all tokens used (ink 14–15:1, ink-soft ≥4.5:1, series glyph colors
  ≥3:1 as graphical objects) are already MASTER-verified in both modes.
- e2e: add the new route to the `@axe-core/playwright` full-page scan
  (`frontend/tests/accessibility.spec.ts`) in its default (all-works), filtered,
  paginated, and genuinely-empty states.

---

## 7. Task list (test-first; one commit per item)

Ordering is dependency-first. Per this project's SDLC, Testing (stage 3) writes
the failing tests for each item (`test:` commits) and Implementation (stage 4)
makes them pass (`feat:` commits); **each numbered item is exactly one commit per
stage** (CODE_STANDARDS: one commit per completed task-list item — do not batch,
do not split). File-length budgets: `.ts` ≤400, `.tsx` ≤500, `_spec`/`.test` per
type; keep pure logic in `bookmarkFeed.ts` to keep the components under budget.
(Note: TaskCreate was unavailable in this Planning environment, so the itemized
list lives here in the plan doc, which is where Testing/Implementation/
Retrospective read scope from.)

**Foundation**

- **T-01 — DOMPurify dependency + policy.** Add `dompurify` (v3, no `@types`) to
  `frontend/package.json`; add the "DOMPurify" entry to `TECH_STACK.md` Approved
  exceptions (format per Recharts/SimpleCov). *(Impl-only; no test — proven out by
  T-02's tests.)*
- **T-02 — `sanitizeHtml` seam + tests.** `frontend/src/lib/sanitizeHtml.ts`:
  `sanitizeHtml(html: string | null): string`, wrapping DOMPurify, with a hook
  that adds `target="_blank" rel="noopener noreferrer"` to anchors. Tests:
  null/empty → ""; benign formatting (`<p>`, `<em>`, `<a>`) preserved; anchors get
  target/rel; **malicious payloads neutralized** (`<script>` removed; `<img src=x
  onerror=…>` keeps `<img>` but drops `onerror`; `javascript:` href stripped) —
  the single audited call site's own security tests.

**Data layer**

- **T-03 — extend `useStatsForUser`.** Add the `bookmarks {…}` selection to
  `STATS_FOR_USER_QUERY`; add `WorkBookmark` interface + `bookmarks:
  WorkBookmark[]` on `PerWorkSeries`. Update the query's existing test/fixtures to
  include bookmark data. Verify no `DashboardPage` regression.

**Pure feed logic**

- **T-04 — `bookmarkFeed.ts` + tests.** Pure helpers: resolve displayed works
  (**all works when `selectedWorkIds` is empty**, else the subset); flatten →
  rows (row = bookmark + owning work identity); newest-first sort with
  undated-last + stable ties; drop rows with no note AND no tags AND no collections
  (D2); build AO3 work-bookmarks URL from `ao3WorkId`; **page-slice** a sorted list
  (page size, current page → slice + total page count) with out-of-range clamping
  (C10); a `shouldShowGlyphs(displayedWorkCount): boolean` helper implementing
  Decision D5 (`true` only for 2–10 displayed works); when `true`, stable
  style-slot assignment reusing `assignStyleSlot`/`releaseStyleSlot` **unmodified**
  (no cycling scheme needed — see §2/§3, the 10-cap already guarantees uniqueness
  whenever glyphs are shown). Tests cover: empty-selection → all works; subset
  selection; sort order; undated handling; empty-row dropping; URL construction;
  page slicing + clamping; slot stability for a 2–10-work filter; `shouldShowGlyphs`
  returns `false` for 0 and 1 displayed works and `true` for 2–10.

**Persistence**

- **T-05 — `useBookmarkFeedStore` + tests.** New persisted per-username Zustand
  store mirroring `useWorkComparisonStore`'s `create()(persist(...))` +
  `byUsername` + `EMPTY_SELECTION`-identity pattern, but holding **only**
  `selectedWorkIds` (no range, no metric). Distinct localStorage key
  `ao3-stats-plus-bookmark-feed-store`. Delegates mutations to
  `comparisonSelection.ts` pure fns (add/remove/selectAll/deselectAll in fandom,
  clear). **Explicitly does NOT reconcile empty → first work** (D1). Tests:
  per-username isolation; persistence key; snapshot-stability of the empty
  fallback; **empty selection stays empty (no first-work fallback)**; independence
  from the comparison store.

**Presentation**

- **T-06 — `BookmarkFeedItem` + tests + stories.** One card: two-column layout,
  **conditional glyph rendering (D5 — a `showGlyph: boolean` prop, computed
  upstream by `shouldShowGlyphs` and passed down, not re-derived inside the
  item)**, sanitized note via `sanitizeHtml`, name/date/tags/collections/
  AO3-link, all null-field fallbacks (C5). Tests: renders each field; null
  fallbacks; **sanitized note render** (asserts neutralized XSS in the actual
  DOM); **`showGlyph=false` renders no `MarkerGlyph` element at all** (title
  only, no reserved layout gap); **`showGlyph=true` renders the glyph,
  `aria-hidden`**; `<time dateTime>`; AO3 link href + rel/target.
- **T-07 — `BookmarkFeed` + pagination + tests + stories.** The `<ul>` +
  `role="status"` + **real pagination** (numbered pages + prev/next, page size 25,
  client-side slicing) + default all-works vs filtered subset + genuinely-empty
  state (C1). Tests: empty selection renders all works; subset renders only the
  subset; newest-first order in DOM; empty-state copy names both ambiguity causes;
  pagination renders only when >1 page; page buttons/prev-next work, disable at
  bounds, mark `aria-current`; page change announces "Page X of Y…" and manages
  focus (C10 clamp + page-1 reset on selection change); **glyph visibility
  matches D5 end-to-end** — no filter renders zero `MarkerGlyph`s across the
  whole list, a single-work filter renders zero, a 2–10-work filter renders one
  per row matching each row's owning work.
- **T-08 — `BookmarkFeedPage` + tests.** Token/loading/error state machine
  (mirrors `DashboardPage`), wires `WorkPicker` (controlled) to
  `useBookmarkFeedStore`, **treats empty selection as "show all"** (no first-work
  reconcile), renders the "No filter — showing all works" hint, renders
  `BookmarkFeed`, page `<h1>` + footnote disclaimers. Tests: no-token →
  `TokenEntryForm`; loading → status; error → mismatch/network split; picker↔store
  wiring; empty selection → all works shown; selection persists independently of
  the comparison store; selection change resets to page 1.

**Routing / nav**

- **T-09 — route + nav.** Add the `/u/:username/bookmarks` route in `App.tsx`;
  extend `AppLayout` with username-scoped "Dashboard"/"Bookmarks" links via
  `useMatch`. Tests: route renders the page; nav links appear only under
  `/u/:username*`, with correct hrefs and focus styling; `App.test.tsx` updated.

**End-to-end / a11y**

- **T-10 — e2e + axe.** Extend `frontend/tests/accessibility.spec.ts` (and/or a
  feed e2e spec) to scan `/u/:username/bookmarks` in default (all-works),
  filtered, paginated, and empty states; verify the nav path dashboard→feed→
  dashboard, that pagination controls are keyboard-operable, and that a seeded XSS
  payload does not execute (no dialog/altered DOM) on the live page.

**Docs / debt**

- **T-11 — TECH_DEBT + plan status.** Append TECH_DEBT entries: deferred
  exact-bookmark permalink (with the 5-layer path); `workPageCapturedAt` exposure
  to disambiguate C1; potential separate feed query if payload grows; potential
  shared token/loading/error scaffold extraction. Confirm this plan's status is
  finalized.

### Retrospective (stage 8) should later evaluate against:

- Coverage ≥85% across the new files (`bookmarkFeed.ts`, `useBookmarkFeedStore.ts`,
  `sanitizeHtml.ts`, the two components, the page).
- The sanitization seam held: no `dangerouslySetInnerHTML` call anywhere bypasses
  `sanitizeHtml`; the XSS test exists and passes.
- The D1 default behaved as specified: empty selection = all works (never silently
  fell back to first-work), and this stayed distinct from the comparison store's
  reconcile behavior.
- Pagination stayed client-side and correct (bounds clamping, page-1 reset on
  filter change) and the client-side-hold assumption held at real account scale.
- No regression to `DashboardPage` from the shared-query extension; payload size
  didn't become a problem (or the separate-query debt item was actioned).
- The feed's persistence stayed genuinely independent of the comparison store (no
  shared key, no cross-contamination).
- Whether the deferred permalink / `workPageCapturedAt` debt items are being
  addressed or just accumulating.

---

## 8. Infra / hosting cost estimate — N/A

No new paid infrastructure. Frontend-only feature on the existing Render
deployment; one new client-side dependency (DOMPurify, MIT, no runtime cost). No
new backend resource, no new managed service, no bandwidth/compute tier change.

---

## Decisions resolved

All five resolved by direct user answer — no open decisions remain.

- **D1 — first-visit default: NO filter, show ALL works** (newest-bookmark-first,
  the same sort as the filtered view). This is a **deliberate departure** from
  `useWorkComparisonStore`'s "empty → fall back to first work" convention: the
  feed's job is showing activity across the whole account by default, unlike the
  comparison charts which need an initial focus to render anything meaningful.
  Concretely: `useBookmarkFeedStore` does **not** reconcile empty→first-work;
  empty `selectedWorkIds` stays empty and means "no filter, show all"; the feed's
  flatten step expands empty selection to all works; picker copy reads "No filter
  — showing bookmarks from all works." (The default unfiltered feed is uncapped
  and can include >10 works — see D5, which resolves the glyph-uniqueness
  question this would otherwise raise.)
- **D2 — note-less bookmarks: SHOW** a row if it has note OR tags OR collections;
  drop only fully-empty rows. (As originally recommended.)
- **D3 — volume handling: REAL pagination** (discrete numbered pages + prev/next),
  client-side/dependency-free — slice the already-fetched, already-filtered,
  already-sorted list into pages of 25. Server-side pagination is not needed at
  personal-tool scale (the query already fetches per-work bookmark lists); the
  client-side-hold assumption is stated explicitly in §2.
- **D4 — AO3 link: SHIP** the per-work "View this work's bookmarks on AO3" link
  now (from `ao3WorkId`); true per-bookmark permalinks stay deferred and logged in
  TECH_DEBT.
- **D5 — marker glyph is conditional on filter width (confirmed 2026-08-30,
  direct user instruction, given after D1–D4 were already locked).** Exact user
  words: "when no filter or a filter to only one work is in place, do not
  display the glyph, only display the name." Concretely: **no glyph** — title
  only — when `selectedWorkIds` is empty (D1's all-works default) or has exactly
  one entry; **glyph shown** only when the filter narrows the feed to 2–10 works,
  the one case where it actually helps distinguish rows from different works
  sharing the view. This is a clean, deliberate simplification of D1's original
  consequence: since glyphs never render in the unfiltered state, and the only
  state where they DO render is already hard-capped at 10 works by `WorkPicker`,
  the mod-10 glyph-cycling scheme D1 originally required is no longer needed at
  all — removed from scope rather than built. `bookmarkFeed.ts`'s
  `shouldShowGlyphs` helper (T-04) is the single source of truth for this rule;
  `BookmarkFeedItem` (T-06) takes it as a plain `showGlyph` prop rather than
  re-deriving it, so the rule lives in exactly one place.
