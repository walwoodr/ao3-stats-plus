import { describe, expect, it } from "vitest";
import { dropEmptyRows, flattenWorksToRows, sortRowsNewestFirst } from "./bookmarkFeed";
import { bookmark, row, work } from "./bookmarkFeedTestSupport";

// Sort/drop slice of bookmarkFeed.ts's pure-logic test suite, split out of
// the original bookmarkFeed.test.ts (CODE_STANDARDS.md's 400-line .ts
// budget - see bookmarkFeedTestSupport.ts's header comment).

describe("sortRowsNewestFirst (newest bookmarkedOn first; undated last, stable within ties)", () => {
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
      row({ workId: 3, noteHtml: null, collections: ["Staff Picks"] }),
    ];

    expect(dropEmptyRows(rows).map((r) => r.workId)).toEqual([1, 3]);
  });

  // Maintenance regression companion (see bookmarkFeed.filtering.test.ts's
  // "comma-joined-string" describe block for the flattenWorksToRows half of
  // this fix) - a bare bookmark (null note/tags/collections on the wire)
  // must flow through flattenWorksToRows -> dropEmptyRows without throwing.
  it("a bare bookmark (null note/tags/collections on the wire) is dropped without throwing, end to end from flattenWorksToRows", () => {
    const works = [
      work({
        ao3WorkId: 1,
        bookmarks: [bookmark({ noteHtml: null, bookmarkerTags: null, collections: null })],
      }),
    ];

    expect(() => dropEmptyRows(flattenWorksToRows(works))).not.toThrow();
    expect(dropEmptyRows(flattenWorksToRows(works))).toEqual([]);
  });
});
