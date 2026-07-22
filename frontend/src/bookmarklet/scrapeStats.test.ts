import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scrapeStats } from "./scrapeStats";

// scrapeStats reads AO3's stats-page DOM (already loaded same-origin by the
// bookmarklet) and returns already-parsed data, per the plan's fixtures:
// comma-delimited numbers, multi-fandom dedup, missing-subscriptions
// default, the no_stats template, and non-"All Years" abort behavior.
function loadFixture(name: string): Document {
  const html = readFileSync(join(__dirname, "fixtures", name), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

const STATS_PATHNAME = "/users/someauthor/stats";

describe("scrapeStats", () => {
  describe("the All Years happy path", () => {
    const doc = loadFixture("all-years-happy-path.html");
    const result = scrapeStats(doc, STATS_PATHNAME);

    it("succeeds", () => {
      expect(result.ok).toBe(true);
    });

    it("extracts the username from the pathname", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.username).toBe("someauthor");
    });

    it("parses comma-delimited aggregate numbers", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.aggregate).toEqual({
        hits: 1234,
        kudos: 100,
        comments: 20,
        bookmarks: 15,
        subscriptions: 10,
        userSubscriptions: 5,
        wordCount: 75_000,
        worksCount: 2,
      });
    });

    it("parses per-work rows including comma-delimited numbers", () => {
      if (!result.ok) throw new Error("expected ok result");
      const workA = result.data.works.find((w) => w.ao3WorkId === 111);
      expect(workA).toMatchObject({
        title: "Work A",
        fandoms: ["Fandom One"],
        hits: 400,
        kudos: 40,
        comments: 8,
        bookmarks: 6,
        subscriptions: 4,
        wordCount: 30_000,
      });
    });

    it("defaults a work's subscriptions to 0 when AO3 omits the dd entirely", () => {
      if (!result.ok) throw new Error("expected ok result");
      const workB = result.data.works.find((w) => w.ao3WorkId === 222);
      expect(workB?.subscriptions).toBe(0);
    });
  });

  describe("a multi-fandom work", () => {
    const doc = loadFixture("multi-fandom-work.html");
    const result = scrapeStats(doc, STATS_PATHNAME);

    it("dedups by ao3_work_id into a single work entry", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.works).toHaveLength(1);
    });

    it("unions the fandom strings across the duplicated rows", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.works[0].fandoms).toEqual(["Fandom One", "Fandom Two"]);
    });
  });

  describe("a zero-works user (AO3's no_stats template)", () => {
    it("returns a no-works result instead of posting an empty snapshot", () => {
      const doc = loadFixture("no-stats.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      expect(result).toEqual({ ok: false, reason: "no-works" });
    });
  });

  describe("a non-All-Years view", () => {
    it("aborts with a not-all-years result", () => {
      const doc = loadFixture("wrong-year-selected.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      expect(result).toEqual({ ok: false, reason: "not-all-years" });
    });
  });

  describe("a malformed/changed DOM", () => {
    it("returns a scrape-failed result rather than throwing", () => {
      const doc = loadFixture("malformed-dom.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      expect(result).toEqual({ ok: false, reason: "scrape-failed" });
    });
  });

  describe("pathname parsing", () => {
    it("returns scrape-failed when the pathname doesn't match /users/:username/stats", () => {
      const doc = loadFixture("all-years-happy-path.html");
      const result = scrapeStats(doc, "/some/unrelated/path");

      expect(result).toEqual({ ok: false, reason: "scrape-failed" });
    });
  });
});
