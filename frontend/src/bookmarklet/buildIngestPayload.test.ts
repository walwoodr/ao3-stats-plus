import { describe, expect, it } from "vitest";
import { buildIngestPayload } from "./buildIngestPayload";
import type { ScrapedData } from "./scrapeStats";

// Translates scrapeStats' ScrapedData into the exact POST /ingest JSON body
// contract defined in backend/spec/support/ingest_payloads.rb, so the two
// sides of this stage's tests agree on the wire shape.
const SAMPLE_DATA: ScrapedData = {
  username: "someauthor",
  aggregate: {
    hits: 1_000,
    kudos: 100,
    comments: 20,
    bookmarks: 15,
    subscriptions: 10,
    userSubscriptions: 5,
    wordCount: 75_000,
    worksCount: 1,
  },
  works: [
    {
      ao3WorkId: 111,
      title: "Work A",
      fandoms: ["Fandom One"],
      hits: 400,
      kudos: 40,
      comments: 8,
      bookmarks: 6,
      subscriptions: 4,
      wordCount: 30_000,
    },
  ],
};

describe("buildIngestPayload", () => {
  it("includes the current schemaVersion", () => {
    const payload = buildIngestPayload(SAMPLE_DATA, { schemaVersion: 1 });
    expect(payload.schemaVersion).toBe(1);
  });

  it("carries the username through unchanged", () => {
    const payload = buildIngestPayload(SAMPLE_DATA, { schemaVersion: 1 });
    expect(payload.username).toBe("someauthor");
  });

  it("sends null readToken when none is stored yet", () => {
    const payload = buildIngestPayload(SAMPLE_DATA, { schemaVersion: 1 });
    expect(payload.readToken).toBeNull();
  });

  it("sends the stored readToken when one is provided", () => {
    const payload = buildIngestPayload(SAMPLE_DATA, { schemaVersion: 1, readToken: "tok_abc" });
    expect(payload.readToken).toBe("tok_abc");
  });

  it("maps the aggregate totals onto the aggregate object", () => {
    const payload = buildIngestPayload(SAMPLE_DATA, { schemaVersion: 1 });
    expect(payload.aggregate).toEqual(SAMPLE_DATA.aggregate);
  });

  it("maps each work into the works array with its fandoms as a list", () => {
    const payload = buildIngestPayload(SAMPLE_DATA, { schemaVersion: 1 });
    expect(payload.works).toEqual([
      {
        ao3WorkId: 111,
        title: "Work A",
        fandoms: ["Fandom One"],
        hits: 400,
        kudos: 40,
        comments: 8,
        bookmarks: 6,
        subscriptions: 4,
        wordCount: 30_000,
      },
    ]);
  });

  it("produces a body that survives a JSON.stringify/parse round trip", () => {
    const payload = buildIngestPayload(SAMPLE_DATA, { schemaVersion: 1, readToken: "tok_abc" });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});
