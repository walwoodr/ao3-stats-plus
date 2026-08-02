import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkDetailPayload } from "./buildWorkDetailPayload";
import type { ScrapedWorkPage } from "./scrapeWorkPage";
import { postWorkDetail } from "./workDetailIngestClient";

// workDetailIngestClient wraps the raw fetch() POST to /ingest/work and
// classifies the response into a discriminated WorkDetailIngestResult,
// mirroring ingestClient.ts's role for the existing /ingest endpoint.
// Status mapping per docs/plans/memorable-token-and-recovery.md section
// 6/10 (task 11) and the backend (spec/requests/ingest_work_spec.rb):
// 200/201 -> success, 426 (UnsupportedSchemaVersion) -> schemaMismatch, 422
// (InvalidPayload) -> invalid, 409 (NoSnapshotForToday) ->
// noSnapshotForToday, network failure or any other/5xx status ->
// networkError. /ingest/work no longer checks the token at all and can
// never return 403, so the old 403 -> tokenMismatch mapping is dropped; a
// stray 403 falls through to networkError rather than crashing.
const workPage: ScrapedWorkPage = {
  ao3WorkId: 111,
  publicBookmarks: 6,
  visibleComments: 14,
  publishedOn: "2023-05-01",
  chapterCount: 3,
  chaptersExpected: 12,
  complete: false,
  series: ["Series One"],
};

const payload = buildWorkDetailPayload(workPage, [], {
  schemaVersion: 1,
  username: "someauthor",
  readToken: "tok_prev",
});
const API_ORIGIN = "https://api.example.com";

function jsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) } as Response;
}

describe("postWorkDetail", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to <apiOrigin>/ingest/work with JSON content type and the given payload as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true }));

    await postWorkDetail(API_ORIGIN, payload);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/ingest/work",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }),
    );
  });

  describe("on 200/201 (idempotent update-in-place - never a dedup-skip)", () => {
    it("returns a success result on 200", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true }));

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "success" });
    });

    it("returns a success result on 201", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { ok: true }));

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "success" });
    });
  });

  // /ingest/work no longer checks the token (plan section 3b/6) and can
  // never legitimately return 403 - but the client must not crash if a
  // stray one somehow arrives; it falls through to networkError.
  describe("on a stray 403 Forbidden (should not happen - the token is no longer checked)", () => {
    it("returns a networkError result, not a tokenMismatch result", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { ok: false, error: "unexpected" }));

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });

  describe("on 426 Upgrade Required (unsupported schemaVersion)", () => {
    it("returns a schemaMismatch result", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(426, { ok: false, error: "unsupported schemaVersion" }),
      );

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "schemaMismatch" });
    });
  });

  describe("on 422 Unprocessable Entity (invalid payload)", () => {
    it("returns an invalid result carrying the server's error message", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(422, { ok: false, error: "ao3WorkId required" }),
      );

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "invalid", message: "ao3WorkId required" });
    });
  });

  describe("on 409 Conflict (no snapshot for today - the defensive guard)", () => {
    it("returns a noSnapshotForToday result", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(409, { ok: false, error: "no snapshot for today" }),
      );

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "noSnapshotForToday" });
    });
  });

  describe("on a network failure (fetch rejects)", () => {
    it("returns a networkError result instead of throwing", async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });

  describe("on a 5xx server error", () => {
    it("returns a networkError result", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { ok: false, error: "internal error" }));

      const result = await postWorkDetail(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });
});
