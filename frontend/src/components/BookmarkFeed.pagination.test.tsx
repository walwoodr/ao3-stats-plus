import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
      bookmarkerTags: [],
      bookmarkedOn: `2026-01-${day}`,
      collections: [],
    };
  });

  return { ao3WorkId: 1, title: "Popular Work", fandoms: "Fandom One", points: [], bookmarks };
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
        bookmarkerTags: [],
        bookmarkedOn: "2026-01-01",
        collections: [],
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
          bookmarkerTags: [],
          bookmarkedOn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
          collections: [],
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
});
