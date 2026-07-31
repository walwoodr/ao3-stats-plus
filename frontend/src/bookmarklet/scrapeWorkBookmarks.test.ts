import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchAllWorkBookmarks, parseWorkBookmarksPage } from "./scrapeWorkBookmarks";

// scrapeWorkBookmarks parses a single AO3 /works/:id/bookmarks page (public
// bookmarks only - an inherent AO3 limitation the plan accepts) and follows
// its "next" pagination up to a caller-supplied page cap, aggregating every
// page's bookmarks into one list. Network/timeout/abort concerns belong to
// the fan-out orchestrator (fanOut.ts, task 7) - fetchAllWorkBookmarks here
// just takes an injected fetchPage function and handles pagination-following
// + the page cap, so this spec exercises pure parsing/pagination logic with
// no real network involved.
//
// EXTERNAL-UNVERIFIED: every fixture this spec loads carries its own header
// comment flagging that its markup shape is modeled on general community
// knowledge of AO3's rendered /works/:id/bookmarks template, not verified
// against a live AO3 page - see each fixture file and TECH_DEBT.md.
function loadFixture(name: string): Document {
  const html = readFileSync(join(__dirname, "fixtures", name), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("parseWorkBookmarksPage", () => {
  describe("a page with two full bookmarks and a next link", () => {
    const doc = loadFixture("work-bookmarks-page1.html");
    const result = parseWorkBookmarksPage(doc);

    it("parses both bookmarks on the page", () => {
      expect(result.bookmarks).toHaveLength(2);
    });

    it("parses the bookmarker name, note, tags, date, and collections for the first bookmark", () => {
      expect(result.bookmarks[0]).toEqual({
        bookmarkerName: "avid_reader",
        noteHtml: "<p>Loved this so much!</p>",
        bookmarkerTags: ["fluff"],
        bookmarkedOn: "2024-05-01",
        collections: ["Collection A"],
      });
    });

    it("parses more than one tag and defaults collections to an empty list when absent", () => {
      expect(result.bookmarks[1]).toEqual({
        bookmarkerName: "second_reader",
        noteHtml: "<p>Can't wait for the next chapter.</p>",
        bookmarkerTags: ["hurt/comfort", "wip"],
        bookmarkedOn: "2024-05-02",
        collections: [],
      });
    });

    it("reports hasNextPage: true when a rel=next pagination link is present", () => {
      expect(result.hasNextPage).toBe(true);
    });
  });

  describe("a page with a deleted/orphaned bookmarker and no note", () => {
    const doc = loadFixture("work-bookmarks-page2.html");
    const result = parseWorkBookmarksPage(doc);

    it("parses bookmarkerName as null rather than dropping the row", () => {
      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].bookmarkerName).toBeNull();
    });

    it("parses noteHtml as null when no note was left", () => {
      expect(result.bookmarks[0].noteHtml).toBeNull();
    });

    it("defaults bookmarkerTags to an empty list when the tags list is empty", () => {
      expect(result.bookmarks[0].bookmarkerTags).toEqual([]);
    });
  });

  describe("the last page (no next link)", () => {
    it("reports hasNextPage: false", () => {
      const doc = loadFixture("work-bookmarks-page3-last.html");
      const result = parseWorkBookmarksPage(doc);

      expect(result.hasNextPage).toBe(false);
    });
  });

  describe("an empty bookmarks list", () => {
    it("returns an empty bookmarks array and hasNextPage: false, not an error", () => {
      const doc = loadFixture("work-bookmarks-empty.html");
      const result = parseWorkBookmarksPage(doc);

      expect(result).toEqual({ bookmarks: [], hasNextPage: false });
    });
  });

  describe("an unparseable bookmark date", () => {
    it("returns bookmarkedOn: null rather than failing the whole page's parse", () => {
      const doc = loadFixture("work-bookmarks-unparseable-date.html");
      const result = parseWorkBookmarksPage(doc);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].bookmarkedOn).toBeNull();
    });
  });
});

describe("fetchAllWorkBookmarks", () => {
  const page1 = loadFixture("work-bookmarks-page1.html");
  const page2 = loadFixture("work-bookmarks-page2.html");
  const page3 = loadFixture("work-bookmarks-page3-last.html");

  function fetchPageStub(pages: Document[]) {
    return vi.fn((page: number) => Promise.resolve(pages[page - 1]));
  }

  describe("following pagination across a multi-page fixture set", () => {
    it("aggregates every page's bookmarks into one list", async () => {
      const fetchPage = fetchPageStub([page1, page2, page3]);

      const result = await fetchAllWorkBookmarks(fetchPage, { maxPages: 10 });

      expect(result.bookmarks).toHaveLength(4);
    });

    it("stops following pagination once a page reports hasNextPage: false", async () => {
      const fetchPage = fetchPageStub([page1, page2, page3]);

      const result = await fetchAllWorkBookmarks(fetchPage, { maxPages: 10 });

      expect(fetchPage).toHaveBeenCalledTimes(3);
      expect(result.truncated).toBe(false);
      expect(result.pagesFetched).toBe(3);
    });

    it("fetches pages in ascending order starting from page 1", async () => {
      const fetchPage = fetchPageStub([page1, page2, page3]);

      await fetchAllWorkBookmarks(fetchPage, { maxPages: 10 });

      expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
    });
  });

  describe("page-cap truncation behavior", () => {
    it("stops at the page cap and reports truncated: true when more pages remained", async () => {
      const fetchPage = fetchPageStub([page1, page2, page3]);

      const result = await fetchAllWorkBookmarks(fetchPage, { maxPages: 2 });

      expect(fetchPage).toHaveBeenCalledTimes(2);
      expect(result.truncated).toBe(true);
      expect(result.pagesFetched).toBe(2);
      // Only the first two pages' bookmarks (2 + 1) - page 3's single
      // bookmark must not be silently included despite existing.
      expect(result.bookmarks).toHaveLength(3);
    });

    it("does not report truncated when the cap is reached on exactly the last page", async () => {
      const fetchPage = fetchPageStub([page1, page2, page3]);

      const result = await fetchAllWorkBookmarks(fetchPage, { maxPages: 3 });

      expect(result.truncated).toBe(false);
      expect(result.bookmarks).toHaveLength(4);
    });
  });

  describe("a single-page, empty result", () => {
    it("returns an empty bookmarks list, not truncated, having fetched exactly one page", async () => {
      const empty = loadFixture("work-bookmarks-empty.html");
      const fetchPage = fetchPageStub([empty]);

      const result = await fetchAllWorkBookmarks(fetchPage, { maxPages: 25 });

      expect(result).toEqual({ bookmarks: [], truncated: false, pagesFetched: 1 });
    });
  });
});
