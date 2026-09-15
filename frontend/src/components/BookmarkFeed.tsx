import { useEffect, useMemo, useRef, useState } from "react";
import type { PerWorkSeries } from "../queries/useStatsForUser";
import {
  DEFAULT_PAGE_SIZE,
  buildGlyphStyleAssignment,
  dropEmptyRows,
  flattenWorksToRows,
  paginate,
  reconcileSelectedWorkIds,
  resolveDisplayedWorks,
  shouldShowGlyphs,
  sortRowsNewestFirst,
} from "../lib/bookmarkFeed";
import { SERIES_STYLE_SLOTS } from "../lib/seriesStyles";
import { useChartColors } from "../lib/useChartColors";
import { BookmarkFeedItem } from "./BookmarkFeedItem";

export interface BookmarkFeedProps {
  perWorkSeries: PerWorkSeries[];
  selectedWorkIds: number[];
}

const EMPTY_STATE_MESSAGE =
  "No public bookmark notes found. These works may have no public bookmarks " +
  "yet, or their bookmark details haven't been captured. Private bookmarks " +
  "are never shown.";

const PAGE_BUTTON_CLASSES =
  "rounded-md border border-ink/12 px-3 py-1 text-sm text-ink transition-colors duration-200 hover:border-ink/24 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

// Composes bookmarkFeed.ts's pure pipeline (resolve displayed works ->
// flatten -> drop-empty -> sort -> paginate, plus Decision D5's glyph-
// visibility rule) into the rendered <ul>/pagination/empty-state
// (docs/plans/bookmark-notes-feed.md §3, T-07).
export function BookmarkFeed({ perWorkSeries, selectedWorkIds }: BookmarkFeedProps) {
  const [page, setPage] = useState(1);
  const colors = useChartColors();
  const prevButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const lastActionRef = useRef<"prev" | "next" | null>(null);

  // C10: any selection change resets pagination to page 1. Adjusted during
  // render (React's documented "adjusting state when a prop changes"
  // pattern - https://react.dev/learn/you-might-not-need-an-effect) rather
  // than in an effect, to avoid the extra render pass an effect-based reset
  // would cause.
  const [prevSelectedWorkIds, setPrevSelectedWorkIds] = useState(selectedWorkIds);
  if (selectedWorkIds !== prevSelectedWorkIds) {
    setPrevSelectedWorkIds(selectedWorkIds);
    setPage(1);
  }

  const displayedWorks = useMemo(
    () => resolveDisplayedWorks(perWorkSeries, selectedWorkIds),
    [perWorkSeries, selectedWorkIds],
  );

  const rows = useMemo(
    () => sortRowsNewestFirst(dropEmptyRows(flattenWorksToRows(displayedWorks))),
    [displayedWorks],
  );

  // Decision D5's glyph-width input: the RECONCILED filter width, not raw
  // selectedWorkIds.length or displayedWorks.length. This is 0 both for a
  // literally empty selection and a fully-stale one (C9/D1 - both mean "no
  // active filter," so glyphs must stay off for either), while a partial-
  // stale selection still correctly sizes to its surviving ids.
  const filterWidth = useMemo(
    () => reconcileSelectedWorkIds(perWorkSeries, selectedWorkIds).length,
    [perWorkSeries, selectedWorkIds],
  );
  const showGlyphs = shouldShowGlyphs(filterWidth);
  const glyphAssignment = useMemo(
    () => (showGlyphs ? buildGlyphStyleAssignment(displayedWorks.map((w) => w.ao3WorkId)) : null),
    [showGlyphs, displayedWorks],
  );

  const paginated = paginate(rows, page, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (lastActionRef.current === "next" && paginated.currentPage === paginated.totalPages) {
      prevButtonRef.current?.focus();
    } else if (lastActionRef.current === "prev" && paginated.currentPage === 1) {
      nextButtonRef.current?.focus();
    }
    lastActionRef.current = null;
  }, [paginated.currentPage, paginated.totalPages]);

  if (rows.length === 0) {
    return (
      <div>
        <p role="status" className="text-sm text-ink-soft">
          {EMPTY_STATE_MESSAGE}
        </p>
      </div>
    );
  }

  const rangeStart = (paginated.currentPage - 1) * DEFAULT_PAGE_SIZE + 1;
  const rangeEnd = rangeStart + paginated.items.length - 1;
  const statusMessage =
    `Page ${paginated.currentPage} of ${paginated.totalPages} — showing bookmarks ` +
    `${rangeStart}–${rangeEnd} of ${rows.length}.`;

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {statusMessage}
      </p>

      <ul className="flex flex-col gap-4">
        {paginated.items.map((row, index) => {
          const styleIndex = glyphAssignment?.get(row.workId);
          const glyphShape =
            styleIndex !== undefined ? SERIES_STYLE_SLOTS[styleIndex].shape : undefined;
          const glyphColor = styleIndex !== undefined ? colors.series[styleIndex] : undefined;
          return (
            <BookmarkFeedItem
              key={`${row.workId}-${row.bookmarkerName ?? "anon"}-${row.bookmarkedOn ?? "undated"}-${index}`}
              workTitle={row.workTitle}
              workFandoms={row.workFandoms}
              bookmarkerName={row.bookmarkerName}
              noteHtml={row.noteHtml}
              bookmarkerTags={row.bookmarkerTags}
              bookmarkedOn={row.bookmarkedOn}
              collections={row.collections}
              ao3WorkBookmarksUrl={row.ao3WorkBookmarksUrl}
              showGlyph={showGlyphs}
              glyphShape={glyphShape}
              glyphColor={glyphColor}
            />
          );
        })}
      </ul>

      {paginated.totalPages > 1 && (
        <nav aria-label="Bookmark feed pagination" className="flex items-center gap-2">
          <button
            ref={prevButtonRef}
            type="button"
            className={PAGE_BUTTON_CLASSES}
            disabled={paginated.currentPage === 1}
            onClick={() => {
              lastActionRef.current = "prev";
              setPage(paginated.currentPage - 1);
            }}
          >
            Previous
          </button>
          {Array.from({ length: paginated.totalPages }, (_, i) => i + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={PAGE_BUTTON_CLASSES}
              aria-current={pageNumber === paginated.currentPage ? "page" : undefined}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            ref={nextButtonRef}
            type="button"
            className={PAGE_BUTTON_CLASSES}
            disabled={paginated.currentPage === paginated.totalPages}
            onClick={() => {
              lastActionRef.current = "next";
              setPage(paginated.currentPage + 1);
            }}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
