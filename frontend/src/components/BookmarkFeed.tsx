import { useEffect, useMemo, useRef, useState } from "react";
import type { PerWorkSeries } from "../queries/useStatsForUser";
import {
  DEFAULT_PAGE_SIZE,
  buildGlyphStyleAssignment,
  buildPageWindow,
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

// Item 6 (TECH_DEBT.md 2026-09-14/2026-09-22): aria-current="page" is
// already a11y-correct on the current-page button, but every button shared
// PAGE_BUTTON_CLASSES with no visual difference. Reuses MASTER.md's own
// `.btn-primary` treatment (filled ink background, paper text) rather than
// `--color-accent` - accent is documented as "spent sparingly" (one CTA/the
// lead-in marker/focus rings), and a page indicator isn't a CTA.
const CURRENT_PAGE_BUTTON_CLASSES =
  "rounded-md border border-ink bg-ink px-3 py-1 text-sm font-semibold text-paper transition-colors duration-200 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Item 5 (TECH_DEBT.md 2026-09-22): land the user at the top of the page
// after any pagination click. AppLayout's own route-change "scroll to top"
// is focus-based (moves focus to <main>), but reusing that here would fight
// this component's own focus-retention rules (focus must stay on the
// clicked control, or move to its still-enabled sibling) - a plain
// window.scrollTo is used instead, independent of focus.
function scrollFeedToTop(): void {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

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
              scrollFeedToTop();
              setPage(paginated.currentPage - 1);
            }}
          >
            Previous
          </button>
          {buildPageWindow(paginated.currentPage, paginated.totalPages).map((entry, index) =>
            entry === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="px-1 text-sm text-ink-soft"
              >
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className={
                  entry === paginated.currentPage
                    ? CURRENT_PAGE_BUTTON_CLASSES
                    : PAGE_BUTTON_CLASSES
                }
                aria-current={entry === paginated.currentPage ? "page" : undefined}
                onClick={() => {
                  scrollFeedToTop();
                  setPage(entry);
                }}
              >
                {entry}
              </button>
            ),
          )}
          <button
            ref={nextButtonRef}
            type="button"
            className={PAGE_BUTTON_CLASSES}
            disabled={paginated.currentPage === paginated.totalPages}
            onClick={() => {
              lastActionRef.current = "next";
              scrollFeedToTop();
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
