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

    it("parses a per-work word count out of AO3's parenthesized '(N words)' format", () => {
      if (!result.ok) throw new Error("expected ok result");
      const workB = result.data.works.find((w) => w.ao3WorkId === 222);
      expect(workB?.wordCount).toBe(45_000);
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

  // Regression test: AO3 groups works by fandom heading, and a fandom
  // heading with more than one work in it renders as multiple per-work <dl>
  // blocks nested under the same <li class="fandom listbox group"> - not
  // one work per fandom heading. parseWorks previously used a single
  // querySelector("dl > dt a") per fandom row, which only ever finds the
  // first work's link, silently dropping every work after it in the same
  // fandom.
  describe("multiple different works under one fandom heading", () => {
    const doc = loadFixture("multiple-works-same-fandom.html");
    const result = scrapeStats(doc, STATS_PATHNAME);

    it("captures both works, not just the first", () => {
      if (!result.ok) throw new Error("expected ok result");
      const ids = result.data.works.map((w) => w.ao3WorkId).sort();
      expect(ids).toEqual([301, 302]);
    });

    it("gives each work its own title and stats, not the first work's data twice", () => {
      if (!result.ok) throw new Error("expected ok result");
      const first = result.data.works.find((w) => w.ao3WorkId === 301);
      const second = result.data.works.find((w) => w.ao3WorkId === 302);

      expect(first).toMatchObject({ title: "First Work", hits: 700, kudos: 60, wordCount: 15_000 });
      expect(second).toMatchObject({
        title: "Second Work",
        hits: 500,
        kudos: 40,
        wordCount: 30_000,
      });
    });

    it("gives both works the shared fandom heading", () => {
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.works.every((w) => w.fandoms.includes("Shared Fandom"))).toBe(true);
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

  // earliestPostYear is a synthetic "zero-point" fact captured on a user's
  // first-ever ingest: the minimum parseable year out of the stats page's
  // own `ol.year.actions li a` year links. It's top-level on ScrapedData
  // (not nested in aggregate) and must never turn a successful scrape into
  // a failure - a scrape with no parseable year links still succeeds with
  // earliestPostYear: null.
  describe("earliestPostYear (synthetic zero-point baseline)", () => {
    it("takes the minimum parseable year across multiple year links", () => {
      const doc = loadFixture("multi-year-history.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.earliestPostYear).toBe(2014);
    });

    it("does not treat the 'All Years' span as a year link", () => {
      // all-years-happy-path.html has exactly one individual year anchor
      // (2026); "All Years" is a <span>, not an <a>, so it must not affect
      // the computed minimum (e.g. by being parsed as NaN and short-
      // circuiting, or by leaking through as a non-numeric "year").
      const doc = loadFixture("all-years-happy-path.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.earliestPostYear).toBe(2026);
    });

    it("is null when there are no individual year links, without failing the scrape", () => {
      const doc = loadFixture("no-year-links.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok result");
      expect(result.data.earliestPostYear).toBeNull();
    });

    it("is a top-level field on ScrapedData, not nested inside aggregate", () => {
      const doc = loadFixture("multi-year-history.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      if (!result.ok) throw new Error("expected ok result");
      expect(result.data).toHaveProperty("earliestPostYear");
      expect(result.data.aggregate).not.toHaveProperty("earliestPostYear");
    });

    // Regression: the pre-existing not-all-years guard (lines ~59-61 of
    // scrapeStats.ts) must still fire before any earliestPostYear parsing
    // runs. wrong-year-selected.html has "All Years" rendered as an <a>
    // (it's not the current selection there) and "2026" as the current
    // <span> - a naive implementation that parsed year links before
    // checking the guard, or that ran regardless of the guard's result,
    // could misbehave on this fixture's inverted markup.
    it("still aborts with not-all-years before any earliestPostYear parsing", () => {
      const doc = loadFixture("wrong-year-selected.html");
      const result = scrapeStats(doc, STATS_PATHNAME);

      expect(result).toEqual({ ok: false, reason: "not-all-years" });
    });
  });
});
