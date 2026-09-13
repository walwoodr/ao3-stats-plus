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

// D1: empty selectedWorkIds means "no filter, show ALL works" - a
// deliberate departure from useWorkComparisonStore's empty-means-fallback
// convention (see plan §Decisions D1). C9: stale ids (works no longer in
// perWorkSeries) are silently filtered out, never errored.
export function resolveDisplayedWorks(
  works: PerWorkSeries[],
  selectedWorkIds: number[],
): PerWorkSeries[] {
  if (selectedWorkIds.length === 0) return works;
  const selected = new Set(selectedWorkIds);
  return works.filter((w) => selected.has(w.ao3WorkId));
}

// D4: the in-scope substitute for a true per-bookmark permalink (deferred,
// see TECH_DEBT.md) - links to the work's own public bookmarks page.
export function buildAo3WorkBookmarksUrl(ao3WorkId: number): string {
  return `https://archiveofourown.org/works/${ao3WorkId}/bookmarks`;
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
        bookmarkerTags: bookmark.bookmarkerTags,
        bookmarkedOn: bookmark.bookmarkedOn,
        collections: bookmark.collections,
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
