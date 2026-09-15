import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PerWorkSeries, WorkBookmark } from "../queries/useStatsForUser";
import { BookmarkFeed } from "./BookmarkFeed";

// BookmarkFeed composes bookmarkFeed.ts's pure helpers (resolve displayed
// works -> flatten -> drop-empty -> sort -> paginate, plus Decision D5's
// glyph visibility rule) into the rendered <ul>/pagination/empty-state
// (docs/plans/bookmark-notes-feed.md §3, task T-07). This file covers
// filtering, sort order, the empty state, and glyph visibility end-to-end;
// pagination/focus-management coverage lives in
// BookmarkFeed.pagination.test.ts (mirroring this codebase's established
// pattern of splitting large component suites by concern, e.g.
// WorkComparisonSection.*.test.tsx). The component does not exist yet -
// every test below is expected to fail on import alone.
function bookmark(overrides: Partial<WorkBookmark> = {}): WorkBookmark {
  return {
    bookmarkerName: "reader",
    noteHtml: "<p>Loved it</p>",
    bookmarkerTags: [],
    bookmarkedOn: "2026-01-01",
    collections: [],
    ...overrides,
  };
}

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "Fandom One",
    points: [],
    bookmarks: [],
    ...overrides,
  };
}

describe("BookmarkFeed", () => {
  describe("filtering (Decision D1: empty selection means 'no filter, show all')", () => {
    it("renders bookmarks from every work when selectedWorkIds is empty", () => {
      const works = [
        work({ ao3WorkId: 1, bookmarks: [bookmark({ bookmarkerName: "Alice" })] }),
        work({ ao3WorkId: 2, bookmarks: [bookmark({ bookmarkerName: "Bob" })] }),
      ];

      render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("renders bookmarks only from the selected subset when a filter is active", () => {
      const works = [
        work({ ao3WorkId: 1, bookmarks: [bookmark({ bookmarkerName: "Alice" })] }),
        work({ ao3WorkId: 2, bookmarks: [bookmark({ bookmarkerName: "Bob" })] }),
      ];

      render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[2]} />);

      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    // Review-flagged regression (C9/D1, 2026-09-14): a persisted selection
    // that no longer matches ANY currently-displayed work (e.g. the
    // selected works were deleted/renamed since) must fall back to "no
    // filter, show all" identically to a genuinely empty selection - not
    // resolve to zero displayed works/the genuinely-empty state. Also
    // asserts the knock-on glyph consequence in the same test (rather than
    // a separate one that would pass vacuously today, since the row-level
    // bug alone already yields zero rows/zero glyphs): once
    // resolveDisplayedWorks is fixed to fall back to all works here, this
    // component's own glyph-width computation must ALSO treat the fully-
    // stale case as "no active filter," or it would wrongly show glyphs for
    // what D1/D5 both treat as the unfiltered default.
    it("renders bookmarks from every work, with zero glyphs, when selectedWorkIds is non-empty but every id is stale (C9/D1)", () => {
      const works = [
        work({ ao3WorkId: 1, bookmarks: [bookmark({ bookmarkerName: "Alice" })] }),
        work({ ao3WorkId: 2, bookmarks: [bookmark({ bookmarkerName: "Bob" })] }),
      ];

      const { container } = render(
        <BookmarkFeed perWorkSeries={works} selectedWorkIds={[9998, 9999]} />,
      );

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(0);
    });
  });

  describe("sort order (newest bookmarkedOn first, as a flat cross-work list)", () => {
    it("renders rows from different works interleaved newest-first, not grouped by work", () => {
      const works = [
        work({
          ao3WorkId: 1,
          title: "Work A",
          bookmarks: [bookmark({ bookmarkerName: "Oldest", bookmarkedOn: "2026-01-01" })],
        }),
        work({
          ao3WorkId: 2,
          title: "Work B",
          bookmarks: [bookmark({ bookmarkerName: "Newest", bookmarkedOn: "2026-03-01" })],
        }),
      ];

      render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);

      const names = screen.getAllByText(/^(Oldest|Newest)$/).map((el) => el.textContent);
      expect(names).toEqual(["Newest", "Oldest"]);
    });
  });

  describe("empty states", () => {
    // C1: the frontend cannot disambiguate "genuinely no public bookmarks"
    // from "enrichment never ran" - the copy must name both possibilities,
    // not assert either one confidently.
    it("names both ambiguity causes when every displayed work has zero bookmarks (C1)", () => {
      const works = [work({ ao3WorkId: 1, bookmarks: [] })];

      render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);

      expect(screen.getByText(/no public bookmark notes found/i)).toBeInTheDocument();
      expect(screen.getByText(/no public bookmarks yet/i)).toBeInTheDocument();
      expect(screen.getByText(/haven't been captured/i)).toBeInTheDocument();
      expect(screen.getByText(/private bookmarks are never shown/i)).toBeInTheDocument();
    });

    // D2: a bookmark with no note AND no tags AND no collections is dropped
    // entirely, so a work whose only bookmarks are all fully-empty also
    // reaches the genuinely-empty state, not an empty-looking populated one.
    it("reaches the genuinely-empty state when every bookmark is fully empty (D2 drops them all)", () => {
      const works = [
        work({
          ao3WorkId: 1,
          bookmarks: [bookmark({ noteHtml: null, bookmarkerTags: [], collections: [] })],
        }),
      ];

      render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);

      expect(screen.getByText(/no public bookmark notes found/i)).toBeInTheDocument();
    });

    it("does not render the empty-state message when at least one displayable row exists", () => {
      const works = [work({ ao3WorkId: 1, bookmarks: [bookmark()] })];

      render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);

      expect(screen.queryByText(/no public bookmark notes found/i)).not.toBeInTheDocument();
    });
  });

  describe("the combined list is a semantic <ul>", () => {
    it("renders the feed as a <ul> with one <li> per bookmark row", () => {
      const works = [
        work({
          ao3WorkId: 1,
          bookmarks: [bookmark({ bookmarkerName: "Alice" }), bookmark({ bookmarkerName: "Bob" })],
        }),
      ];

      const { container } = render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[]} />);

      const list = screen.getByRole("list");
      expect(list.tagName).toBe("UL");
      expect(container.querySelectorAll("li")).toHaveLength(2);
    });
  });

  // Decision D5: no glyph for the unfiltered default (even with several
  // works, C2) or a single-work filter; exactly one glyph per row, matching
  // each row's owning work, only for a 2-10-work active filter.
  describe("glyph visibility end-to-end (Decision D5)", () => {
    function threeWorks(): PerWorkSeries[] {
      return [
        work({ ao3WorkId: 1, bookmarks: [bookmark({ bookmarkerName: "Alice" })] }),
        work({ ao3WorkId: 2, bookmarks: [bookmark({ bookmarkerName: "Bob" })] }),
        work({ ao3WorkId: 3, bookmarks: [bookmark({ bookmarkerName: "Cara" })] }),
      ];
    }

    it("renders zero glyphs for the unfiltered default, even across multiple works (C2)", () => {
      const { container } = render(
        <BookmarkFeed perWorkSeries={threeWorks()} selectedWorkIds={[]} />,
      );

      expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(0);
    });

    it("renders zero glyphs for a single-work filter", () => {
      const { container } = render(
        <BookmarkFeed perWorkSeries={threeWorks()} selectedWorkIds={[1]} />,
      );

      expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(0);
    });

    it("renders exactly one glyph per row for a 2-10-work filter", () => {
      const { container } = render(
        <BookmarkFeed perWorkSeries={threeWorks()} selectedWorkIds={[1, 2]} />,
      );

      // Only works 1 and 2 are in the filtered subset (one bookmark each).
      expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    });

    it("gives every row from the same work the identical glyph fill color, and different works different colors, within a 2-10-work filter", () => {
      const works = [
        work({
          ao3WorkId: 1,
          bookmarks: [bookmark({ bookmarkerName: "Alice" }), bookmark({ bookmarkerName: "Amy" })],
        }),
        work({ ao3WorkId: 2, bookmarks: [bookmark({ bookmarkerName: "Bob" })] }),
      ];

      const { container } = render(<BookmarkFeed perWorkSeries={works} selectedWorkIds={[1, 2]} />);

      const glyphs = Array.from(container.querySelectorAll('svg[aria-hidden="true"]'));
      expect(glyphs).toHaveLength(3);
      const fills = glyphs.map((glyph) => glyph.querySelector("[fill]")?.getAttribute("fill"));
      // The two Work 1 rows (Alice, Amy) share one color; Work 2's row (Bob)
      // has a different one - C7's "same work, many rows -> repeated,
      // stable glyph" requirement.
      expect(fills[0]).toBe(fills[1]);
      expect(fills[0]).not.toBe(fills[2]);
    });
  });
});
