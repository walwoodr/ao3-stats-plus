import { describe, expect, it } from "vitest";
import type { PerWorkSeries, WorkBookmark } from "../queries/useStatsForUser";
import {
  DEFAULT_PAGE_SIZE,
  buildAo3WorkBookmarksUrl,
  buildGlyphStyleAssignment,
  dropEmptyRows,
  flattenWorksToRows,
  paginate,
  resolveDisplayedWorks,
  shouldShowGlyphs,
  sortRowsNewestFirst,
  type BookmarkFeedRow,
} from "./bookmarkFeed";

// bookmarkFeed.ts is the pure-logic module docs/plans/bookmark-notes-feed.md
// §3/T-04 keeps OUT of the components, to respect the 400-line .ts budget
// and so the whole flatten/sort/drop/paginate/glyph pipeline is unit-
// testable without rendering anything. None of these functions exist yet
// (Testing precedes Implementation) - every test below is expected to fail
// on import alone.
function bookmark(overrides: Partial<WorkBookmark> = {}): WorkBookmark {
  return {
    bookmarkerName: "reader",
    noteHtml: "<p>Loved it</p>",
    bookmarkerTags: null,
    bookmarkedOn: "2026-01-01",
    collections: null,
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

describe("resolveDisplayedWorks (D1: empty selection means 'no filter, show all')", () => {
  const works = [work({ ao3WorkId: 1 }), work({ ao3WorkId: 2 }), work({ ao3WorkId: 3 })];

  it("returns every work when selectedWorkIds is empty", () => {
    expect(resolveDisplayedWorks(works, [])).toEqual(works);
  });

  it("returns only the selected subset when selectedWorkIds is non-empty", () => {
    const result = resolveDisplayedWorks(works, [2]);
    expect(result.map((w) => w.ao3WorkId)).toEqual([2]);
  });

  it("returns a multi-work subset matching every selected id (C2: filtered selection isn't capped by this function)", () => {
    const result = resolveDisplayedWorks(works, [1, 3]);
    expect(result.map((w) => w.ao3WorkId).sort()).toEqual([1, 3]);
  });

  it("ignores a selected id that no longer exists in perWorkSeries (C9: stale ids filtered, not errored)", () => {
    const result = resolveDisplayedWorks(works, [2, 999]);
    expect(result.map((w) => w.ao3WorkId)).toEqual([2]);
  });

  // Review-flagged fix (2026-09-14, confirmed by code read against
  // frontend/src/lib/bookmarkFeed.ts): a persisted selectedWorkIds that is
  // non-empty but references ONLY stale ids (none still exist in
  // perWorkSeries - e.g. the selected works were deleted/renamed) must fall
  // back to "no filter, show all works" identically to a genuinely empty
  // selection (C9: "Reconcile by filtering to still-existing ids only ...
  // An empty result stays empty and is interpreted downstream as 'no
  // filter - show all works.'"). Previously this resolved to zero displayed
  // works instead, which downstream renders as the genuinely-empty state
  // rather than D1's unfiltered default - a real bug, not a hypothetical.
  it("falls back to ALL works when selectedWorkIds is non-empty but every id is stale (C9/D1: fully-stale selection is NOT the same as 'zero works selected')", () => {
    const result = resolveDisplayedWorks(works, [998, 999]);

    expect(result).toEqual(works);
    // Same rows, same order as the genuinely-empty-selection case - the two
    // inputs must be indistinguishable downstream.
    expect(result).toEqual(resolveDisplayedWorks(works, []));
  });

  it("does not cap the unfiltered default even past 10 works (C2)", () => {
    const manyWorks = Array.from({ length: 12 }, (_, i) => work({ ao3WorkId: i + 1 }));
    expect(resolveDisplayedWorks(manyWorks, [])).toHaveLength(12);
  });
});

describe("buildAo3WorkBookmarksUrl (D4: per-work bookmarks-page link)", () => {
  it("builds the public bookmarks-page URL for a work from its ao3WorkId", () => {
    expect(buildAo3WorkBookmarksUrl(12345)).toBe(
      "https://archiveofourown.org/works/12345/bookmarks",
    );
  });
});

describe("flattenWorksToRows (one row per bookmark, carrying owning-work identity)", () => {
  it("produces one row per bookmark across every displayed work", () => {
    const works = [
      work({ ao3WorkId: 1, title: "Work A", bookmarks: [bookmark(), bookmark()] }),
      work({ ao3WorkId: 2, title: "Work B", bookmarks: [bookmark()] }),
    ];

    const rows = flattenWorksToRows(works);

    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.workId === 1)).toHaveLength(2);
    expect(rows.filter((r) => r.workId === 2)).toHaveLength(1);
  });

  it("carries the owning work's title, fandoms, and a built AO3 bookmarks-page URL on each row", () => {
    const works = [
      work({
        ao3WorkId: 42,
        title: "The Long Way Home",
        fandoms: "Fandom One, Fandom Two",
        bookmarks: [bookmark()],
      }),
    ];

    const [row] = flattenWorksToRows(works);

    expect(row.workId).toBe(42);
    expect(row.workTitle).toBe("The Long Way Home");
    expect(row.workFandoms).toBe("Fandom One, Fandom Two");
    expect(row.ao3WorkBookmarksUrl).toBe("https://archiveofourown.org/works/42/bookmarks");
  });

  it("carries every per-bookmark field onto the row, splitting the wire's comma-joined tags/collections strings", () => {
    const works = [
      work({
        ao3WorkId: 1,
        bookmarks: [
          bookmark({
            bookmarkerName: "reader123",
            noteHtml: "<p>hi</p>",
            bookmarkerTags: "favorite",
            bookmarkedOn: "2026-02-01",
            collections: "Staff Picks",
          }),
        ],
      }),
    ];

    const [row] = flattenWorksToRows(works);

    expect(row.bookmarkerName).toBe("reader123");
    expect(row.noteHtml).toBe("<p>hi</p>");
    expect(row.bookmarkerTags).toEqual(["favorite"]);
    expect(row.bookmarkedOn).toBe("2026-02-01");
    expect(row.collections).toEqual(["Staff Picks"]);
  });

  it("returns an empty array when every displayed work has an empty bookmarks list", () => {
    const works = [work({ ao3WorkId: 1, bookmarks: [] }), work({ ao3WorkId: 2, bookmarks: [] })];

    expect(flattenWorksToRows(works)).toEqual([]);
  });
});

// Maintenance regression (2026-09-15): the backend's WorkBookmarkType
// exposes bookmarker_tags/collections as nullable SCALAR strings (comma-
// joined, matching the same wire-shape precedent as `fandoms` -
// groupWorksByFandom.ts's splitFandoms), NOT arrays - confirmed against
// backend/app/graphql/types/work_bookmark_type.rb (`field :bookmarker_tags,
// String, null: true`) and the ingest service
// (`Array(...).join(", ").presence`, which yields nil for an empty list -
// the common "bare bookmark" case on real AO3, no note/no own tags/no
// collection). flattenWorksToRows previously assumed these fields already
// arrived as string[] and copied them straight onto the row unchanged; a
// bare bookmark's null value then crashed dropEmptyRows's `.length` check,
// blanking the entire feed (no error boundary exists in the app to contain
// it) for every real-world author with ordinary, note-less bookmarks -
// exactly the reported "works with bookmarks DO NOT show bookmarks" bug.
describe("flattenWorksToRows: comma-joined-string bookmarkerTags/collections from the real backend contract", () => {
  it("does not throw and produces empty arrays for a bare bookmark (null tags/collections on the wire)", () => {
    const works = [
      work({
        ao3WorkId: 1,
        bookmarks: [
          bookmark({
            noteHtml: null,
            bookmarkerTags: null,
            collections: null,
          }),
        ],
      }),
    ];

    expect(() => flattenWorksToRows(works)).not.toThrow();
    const [row] = flattenWorksToRows(works);
    expect(row.bookmarkerTags).toEqual([]);
    expect(row.collections).toEqual([]);
  });

  it("splits a single comma-joined bookmarkerTags string into individual tags", () => {
    const works = [
      work({
        ao3WorkId: 1,
        bookmarks: [bookmark({ bookmarkerTags: "fluff, hurt/comfort" })],
      }),
    ];

    const [row] = flattenWorksToRows(works);
    expect(row.bookmarkerTags).toEqual(["fluff", "hurt/comfort"]);
  });

  it("splits a single comma-joined collections string into individual collection names", () => {
    const works = [
      work({
        ao3WorkId: 1,
        bookmarks: [bookmark({ collections: "Collection A, Collection B" })],
      }),
    ];

    const [row] = flattenWorksToRows(works);
    expect(row.collections).toEqual(["Collection A", "Collection B"]);
  });

  it("a bare bookmark (null note/tags/collections on the wire) is dropped by dropEmptyRows without throwing", () => {
    const works = [
      work({
        ao3WorkId: 1,
        bookmarks: [
          bookmark({
            noteHtml: null,
            bookmarkerTags: null,
            collections: null,
          }),
        ],
      }),
    ];

    expect(() => dropEmptyRows(flattenWorksToRows(works))).not.toThrow();
    expect(dropEmptyRows(flattenWorksToRows(works))).toEqual([]);
  });
});

describe("sortRowsNewestFirst (newest bookmarkedOn first; undated last, stable within ties)", () => {
  function row(overrides: Partial<BookmarkFeedRow> & { workId: number }): BookmarkFeedRow {
    return {
      workTitle: `Work ${overrides.workId}`,
      workFandoms: "",
      bookmarkerName: "reader",
      noteHtml: "<p>hi</p>",
      bookmarkerTags: [],
      bookmarkedOn: "2026-01-01",
      collections: [],
      ao3WorkBookmarksUrl: `https://archiveofourown.org/works/${overrides.workId}/bookmarks`,
      ...overrides,
    };
  }

  it("sorts newest bookmarkedOn first", () => {
    const rows = [
      row({ workId: 1, bookmarkedOn: "2026-01-01" }),
      row({ workId: 2, bookmarkedOn: "2026-03-01" }),
      row({ workId: 3, bookmarkedOn: "2026-02-01" }),
    ];

    const sorted = sortRowsNewestFirst(rows);

    expect(sorted.map((r) => r.bookmarkedOn)).toEqual(["2026-03-01", "2026-02-01", "2026-01-01"]);
  });

  // C6: undated rows sort to the end, stable ordering among themselves and
  // relative to their original scrape order within ties.
  it("sorts rows with a null bookmarkedOn to the very end", () => {
    const rows = [
      row({ workId: 1, bookmarkedOn: null }),
      row({ workId: 2, bookmarkedOn: "2026-01-01" }),
      row({ workId: 3, bookmarkedOn: null }),
    ];

    const sorted = sortRowsNewestFirst(rows);

    expect(sorted[0].bookmarkedOn).toBe("2026-01-01");
    expect(sorted.slice(1).every((r) => r.bookmarkedOn === null)).toBe(true);
  });

  it("preserves original relative order (stable sort) among rows with the exact same bookmarkedOn", () => {
    const rows = [
      row({ workId: 1, bookmarkedOn: "2026-01-01" }),
      row({ workId: 2, bookmarkedOn: "2026-01-01" }),
      row({ workId: 3, bookmarkedOn: "2026-01-01" }),
    ];

    const sorted = sortRowsNewestFirst(rows);

    expect(sorted.map((r) => r.workId)).toEqual([1, 2, 3]);
  });

  it("preserves original relative order (stable sort) among undated rows", () => {
    const rows = [row({ workId: 1, bookmarkedOn: null }), row({ workId: 2, bookmarkedOn: null })];

    const sorted = sortRowsNewestFirst(rows);

    expect(sorted.map((r) => r.workId)).toEqual([1, 2]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ workId: 1, bookmarkedOn: "2026-01-01" }),
      row({ workId: 2, bookmarkedOn: "2026-03-01" }),
    ];
    const original = [...rows];

    sortRowsNewestFirst(rows);

    expect(rows).toEqual(original);
  });
});

describe("dropEmptyRows (D2: show a row with note OR tags OR collections; drop fully-empty rows)", () => {
  function row(overrides: Partial<BookmarkFeedRow> & { workId: number }): BookmarkFeedRow {
    return {
      workTitle: `Work ${overrides.workId}`,
      workFandoms: "",
      bookmarkerName: "reader",
      noteHtml: null,
      bookmarkerTags: [],
      bookmarkedOn: "2026-01-01",
      collections: [],
      ao3WorkBookmarksUrl: `https://archiveofourown.org/works/${overrides.workId}/bookmarks`,
      ...overrides,
    };
  }

  it("keeps a row with a note", () => {
    const rows = [row({ workId: 1, noteHtml: "<p>hi</p>" })];
    expect(dropEmptyRows(rows)).toHaveLength(1);
  });

  it("keeps a note-less row that has tags", () => {
    const rows = [row({ workId: 1, noteHtml: null, bookmarkerTags: ["favorite"] })];
    expect(dropEmptyRows(rows)).toHaveLength(1);
  });

  it("keeps a note-less, tag-less row that has collections", () => {
    const rows = [row({ workId: 1, noteHtml: null, collections: ["Staff Picks"] })];
    expect(dropEmptyRows(rows)).toHaveLength(1);
  });

  it("drops a row with no note AND no tags AND no collections", () => {
    const rows = [row({ workId: 1, noteHtml: null, bookmarkerTags: [], collections: [] })];
    expect(dropEmptyRows(rows)).toEqual([]);
  });

  // C5: an empty-string note is not meaningfully different from a null one -
  // both carry no displayable content on their own.
  it("treats an empty-string noteHtml the same as null for the drop decision", () => {
    const rows = [row({ workId: 1, noteHtml: "", bookmarkerTags: [], collections: [] })];
    expect(dropEmptyRows(rows)).toEqual([]);
  });

  it("keeps some rows and drops others from a mixed list", () => {
    const rows = [
      row({ workId: 1, noteHtml: "<p>hi</p>" }),
      row({ workId: 2, noteHtml: null, bookmarkerTags: [], collections: [] }),
      row({ workId: 3, collections: ["Staff Picks"] }),
    ];

    expect(dropEmptyRows(rows).map((r) => r.workId)).toEqual([1, 3]);
  });
});

describe("paginate (D3: client-side page-slicing with out-of-range clamping)", () => {
  function items(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  it("slices the requested page at the given page size", () => {
    const result = paginate(items(30), 1, 25);
    expect(result.items).toEqual(items(25));
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it("slices the second page correctly, including a short final page", () => {
    const result = paginate(items(30), 2, 25);
    expect(result.items).toEqual(items(30).slice(25));
    expect(result.currentPage).toBe(2);
  });

  it("reports exactly one page when everything fits", () => {
    const result = paginate(items(10), 1, 25);
    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual(items(10));
  });

  it("reports one page (not zero) for an empty list", () => {
    const result = paginate([], 1, 25);
    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual([]);
  });

  // C10: clamps a page index that's out of range (e.g. left over from a
  // filter change that shrank the list) to the last valid page, rather than
  // throwing or returning an empty slice for an in-bounds-looking request.
  it("clamps a too-high page index down to the last valid page", () => {
    const result = paginate(items(30), 99, 25);
    expect(result.currentPage).toBe(2);
    expect(result.items).toEqual(items(30).slice(25));
  });

  it("clamps a page index below 1 up to page 1", () => {
    const result = paginate(items(30), 0, 25);
    expect(result.currentPage).toBe(1);
    expect(result.items).toEqual(items(25));
  });

  it("exposes the default page size as 25 (plan-specified default)", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
  });
});

describe("shouldShowGlyphs (Decision D5: glyphs only for a 2-10-work active filter)", () => {
  it("returns false for 0 displayed works (the unfiltered default, D1)", () => {
    expect(shouldShowGlyphs(0)).toBe(false);
  });

  it("returns false for exactly 1 displayed work (a single-work filter)", () => {
    expect(shouldShowGlyphs(1)).toBe(false);
  });

  it("returns true for 2 displayed works", () => {
    expect(shouldShowGlyphs(2)).toBe(true);
  });

  it("returns true for 10 displayed works (the WorkPicker cap)", () => {
    expect(shouldShowGlyphs(10)).toBe(true);
  });

  // Not reachable through a real filtered selection (WorkPicker caps at 10),
  // but the unfiltered default CAN exceed 10 (C2) - shouldShowGlyphs must
  // still resolve sensibly rather than assume displayedWorkCount <= 10.
  it("returns false for displayed-work counts above 10 (defensive - the unfiltered default can exceed the cap, C2)", () => {
    expect(shouldShowGlyphs(11)).toBe(false);
    expect(shouldShowGlyphs(50)).toBe(false);
  });
});

describe("buildGlyphStyleAssignment (stable per-work style slots, reusing seriesStyles.ts unmodified)", () => {
  it("assigns a distinct style-slot index to each displayed work", () => {
    const assignment = buildGlyphStyleAssignment([10, 20, 30]);

    expect(assignment.get(10)).toBeDefined();
    expect(assignment.get(20)).toBeDefined();
    expect(assignment.get(30)).toBeDefined();
    const indices = [assignment.get(10), assignment.get(20), assignment.get(30)];
    expect(new Set(indices).size).toBe(3);
  });

  // C7: a work's glyph stays the same across every row it owns (assigned
  // from work identity, not row/page position) - this is really an
  // assertion that the SAME workId always maps to the SAME slot within one
  // assignment, which is what makes repeated per-row lookups stable.
  it("is keyed by work identity, so repeated lookups for the same workId return the same slot", () => {
    const assignment = buildGlyphStyleAssignment([10, 20]);

    expect(assignment.get(10)).toBe(assignment.get(10));
  });

  // The 10-work cap on any active filter (WorkPicker's MAX_SELECTED_WORKS)
  // guarantees every glyph-shown work gets a genuinely unique slot - no
  // cycling/modulo scheme needed (plan §3/§D5).
  it("assigns a unique slot to all 10 works when a filter is at the cap", () => {
    const workIds = Array.from({ length: 10 }, (_, i) => i + 1);
    const assignment = buildGlyphStyleAssignment(workIds);

    expect(new Set(assignment.values()).size).toBe(10);
  });
});
