import { describe, expect, it } from "vitest";
import {
  buildAo3WorkBookmarksUrl,
  flattenWorksToRows,
  resolveDisplayedWorks,
} from "./bookmarkFeed";
import { bookmark, work } from "./bookmarkFeedTestSupport";

// Filtering/flattening slice of bookmarkFeed.ts's pure-logic test suite,
// split out of the original bookmarkFeed.test.ts (CODE_STANDARDS.md's
// 400-line .ts budget - see bookmarkFeedTestSupport.ts's header comment).

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
});
