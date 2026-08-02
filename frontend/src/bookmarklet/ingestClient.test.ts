import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIngestPayload } from "./buildIngestPayload";
import type { ScrapedData } from "./scrapeStats";
import { postIngest } from "./ingestClient";

// ingestClient wraps the raw fetch() POST to /ingest and classifies the
// response into a discriminated IngestResult, so entrypoint.ts never has to
// reason about HTTP status codes directly. Status mapping per
// docs/plans/memorable-token-and-recovery.md section 6/10 (task 11) and the
// backend (IngestController): 201/200 -> success, 426
// (UnsupportedSchemaVersion) -> schemaMismatch, 422 (InvalidPayload) ->
// invalid, network failure or 5xx -> networkError. /ingest is now
// always-accept and can never return 403, so the old 403 -> tokenMismatch
// mapping is dropped; a stray 403 (shouldn't happen in practice) falls
// through to networkError rather than crashing.
const scrapedData: ScrapedData = {
  username: "someauthor",
  earliestPostYear: null,
  aggregate: {
    hits: 1234,
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

const payload = buildIngestPayload(scrapedData, { schemaVersion: 1, readToken: "tok_prev" });
const API_ORIGIN = "https://api.example.com";

function jsonResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("postIngest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to <apiOrigin>/ingest with JSON content type and the given payload as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(201, {
        ok: true,
        deduped: false,
        readToken: "tok_new",
        capturedOn: "2026-07-23",
      }),
    );

    await postIngest(API_ORIGIN, payload);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/ingest",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }),
    );
  });

  describe("on 201 Created (new snapshot)", () => {
    it("returns a success result with the readToken, capturedOn, and deduped: false", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(201, {
          ok: true,
          deduped: false,
          readToken: "tok_new",
          capturedOn: "2026-07-23",
        }),
      );

      const result = await postIngest(API_ORIGIN, payload);

      expect(result).toEqual({
        status: "success",
        readToken: "tok_new",
        capturedOn: "2026-07-23",
        deduped: false,
      });
    });
  });

  describe("on 200 OK (same-day dedup)", () => {
    it("returns a success result with deduped: true", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, {
          ok: true,
          deduped: true,
          readToken: "tok_prev",
          capturedOn: "2026-07-23",
        }),
      );

      const result = await postIngest(API_ORIGIN, payload);

      expect(result).toEqual({
        status: "success",
        readToken: "tok_prev",
        capturedOn: "2026-07-23",
        deduped: true,
      });
    });
  });

  // /ingest is always-accept now (plan section 3a/6) and can never
  // legitimately return 403 - but the client must not crash if a stray one
  // somehow arrives; it falls through to the same networkError bucket as
  // any other unexpected status.
  describe("on a stray 403 Forbidden (should not happen under always-accept, but must not crash)", () => {
    it("returns a networkError result, not a tokenMismatch result", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { ok: false, error: "unexpected" }));

      const result = await postIngest(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });

  describe("on 426 Upgrade Required (unsupported schemaVersion)", () => {
    it("returns a schemaMismatch result", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(426, { ok: false, error: "unsupported schemaVersion" }),
      );

      const result = await postIngest(API_ORIGIN, payload);

      expect(result).toEqual({ status: "schemaMismatch" });
    });
  });

  describe("on 422 Unprocessable Entity (invalid payload)", () => {
    it("returns an invalid result carrying the server's error message", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(422, { ok: false, error: "username is required" }),
      );

      const result = await postIngest(API_ORIGIN, payload);

      expect(result).toEqual({ status: "invalid", message: "username is required" });
    });
  });

  describe("on a network failure (fetch rejects)", () => {
    it("returns a networkError result instead of throwing", async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await postIngest(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });

  describe("on a 5xx server error", () => {
    it("returns a networkError result", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(500, { ok: false, error: "internal error" }, false),
      );

      const result = await postIngest(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });
});
