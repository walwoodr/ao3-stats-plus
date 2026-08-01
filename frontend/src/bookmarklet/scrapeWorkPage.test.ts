import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scrapeWorkPage } from "./scrapeWorkPage";

// scrapeWorkPage reads a single AO3 work page's DOM (same-origin fetched by
// the fan-out orchestrator for each work Phase 1 scraped) and returns
// already-parsed enrichment data - public_bookmarks_count,
// count_visible_comments, published date, chapter_total_display (as the
// chapterCount/chaptersExpected pair), complete, and series. It never
// throws - a changed/broken layout is a typed { ok: false, reason:
// "scrape-failed" } result, mirroring scrapeStats.ts's established pattern.
//
// EXTERNAL-UNVERIFIED: the outer dl.work.meta.group/dl.stats nesting and
// the dd.series markup shape are modeled on otwcode/otwarchive's
// work_meta_list helper and general knowledge of AO3's rendered template,
// not verified against a live AO3 page - see each fixture file and
// TECH_DEBT.md for the corresponding entry. Two things ARE confirmed
// against work_meta_list's real source (app/helpers/works_helper.rb):
// (1) Comments and Bookmarks rows are omitted entirely when their count is
// zero, not rendered as a bare "0" - a zero must be inferred from the
// row's absence; (2) only the Bookmarks row is ever wrapped in a link -
// Chapters, Comments, and Kudos are always plain text, regardless of count.
function loadFixture(name: string): Document {
  const html = readFileSync(join(__dirname, "fixtures", name), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("scrapeWorkPage", () => {
  describe("an ongoing WIP with an open-ended chapter count", () => {
    const doc = loadFixture("work-page-wip-open-ended.html");
    const result = scrapeWorkPage(doc, "/works/111");

    it("succeeds", () => {
      expect(result.ok).toBe(true);
    });

    it("extracts the ao3WorkId from the pathname", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.ao3WorkId).toBe(111);
    });

    it("parses public_bookmarks_count from dd.bookmarks", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.publicBookmarks).toBe(6);
    });

    it("parses count_visible_comments from dd.comments", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.visibleComments).toBe(14);
    });

    it("parses the published date from dd.published", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.publishedOn).toBe("2023-05-01");
    });

    it("parses the posted chapter count from chapter_total_display's 'N/?' numerator", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.chapterCount).toBe(3);
    });

    it("parses chaptersExpected as null for AO3's open-ended '?' denominator", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.chaptersExpected).toBeNull();
    });

    it("treats an 'Updated:' status row (not 'Completed:') as not complete", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.complete).toBe(false);
    });

    it("parses the single series it belongs to", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.series).toEqual(["Series One"]);
    });
  });

  describe("a finished one-shot with no series and genuinely zero bookmarks/comments", () => {
    const doc = loadFixture("work-page-complete-no-series.html");
    const result = scrapeWorkPage(doc, "/works/222");

    it("succeeds", () => {
      expect(result.ok).toBe(true);
    });

    it("parses public_bookmarks_count as 0 (not null) when dd.bookmarks is absent entirely (AO3 omits the row when the count is zero)", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.publicBookmarks).toBe(0);
    });

    it("parses count_visible_comments as 0 (not null) when dd.comments is absent entirely (AO3 omits the row when the count is zero)", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.visibleComments).toBe(0);
    });

    it("parses a closed chapter_total_display ('10/10') as chapterCount 10, chaptersExpected 10", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.chapterCount).toBe(10);
      expect(result.data.chaptersExpected).toBe(10);
    });

    it("treats a 'Completed:' status row as complete", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.complete).toBe(true);
    });

    it("returns an empty series list when there is no dt.series/dd.series pair at all", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.series).toEqual([]);
    });
  });

  describe("a work belonging to more than one series", () => {
    it("parses every series it belongs to, not just the first", () => {
      const doc = loadFixture("work-page-multi-series.html");
      const result = scrapeWorkPage(doc, "/works/333");

      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.series).toEqual(["Series One", "Series Two"]);
    });

    // Confirmed against AO3's real series_helper.rb: a span.series for a
    // work that isn't first/last in its series also contains sibling
    // "Previous Work"/"Next Work" navigation links - a selector scoped to
    // "span.series a" instead of the inner "span.position a" would
    // incorrectly pick these up as if they were series names. This
    // fixture's second series (Series Two) has both links present.
    it("excludes Previous Work/Next Work navigation links from the series names", () => {
      const doc = loadFixture("work-page-multi-series.html");
      const result = scrapeWorkPage(doc, "/works/333");

      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.series).not.toContain("Previous Work");
      expect(result.data.series).not.toContain("Next Work");
      expect(result.data.series.some((name) => name.includes("Previous"))).toBe(false);
      expect(result.data.series.some((name) => name.includes("Next"))).toBe(false);
    });
  });

  describe("comma-delimited large numbers", () => {
    it("parses public_bookmarks_count and count_visible_comments with thousands separators stripped", () => {
      const doc = loadFixture("work-page-comma-numbers.html");
      const result = scrapeWorkPage(doc, "/works/555");

      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.publicBookmarks).toBe(1_234);
      expect(result.data.visibleComments).toBe(2_500);
    });
  });

  describe("an unparseable published date", () => {
    it("returns publishedOn: null without failing the whole scrape", () => {
      const doc = loadFixture("work-page-unparseable-published.html");
      const result = scrapeWorkPage(doc, "/works/444");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.publishedOn).toBeNull();
    });

    it("still parses the rest of the page's fields normally", () => {
      const doc = loadFixture("work-page-unparseable-published.html");
      const result = scrapeWorkPage(doc, "/works/444");

      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.chapterCount).toBe(1);
      expect(result.data.chaptersExpected).toBe(1);
    });
  });

  describe("a malformed/changed DOM", () => {
    it("returns a scrape-failed result rather than throwing", () => {
      const doc = loadFixture("work-page-malformed.html");
      const result = scrapeWorkPage(doc, "/works/999");

      expect(result).toEqual({ ok: false, reason: "scrape-failed" });
    });
  });

  describe("pathname parsing", () => {
    it("returns scrape-failed when the pathname doesn't match /works/:id", () => {
      const doc = loadFixture("work-page-wip-open-ended.html");
      const result = scrapeWorkPage(doc, "/some/unrelated/path");

      expect(result).toEqual({ ok: false, reason: "scrape-failed" });
    });
  });
});
