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
// Every non-empty fixture here is a trimmed, structurally-faithful excerpt
// of real HTML fetched live from https://archiveofourown.org/works/85527071/bookmarks
// (pages 1-4) on 2026-09-21 - see each fixture's header comment and
// scrapeWorkBookmarks.ts's header comment for what was verified and how.
// This supersedes two earlier passes that trusted unverified secondary
// sources (otwcode/otwarchive's GitHub source, the Pagy gem's own source)
// instead of live-fetched markup and got several selectors wrong as a
// result - see TECH_DEBT.md's 2026-09-21 entry.
function loadFixture(name: string): Document {
  const html = readFileSync(join(__dirname, "fixtures", name), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("parseWorkBookmarksPage", () => {
  describe("page 1 (real excerpt): a leading work-summary card plus a bare bookmark and two noted ones", () => {
    const doc = loadFixture("work-bookmarks-page1.html");
    const result = parseWorkBookmarksPage(doc);

    // The regression this guards: ol.bookmark.index.group's first child is
    // the WORK's own summary card (role="article" like a real bookmark
    // item, but class="work blurb group..." not "user short blurb
    // group..."). If the outer selector ever regressed to matching on
    // role="article" alone (or any class shape broad enough to catch that
    // card), this length would be 4, not 3, and the first bookmark row
    // would have bogus data read from the work card's own p.datetime.
    it("finds exactly the 3 real bookmark items, excluding the leading work-summary card", () => {
      expect(result.bookmarks).toHaveLength(3);
    });

    it("parses a genuinely bare bookmark (no note/tags/collections blocks in the DOM)", () => {
      expect(result.bookmarks[0]).toEqual({
        bookmarkerName: "Astra__3",
        noteHtml: null,
        bookmarkerTags: [],
        bookmarkedOn: "2026-09-15",
        collections: [],
      });
    });

    it("parses a real Bookmark Notes: block's noteHtml", () => {
      expect(result.bookmarks[1]).toEqual({
        bookmarkerName: "msilverstar",
        noteHtml:
          "<p>Such an oblique and Ilya-esque approach, and the tone is perfectly baffled but hopeful.</p>",
        bookmarkerTags: [],
        bookmarkedOn: "2026-06-22",
        collections: [],
      });
    });

    it("parses a second real note independently", () => {
      expect(result.bookmarks[2].noteHtml).toBe("<p>Hilarious</p>");
    });

    it("reports hasNextPage: true (page 1's real nav has an active href-bearing li.next > a)", () => {
      expect(result.hasNextPage).toBe(true);
    });
  });

  describe("page 2 (real excerpt): real Bookmark Tags:/Bookmark Collections: markup", () => {
    const doc = loadFixture("work-bookmarks-page2.html");
    const result = parseWorkBookmarksPage(doc);

    it("parses all 3 real bookmark items", () => {
      expect(result.bookmarks).toHaveLength(3);
    });

    it("parses a single real bookmarker tag", () => {
      expect(result.bookmarks[0]).toEqual({
        bookmarkerName: "gm03",
        noteHtml: null,
        bookmarkerTags: ["TBR"],
        bookmarkedOn: "2026-06-06",
        collections: [],
      });
    });

    it("parses multiple real bookmarker tags from one list", () => {
      expect(result.bookmarks[1].bookmarkerTags).toEqual(["O", "—", "TBR"]);
    });

    it("parses a real Bookmark Collections: block", () => {
      expect(result.bookmarks[2]).toEqual({
        bookmarkerName: "soongandroid",
        noteHtml: null,
        bookmarkerTags: [],
        bookmarkedOn: "2026-05-28",
        collections: ["heated rivalry highlights"],
      });
    });

    it("reports hasNextPage: true", () => {
      expect(result.hasNextPage).toBe(true);
    });
  });

  describe("page 3/last (real excerpt of this work's actual final page)", () => {
    const doc = loadFixture("work-bookmarks-page3-last.html");
    const result = parseWorkBookmarksPage(doc);

    it("parses both real bookmark items", () => {
      expect(result.bookmarks).toHaveLength(2);
      expect(result.bookmarks[0].noteHtml).toBe("<p>3:20am, Tuesday</p>");
      expect(result.bookmarks[1].bookmarkerTags).toEqual(["Complete"]);
    });

    // The real last-page li.next contains a <span class="disabled">, not
    // an href-less <a> - confirms parseHasNextPage's structural check
    // against the actual markup AO3 serves, not a guessed shape.
    it("reports hasNextPage: false", () => {
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

  // AO3's byline is EXPECTED to render with no <a> for a deleted/orphaned
  // account (general AO3 convention), but this was NOT observed in any of
  // the ~60 real bookmark items fetched live this session - flagged in
  // TECH_DEBT.md as unconfirmed. Tested here with synthetic markup (built
  // on the otherwise-confirmed real item/byline shape) rather than
  // presented as a "real excerpt" fixture, so the distinction stays honest.
  describe("bookmarkerName for a byline with no <a> (synthetic - deleted-account rendering unconfirmed live)", () => {
    it("returns null rather than an empty string or throwing", () => {
      const doc = new DOMParser().parseFromString(
        `<ol class="bookmark index group">
          <li class="user short blurb group user-1" role="article">
            <div class="header module">
              <h5 class="byline heading">Bookmarked by [deleted account]</h5>
              <p class="datetime">01 Jan 2026</p>
            </div>
          </li>
        </ol>`,
        "text/html",
      );

      const result = parseWorkBookmarksPage(doc);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].bookmarkerName).toBeNull();
    });
  });

  // Regression coverage for parseHasNextPage's structural detection, using
  // synthetic markup that mirrors the confirmed-real `ol.pagination.actions.pagy`
  // shape (see work-bookmarks-page1/page3-last.html for the real-fixture
  // versions of the true/false cases respectively) plus explicit checks
  // against the two shapes earlier, unverified passes wrongly assumed.
  describe("parseHasNextPage's structural detection (synthetic markup)", () => {
    function docWithBody(navHtml: string): Document {
      return new DOMParser().parseFromString(
        `<ol class="bookmark index group"></ol>${navHtml}`,
        "text/html",
      );
    }

    it("is true when li.next contains a real href-bearing <a>", () => {
      const doc = docWithBody(
        '<ol class="pagination actions pagy"><li class="next"><a href="?page=2">Next &#8594;</a></li></ol>',
      );

      expect(parseWorkBookmarksPage(doc).hasNextPage).toBe(true);
    });

    it("is false when li.next contains a <span> instead of an <a> (real last-page shape)", () => {
      const doc = docWithBody(
        '<ol class="pagination actions pagy"><li class="next"><span class="disabled">Next &#8594;</span></li></ol>',
      );

      expect(parseWorkBookmarksPage(doc).hasNextPage).toBe(false);
    });

    it("is false when there is no li.next at all", () => {
      const doc = docWithBody(
        '<ol class="pagination actions pagy"><li class="previous"><span class="disabled">&#8592; Previous</span></li></ol>',
      );

      expect(parseWorkBookmarksPage(doc).hasNextPage).toBe(false);
    });

    it("is false when there is no pagination element at all", () => {
      const doc = docWithBody("");

      expect(parseWorkBookmarksPage(doc).hasNextPage).toBe(false);
    });

    // Regression: neither of the two previously-shipped-but-wrong
    // assumptions (Kaminari-style ol.pagination/li.next/rel="next" from the
    // original code, nor the flat <nav class="pagy nav"> from a later pass
    // that trusted the Pagy gem's stock template instead of AO3's real
    // override) should ever be mistaken for a real "has next page" signal.
    it("is false for the old <nav class=pagy nav> shape (confirms that assumption is gone)", () => {
      const doc = docWithBody(
        '<nav class="pagy nav" aria-label="Pagination"><a href="?page=1">1</a><a href="?page=2" aria-label="Next">Next &#8594;</a></nav>',
      );

      expect(parseWorkBookmarksPage(doc).hasNextPage).toBe(false);
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

      // 3 (page1) + 3 (page2) + 2 (page3) = 8
      expect(result.bookmarks).toHaveLength(8);
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
      // Only the first two pages' bookmarks (3 + 3) - page 3's bookmarks
      // must not be silently included despite existing.
      expect(result.bookmarks).toHaveLength(6);
    });

    it("does not report truncated when the cap is reached on exactly the last page", async () => {
      const fetchPage = fetchPageStub([page1, page2, page3]);

      const result = await fetchAllWorkBookmarks(fetchPage, { maxPages: 3 });

      expect(result.truncated).toBe(false);
      expect(result.bookmarks).toHaveLength(8);
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
