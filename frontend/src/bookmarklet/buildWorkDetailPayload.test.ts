import { describe, expect, it } from "vitest";
import { buildWorkDetailPayload } from "./buildWorkDetailPayload";
import type { ScrapedWorkPage } from "./scrapeWorkPage";
import type { ScrapedBookmark } from "./scrapeWorkBookmarks";

// Translates scrapeWorkPage's + scrapeWorkBookmarks' parsed data into the
// exact POST /ingest/work JSON body contract defined in
// backend/spec/support/work_detail_payloads.rb, mirroring
// buildIngestPayload.ts's role for the existing /ingest payload - own
// schemaVersion namespace (WORK_DETAIL_SCHEMA_VERSION), independent of the
// stats-page SCHEMA_VERSION per the plan.
const SAMPLE_WORK_PAGE: ScrapedWorkPage = {
  ao3WorkId: 111,
  publicBookmarks: 6,
  visibleComments: 14,
  publishedOn: "2023-05-01",
  chapterCount: 3,
  chaptersExpected: 12,
  complete: false,
  series: ["Series One"],
};

const SAMPLE_BOOKMARKS: ScrapedBookmark[] = [
  {
    bookmarkerName: "avid_reader",
    noteHtml: "<p>Loved this!</p>",
    bookmarkerTags: ["fluff"],
    bookmarkedOn: "2024-05-01",
    collections: ["Collection A"],
  },
  {
    bookmarkerName: null,
    noteHtml: null,
    bookmarkerTags: [],
    bookmarkedOn: null,
    collections: [],
  },
];

describe("buildWorkDetailPayload", () => {
  it("includes the given schemaVersion", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
    });

    expect(payload.schemaVersion).toBe(1);
  });

  it("carries the username and ao3WorkId through", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
    });

    expect(payload.username).toBe("someauthor");
    expect(payload.ao3WorkId).toBe(111);
  });

  it("sends null readToken when none is stored yet", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
    });

    expect(payload.readToken).toBeNull();
  });

  it("sends the stored readToken when one is provided", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
      readToken: "tok_abc",
    });

    expect(payload.readToken).toBe("tok_abc");
  });

  it("maps the scraped work-page fields onto workStats", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
    });

    expect(payload.workStats).toEqual({
      publicBookmarks: 6,
      visibleComments: 14,
      chapterCount: 3,
      chaptersExpected: 12,
    });
  });

  it("passes chaptersExpected through as null for an open-ended WIP", () => {
    const payload = buildWorkDetailPayload(
      { ...SAMPLE_WORK_PAGE, chaptersExpected: null },
      SAMPLE_BOOKMARKS,
      { schemaVersion: 1, username: "someauthor" },
    );

    expect(payload.workStats.chaptersExpected).toBeNull();
  });

  it("maps the scraped identity fields onto work", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
    });

    expect(payload.work).toEqual({
      publishedOn: "2023-05-01",
      series: ["Series One"],
      complete: false,
    });
  });

  it("passes publishedOn through as null when unparseable, and series as an empty list when none", () => {
    const payload = buildWorkDetailPayload(
      { ...SAMPLE_WORK_PAGE, publishedOn: null, series: [] },
      SAMPLE_BOOKMARKS,
      { schemaVersion: 1, username: "someauthor" },
    );

    expect(payload.work.publishedOn).toBeNull();
    expect(payload.work.series).toEqual([]);
  });

  it("maps each scraped bookmark into the bookmarks array unchanged", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
    });

    expect(payload.bookmarks).toEqual(SAMPLE_BOOKMARKS);
  });

  it("passes an empty bookmarks array through unchanged (zero public bookmarks)", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, [], {
      schemaVersion: 1,
      username: "someauthor",
    });

    expect(payload.bookmarks).toEqual([]);
  });

  it("produces a body that survives a JSON.stringify/parse round trip", () => {
    const payload = buildWorkDetailPayload(SAMPLE_WORK_PAGE, SAMPLE_BOOKMARKS, {
      schemaVersion: 1,
      username: "someauthor",
      readToken: "tok_abc",
    });

    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});
