import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postTokenUpdate, type TokenUpdatePayload } from "./tokenUpdateClient";

// tokenUpdateClient wraps the raw fetch() POST to /ingest/token and
// classifies the response into a discriminated TokenUpdateResult, mirroring
// ingestClient.ts's role for the existing /ingest endpoint. Status mapping
// per docs/plans/memorable-token-and-recovery.md section 3c/10 (task 12)
// and the backend (spec/requests/ingest_token_spec.rb): 200 -> success, 426
// (UnsupportedSchemaVersion) -> schemaMismatch, 422 (InvalidPayload) ->
// invalid, network failure or any other/5xx status -> networkError. There
// is no 403 case at all - /ingest/token is always-accept, unlike the old
// TokenMismatch-era /ingest.
const payload: TokenUpdatePayload = {
  schemaVersion: 1,
  username: "someauthor",
  readToken: "cat-dog",
};
const API_ORIGIN = "https://api.example.com";

function jsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) } as Response;
}

describe("postTokenUpdate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to <apiOrigin>/ingest/token with JSON content type and the given payload as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, readToken: "cat-dog" }));

    await postTokenUpdate(API_ORIGIN, payload);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/ingest/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }),
    );
  });

  describe("on 200 OK", () => {
    it("returns a success result with the echoed readToken", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, readToken: "cat-dog" }));

      const result = await postTokenUpdate(API_ORIGIN, payload);

      expect(result).toEqual({ status: "success", readToken: "cat-dog" });
    });
  });

  describe("on 422 Unprocessable Entity (invalid payload)", () => {
    it("returns an invalid result carrying the server's error message", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(422, { ok: false, error: "username is required" }),
      );

      const result = await postTokenUpdate(API_ORIGIN, payload);

      expect(result).toEqual({ status: "invalid", message: "username is required" });
    });

    it("returns an invalid result for an unknown username", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(422, { ok: false, error: "no such username" }),
      );

      const result = await postTokenUpdate(API_ORIGIN, payload);

      expect(result).toEqual({ status: "invalid", message: "no such username" });
    });
  });

  describe("on 426 Upgrade Required (unsupported schemaVersion)", () => {
    it("returns a schemaMismatch result", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(426, { ok: false, error: "unsupported schemaVersion" }),
      );

      const result = await postTokenUpdate(API_ORIGIN, payload);

      expect(result).toEqual({ status: "schemaMismatch" });
    });
  });

  describe("on a network failure (fetch rejects)", () => {
    it("returns a networkError result instead of throwing", async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await postTokenUpdate(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });

  describe("on a 5xx server error", () => {
    it("returns a networkError result", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { ok: false, error: "internal error" }));

      const result = await postTokenUpdate(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });

  // /ingest/token is always-accept (plan section 3c) - there is no
  // proof-of-ownership rejection path, so it can never legitimately return
  // 403. A stray one must not crash the client.
  describe("on a stray 403 Forbidden (should not happen - always-accept)", () => {
    it("returns a networkError result", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { ok: false, error: "unexpected" }));

      const result = await postTokenUpdate(API_ORIGIN, payload);

      expect(result).toEqual({ status: "networkError" });
    });
  });
});
