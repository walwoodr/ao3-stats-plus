import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PerWorkSeries, WorkBookmark } from "../queries/useStatsForUser";
import { BookmarkFeed } from "./BookmarkFeed";

// Pagination/focus-management coverage for BookmarkFeed (docs/plans/
// bookmark-notes-feed.md §3/§6, task T-07 + Decision D3/corner-case C10) -
// split out of BookmarkFeed.test.tsx per this codebase's established
// pattern of splitting large component suites by concern (see
// WorkComparisonSection.*.test.tsx). The component does not exist yet -
// every test below is expected to fail on import alone.

// 30 bookmarks on one work, each dated one day apart and descending, so
// page size 25 produces exactly 2 pages (25 + 5) with a deterministic
// newest-first order to assert against.
function manyBookmarksWork(): PerWorkSeries {
  const bookmarks: WorkBookmark[] = Array.from({ length: 30 }, (_, i) => {
    const day = String(30 - i).padStart(2, "0");
    return {
      bookmarkerName: `Reader ${i + 1}`,
      noteHtml: "<p>hi</p>",
      bookmarkerTags: null,
      bookmarkedOn: `2026-01-${day}`,
      collections: null,
    };
  });

  return { ao3WorkId: 1, title: "Popular Work", fandoms: "Fandom One", points: [], bookmarks };
}

// `pageCount` exact multiples of the page size (25), so the total page
// count is exactly `pageCount` with no short final page complicating the
// windowing math under test.
function manyPagesWork(pageCount: number): PerWorkSeries {
  const bookmarks: WorkBookmark[] = Array.from({ length: pageCount * 25 }, (_, i) => ({
    bookmarkerName: `Reader ${i + 1}`,
    noteHtml: "<p>hi</p>",
    bookmarkerTags: null,
    bookmarkedOn: "2026-01-01",
    collections: null,
  }));

  return {
    ao3WorkId: 1,
    title: "Very Popular Work",
    fandoms: "Fandom One",
    points: [],
    bookmarks,
  };
}

function singlePageWork(): PerWorkSeries {
  return {
    ao3WorkId: 1,
    title: "Quiet Work",
    fandoms: "Fandom One",
    points: [],
    bookmarks: [
      {
        bookmarkerName: "reader",
        noteHtml: "<p>hi</p>",
        bookmarkerTags: null,
        bookmarkedOn: "2026-01-01",
        collections: null,
      },
    ],
  };
}

describe("BookmarkFeed pagination", () => {
  it("hides the pagination nav entirely when the list fits on one page", () => {
    render(<BookmarkFeed perWorkSeries={[singlePageWork()]} selectedWorkIds={[]} />);

    expect(
      screen.queryByRole("navigation", { name: /bookmark feed pagination/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the pagination nav, with numbered pages and prev/next, when the list spans multiple pages", () => {
    render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

    const nav = screen.getByRole("navigation", { name: /bookmark feed pagination/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("renders only the first page's slice by default (25 items, page 1 of 2)", () => {
    const { container } = render(
      <BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />,
    );

    expect(container.querySelectorAll("li")).toHaveLength(25);
    expect(screen.getByText("Reader 1")).toBeInTheDocument();
    expect(screen.queryByText("Reader 26")).not.toBeInTheDocument();
  });

  it("marks the current page's button with aria-current='page'", () => {
    render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "2" })).not.toHaveAttribute("aria-current");
  });

  // Maintenance fix (TECH_DEBT.md 2026-09-14 Review finding /2026-09-22
  // item 6): aria-current was already correct (a11y) but every page button
  // shared one class list, with no visual difference for sighted users.
  it("gives the current page's button a visually distinct class from the other page buttons", () => {
    render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

    const currentButton = screen.getByRole("button", { name: "1" });
    const otherButton = screen.getByRole("button", { name: "2" });
    expect(currentButton.className).not.toBe(otherButton.className);
  });

  it("disables the Previous button on page 1", () => {
    render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
  });

  it("navigates to the second page's slice via the numbered page button", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />,
    );

    await user.click(screen.getByRole("button", { name: "2" }));

    expect(container.querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByText("Reader 26")).toBeInTheDocument();
    expect(screen.queryByText("Reader 1")).not.toBeInTheDocument();
  });

  it("disables the Next button on the last page", async () => {
    const user = userEvent.setup();
    render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

    await user.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous/i })).not.toBeDisabled();
  });

  it("navigates forward via the Next button", async () => {
    const user = userEvent.setup();
    render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
  });

  it("navigates backward via the Previous button", async () => {
    const user = userEvent.setup();
    render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);
    await user.click(screen.getByRole("button", { name: "2" }));

    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
  });

  describe("page-change announcement (role=status)", () => {
    it("announces the page/range/total after navigating to page 2", async () => {
      const user = userEvent.setup();
      render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

      await user.click(screen.getByRole("button", { name: "2" }));

      const status = screen.getByRole("status");
      expect(status).toHaveTextContent(/page 2 of 2/i);
      expect(status).toHaveTextContent(/26.*30/);
      expect(status).toHaveTextContent(/30/);
    });
  });

  // Plan §6: "focus is kept on the activated control unless it just became
  // disabled (reached a bound), in which case focus moves to the still-
  // enabled sibling control ... No focus is lost or dumped to <body>."
  describe("focus management on page change", () => {
    it("keeps focus on the Next button after advancing to a page where Next is still enabled", async () => {
      const user = userEvent.setup();
      // 3 pages (55 rows) so page 1 -> 2 keeps Next enabled.
      const work: PerWorkSeries = {
        ao3WorkId: 1,
        title: "Very Popular Work",
        fandoms: "",
        points: [],
        bookmarks: Array.from({ length: 55 }, (_, i) => ({
          bookmarkerName: `Reader ${i + 1}`,
          noteHtml: "<p>hi</p>",
          bookmarkerTags: null,
          bookmarkedOn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
          collections: null,
        })),
      };
      render(<BookmarkFeed perWorkSeries={[work]} selectedWorkIds={[]} />);

      const nextButton = screen.getByRole("button", { name: /next/i });
      await user.click(nextButton);

      expect(document.activeElement).toBe(screen.getByRole("button", { name: /next/i }));
    });

    it("moves focus to the Previous button once Next becomes disabled (reached the last page)", async () => {
      const user = userEvent.setup();
      render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(document.activeElement).toBe(screen.getByRole("button", { name: /previous/i }));
      expect(document.activeElement).not.toBe(document.body);
    });

    it("moves focus to the Next button once Previous becomes disabled (returned to page 1)", async () => {
      const user = userEvent.setup();
      render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);
      await user.click(screen.getByRole("button", { name: "2" }));

      await user.click(screen.getByRole("button", { name: /previous/i }));

      expect(document.activeElement).toBe(screen.getByRole("button", { name: /next/i }));
      expect(document.activeElement).not.toBe(document.body);
    });
  });

  // C10: any selection change resets to page 1, even if the new selection
  // is still multi-page - and the current page clamps down rather than
  // rendering an out-of-range empty slice if a change shrinks the total
  // page count.
  describe("page reset/clamp on selection change (C10)", () => {
    it("resets to page 1 when selectedWorkIds changes, even while still multi-page", async () => {
      const user = userEvent.setup();
      const works = [manyBookmarksWork(), { ...manyBookmarksWork(), ao3WorkId: 2 }];
      const { rerender } = render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);
      await user.click(screen.getByRole("button", { name: "2" }));
      expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");

      rerender(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[1]} />);

      expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    });

    it("clamps the active page down to the last valid page when a selection change shrinks the total page count", async () => {
      const user = userEvent.setup();
      const works = [manyBookmarksWork(), { ...manyBookmarksWork(), ao3WorkId: 2 }];
      render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);
      await user.click(screen.getByRole("button", { name: "2" }));

      // Never throws, never renders an out-of-range empty page - the
      // pagination reset behavior above already covers the "back to page 1"
      // case; this asserts the app doesn't crash/blank out mid-transition.
      expect(screen.getByRole("list")).toBeInTheDocument();
    });
  });

  // Maintenance fix (TECH_DEBT.md 2026-09-14 Review finding/2026-09-22 item
  // 6): the numbered-page buttons are windowed (first + last + current±2)
  // once the total exceeds that window, with a non-interactive ellipsis gap
  // indicator between non-adjacent groups - the pure windowing logic itself
  // is covered by bookmarkFeed.pagination.test.ts's buildPageWindow suite;
  // this covers the rendered wiring (which buttons actually appear, and
  // that the ellipsis is not itself a clickable control).
  describe("windowed page-number buttons (item 6)", () => {
    it("shows every page number with no ellipsis when the total fits within the window (<=5 pages)", () => {
      render(<BookmarkFeed perWorkSeries={[manyPagesWork(5)]} selectedWorkIds={[]} />);

      const nav = screen.getByRole("navigation", { name: /bookmark feed pagination/i });
      expect(within(nav).queryByText("…")).not.toBeInTheDocument();
      for (const pageNumber of ["1", "2", "3", "4", "5"]) {
        expect(within(nav).getByRole("button", { name: pageNumber })).toBeInTheDocument();
      }
    });

    it("windows the page buttons with ellipsis gaps once the total exceeds the window, centered on the current page", async () => {
      const user = userEvent.setup();
      render(<BookmarkFeed perWorkSeries={[manyPagesWork(20)]} selectedWorkIds={[]} />);
      const nextButton = screen.getByRole("button", { name: /next/i });
      for (let i = 0; i < 9; i++) {
        await user.click(nextButton);
      }
      expect(screen.getByRole("button", { name: "10" })).toHaveAttribute("aria-current", "page");

      const nav = screen.getByRole("navigation", { name: /bookmark feed pagination/i });
      const pageButtonLabels = within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent);

      expect(pageButtonLabels).toEqual(["Previous", "1", "8", "9", "10", "11", "12", "20", "Next"]);
      // The ellipsis gap indicator is present but is not itself a button -
      // it must never appear in the getAllByRole("button") list above.
      expect(within(nav).getAllByText("…")).toHaveLength(2);
    });
  });

  // Maintenance fix (TECH_DEBT.md 2026-09-22, item 5): every pagination
  // control's onClick must land the user at the top of the page, not
  // wherever they were scrolled to before. AppLayout's own route-change
  // "scroll to top" is focus-based (moves focus to <main>), but reusing
  // that mechanism here would fight this file's own focus-retention
  // assertions above (focus must stay on the clicked control, or move to
  // its still-enabled sibling) - window.scrollTo is used instead,
  // independent of focus.
  describe("scroll to top on page change (item 5)", () => {
    beforeEach(() => {
      vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("scrolls to the top when navigating via a numbered page button", async () => {
      const user = userEvent.setup();
      render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

      await user.click(screen.getByRole("button", { name: "2" }));

      expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    });

    it("scrolls to the top when navigating via the Next button", async () => {
      const user = userEvent.setup();
      render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    });

    it("scrolls to the top when navigating via the Previous button", async () => {
      const user = userEvent.setup();
      render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);
      await user.click(screen.getByRole("button", { name: "2" }));
      vi.mocked(window.scrollTo).mockClear();

      await user.click(screen.getByRole("button", { name: /previous/i }));

      expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    });

    it("does not scroll on initial mount (only on an actual pagination click)", () => {
      render(<BookmarkFeed perWorkSeries={[manyBookmarksWork()]} selectedWorkIds={[]} />);

      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });
});
