import type { PerWorkSeries } from "../queries/useStatsForUser";
import { assignStyleSlot } from "./seriesStyles";

// Pure logic layer for the bookmark notes feed (docs/plans/bookmark-notes-
// feed.md §3/T-04), kept out of the components so the whole flatten/sort/
// drop/paginate/glyph pipeline is unit-testable without rendering, and to
// respect the 400-line .ts budget.

export const DEFAULT_PAGE_SIZE = 25;

// One flattened row = one bookmark, carrying its owning work's identity
// alongside every per-bookmark field, unchanged.
export interface BookmarkFeedRow {
  workId: number;
  workTitle: string;
  workFandoms: string;
  bookmarkerName: string | null;
  noteHtml: string | null;
  bookmarkerTags: string[];
  bookmarkedOn: string | null;
  collections: string[];
  ao3WorkBookmarksUrl: string;
}

// C9/D1 (Review-flagged fix, 2026-09-14): filters selectedWorkIds down to
// ids that still exist in `works`. Returns [] both for a literally empty
// selection AND for a non-empty-but-fully-stale one (every id references a
// work no longer present, e.g. deleted/renamed since) - the two are
// deliberately indistinguishable downstream, per C9's own wording ("an
// empty result stays empty and is interpreted downstream as 'no filter -
// show all works'"). This is the single source of truth for "is a filter
// genuinely active," used both to resolve which works display and to size
// Decision D5's glyph-visibility rule - a partial-stale selection (e.g.
// [2, 999] where only 2 still exists) still reconciles to a real, non-empty
// filter ([2]), correctly staying distinct from the fully-stale case.
export function reconcileSelectedWorkIds(
  works: PerWorkSeries[],
  selectedWorkIds: number[],
): number[] {
  if (selectedWorkIds.length === 0) return [];
  const available = new Set(works.map((w) => w.ao3WorkId));
  return selectedWorkIds.filter((id) => available.has(id));
}

// D1: empty (or fully-stale, C9) selectedWorkIds means "no filter, show ALL
// works" - a deliberate departure from useWorkComparisonStore's empty-
// means-fallback-to-first-work convention (see plan §Decisions D1); this
// feed's fallback target is always "all works," never "first work."
export function resolveDisplayedWorks(
  works: PerWorkSeries[],
  selectedWorkIds: number[],
): PerWorkSeries[] {
  const reconciled = reconcileSelectedWorkIds(works, selectedWorkIds);
  if (reconciled.length === 0) return works;
  const selected = new Set(reconciled);
  return works.filter((w) => selected.has(w.ao3WorkId));
}

// D4: the in-scope substitute for a true per-bookmark permalink (deferred,
// see TECH_DEBT.md) - links to the work's own public bookmarks page.
export function buildAo3WorkBookmarksUrl(ao3WorkId: number): string {
  return `https://archiveofourown.org/works/${ao3WorkId}/bookmarks`;
}

// Maintenance fix (2026-09-15): bookmarkerTags/collections arrive on the
// wire as a single ", "-joined scalar string, or null when empty - the same
// comma-joined-string precedent as `fandoms` (groupWorksByFandom.ts's
// splitFandoms), confirmed against WorkBookmarkType's `String, null: true`
// fields and the ingest service's `Array(...).join(", ").presence`. Split
// here, once, at the flatten boundary, so every downstream consumer
// (dropEmptyRows, BookmarkFeedItem's pill lists) works with real arrays.
// Same lossy-split caveat as `fandoms` applies (C8): a tag/collection name
// literally containing ", " splits wrong - accepted, not over-engineered.
function parseCommaList(value: string | null): string[] {
  if (!value) return [];
  return value.split(", ");
}

export function flattenWorksToRows(works: PerWorkSeries[]): BookmarkFeedRow[] {
  const rows: BookmarkFeedRow[] = [];
  for (const work of works) {
    const ao3WorkBookmarksUrl = buildAo3WorkBookmarksUrl(work.ao3WorkId);
    for (const bookmark of work.bookmarks) {
      rows.push({
        workId: work.ao3WorkId,
        workTitle: work.title,
        workFandoms: work.fandoms,
        bookmarkerName: bookmark.bookmarkerName,
        noteHtml: bookmark.noteHtml,
        bookmarkerTags: parseCommaList(bookmark.bookmarkerTags),
        bookmarkedOn: bookmark.bookmarkedOn,
        collections: parseCommaList(bookmark.collections),
        ao3WorkBookmarksUrl,
      });
    }
  }
  return rows;
}

// Newest bookmarkedOn first; C6: undated rows (null bookmarkedOn) sort to
// the end. A stable sort preserves original scrape order both among exact-
// date ties and among undated rows.
export function sortRowsNewestFirst(rows: BookmarkFeedRow[]): BookmarkFeedRow[] {
  return [...rows].sort((a, b) => {
    if (a.bookmarkedOn === b.bookmarkedOn) return 0;
    if (a.bookmarkedOn === null) return 1;
    if (b.bookmarkedOn === null) return -1;
    return a.bookmarkedOn > b.bookmarkedOn ? -1 : 1;
  });
}

// D2: show a row if it has a note OR tags OR collections; drop only rows
// with nothing displayable at all. An empty-string note is treated the
// same as null (C5) - neither carries displayable content on its own.
export function dropEmptyRows(rows: BookmarkFeedRow[]): BookmarkFeedRow[] {
  return rows.filter(
    (row) => !!row.noteHtml || row.bookmarkerTags.length > 0 || row.collections.length > 0,
  );
}

export interface PaginationResult<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
}

// D3: client-side page-slicing with C10 out-of-range clamping (below 1 up
// to 1; above the last page down to the last page). An empty list still
// reports exactly one (empty) page, never zero.
export function paginate<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), currentPage, totalPages };
}

export type PageWindowItem = number | "ellipsis";

// Item 6 (TECH_DEBT.md 2026-09-14 Review finding/2026-09-22): windows the
// page-number buttons instead of rendering one per page at any scale -
// user's exact spec is first page, last page, and the current page with up
// to 2 pages before/after it (5 consecutive numbers around current), with a
// non-interactive ellipsis marker between non-adjacent groups. Built as a
// sorted-unique-set-with-gap-detection rather than hand-branching the
// near-start/near-end/middle cases separately, so the boundary conditions
// (current page 1 or 2, or within 2 of the last page) fall out correctly
// without special-casing - a gap of exactly 1 never gets an ellipsis (it's
// just the next consecutive number), any bigger gap does.
export function buildPageWindow(currentPage: number, totalPages: number): PageWindowItem[] {
  // A current±2 window can miss a page near the OPPOSITE edge from current
  // even when the total is small (e.g. current=1 of 5: window [1..3] plus
  // the forced-included last page 5 skips page 4) - but 5 or fewer pages
  // never needs windowing at all, regardless of which page is current, so
  // short-circuit before the gap-detection logic below can ever see that
  // false gap.
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const windowStart = Math.max(1, currentPage - 2);
  const windowEnd = Math.min(totalPages, currentPage + 2);
  const pages = new Set<number>([1, totalPages]);
  for (let page = windowStart; page <= windowEnd; page++) pages.add(page);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: PageWindowItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(sorted[i]);
  }
  return result;
}

// Decision D5: the marker glyph is shown only when the active filter
// narrows the feed to 2-10 displayed works - never for the unfiltered
// default (0 here means "no filter", since resolveDisplayedWorks always
// returns >=1 work in the unfiltered case, but this helper is defensive
// either way) or a single-work filter, and never above the 10-work cap
// (the unfiltered default can exceed it, C2).
export function shouldShowGlyphs(displayedWorkCount: number): boolean {
  return displayedWorkCount >= 2 && displayedWorkCount <= 10;
}

// Stable per-work style-slot assignment, reusing assignStyleSlot/
// seriesStyles.ts EXACTLY as the comparison chart does - no new cycling/
// modulo scheme needed, since shouldShowGlyphs only returns true when the
// displayed-work count is already capped at 10 by WorkPicker's
// MAX_SELECTED_WORKS, guaranteeing every glyph-shown work gets a unique
// slot (C7: stays stable across rows/pages, keyed by work identity).
export function buildGlyphStyleAssignment(workIds: number[]): Map<number, number> {
  let assignment = new Map<number, number>();
  for (const workId of workIds) {
    assignment = assignStyleSlot(assignment, workId);
  }
  return assignment;
}
