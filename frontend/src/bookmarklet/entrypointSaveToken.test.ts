import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeResult } from "./scrapeStats";
import type { IngestResult } from "./ingestClient";
import {
  API_ORIGIN,
  AO3_PATHNAME,
  FRONTEND_ORIGIN,
  scrapedData,
  stubBannerImplementation,
  stubCurrentScript,
} from "./entrypointTestSupport";

declare global {
  interface Window {
    __ao3StatsPlus?: { banner: HTMLElement | null; fanOutActive: boolean };
  }
}

// Split out of entrypoint.test.ts (CODE_STANDARDS.md's 400-line .ts budget -
// see entrypoint.test.ts's own header comment for the full split). Covers
// the success banner's onSaveToken callback: entrypoint's own adapter from
// tokenUpdateClient's TokenUpdateResult (success/invalid/schemaMismatch/
// networkError) down to banners.ts's simpler SaveTokenResult
// ({ok:true,readToken} | {ok:false,message}) - banners.ts deliberately
// knows nothing about apiOrigin/fetch/tokenUpdateClient, per its own
// "mirrors the existing onRetry callback pattern" design
// (memorable-token-and-recovery plan section 4). These tests capture the
// real callback entrypoint builds and invoke it directly, rather than
// re-asserting banners.ts's own Save-button behavior (already covered by
// banners.test.ts).
vi.mock("./scrapeStats", () => ({ scrapeStats: vi.fn() }));
vi.mock("./ingestClient", () => ({ postIngest: vi.fn() }));
vi.mock("./tokenStorage", () => ({
  getStoredReadToken: vi.fn(),
  setStoredReadToken: vi.fn(),
}));
vi.mock("./tokenSuggestion", () => ({ generateTokenSuggestion: vi.fn() }));
vi.mock("./tokenUpdateClient", () => ({ postTokenUpdate: vi.fn() }));
vi.mock("./banners", () => ({
  renderSuccessBanner: vi.fn(),
  renderInfoBanner: vi.fn(),
  renderFailureBanner: vi.fn(),
  renderRetryBanner: vi.fn(),
  renderUnauthorizedBanner: vi.fn(),
  removeBannerStack: vi.fn(),
}));

describe("bookmarklet entrypoint - onSaveToken wiring (the success banner's Save action)", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "__ao3StatsPlus");
    vi.stubEnv("VITE_API_ORIGIN", API_ORIGIN);
    stubCurrentScript(`${FRONTEND_ORIGIN}/bookmarklet.js?t=12345`);
    window.history.pushState({}, "", AO3_PATHNAME);

    const banners = await import("./banners");
    stubBannerImplementation(vi.mocked(banners.renderSuccessBanner));
    stubBannerImplementation(vi.mocked(banners.renderInfoBanner));
    stubBannerImplementation(vi.mocked(banners.renderFailureBanner));
    stubBannerImplementation(vi.mocked(banners.renderRetryBanner));
    stubBannerImplementation(vi.mocked(banners.renderUnauthorizedBanner));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(document, "currentScript");
  });

  async function captureOnSaveToken() {
    const { scrapeStats } = await import("./scrapeStats");
    const { postIngest } = await import("./ingestClient");
    const { getStoredReadToken } = await import("./tokenStorage");
    const { generateTokenSuggestion } = await import("./tokenSuggestion");
    const { renderSuccessBanner } = await import("./banners");
    vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
    vi.mocked(getStoredReadToken).mockReturnValue(undefined);
    vi.mocked(generateTokenSuggestion).mockReturnValue("cat-dog");
    vi.mocked(postIngest).mockResolvedValue({
      status: "success",
      readToken: "cat-dog",
      capturedOn: "2026-07-23",
      deduped: false,
    } as IngestResult);

    await import("./entrypoint");
    await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

    const onSaveToken = vi.mocked(renderSuccessBanner).mock.calls[0][1].onSaveToken;
    return onSaveToken;
  }

  it("POSTs the new token via postTokenUpdate and adapts a success result", async () => {
    const { postTokenUpdate } = await import("./tokenUpdateClient");
    vi.mocked(postTokenUpdate).mockResolvedValue({ status: "success", readToken: "fox-owl" });
    const onSaveToken = await captureOnSaveToken();

    const result = await onSaveToken("fox-owl");

    expect(postTokenUpdate).toHaveBeenCalledWith(
      API_ORIGIN,
      expect.objectContaining({ schemaVersion: 1, username: "someauthor", readToken: "fox-owl" }),
    );
    expect(result).toEqual({ ok: true, readToken: "fox-owl" });
  });

  // Without this, a later repeat capture would replay the stale
  // pre-edit token from AO3-origin localStorage instead of the one the
  // user just saved server-side, silently undoing the edit on next use.
  it("updates AO3-origin localStorage with the new token on a successful save", async () => {
    const { postTokenUpdate } = await import("./tokenUpdateClient");
    const { setStoredReadToken } = await import("./tokenStorage");
    vi.mocked(postTokenUpdate).mockResolvedValue({ status: "success", readToken: "fox-owl" });
    const onSaveToken = await captureOnSaveToken();
    vi.mocked(setStoredReadToken).mockClear();

    await onSaveToken("fox-owl");

    expect(setStoredReadToken).toHaveBeenCalledWith("someauthor", "fox-owl");
  });

  it("does not update AO3-origin localStorage when the save fails", async () => {
    const { postTokenUpdate } = await import("./tokenUpdateClient");
    const { setStoredReadToken } = await import("./tokenStorage");
    vi.mocked(postTokenUpdate).mockResolvedValue({ status: "networkError" });
    const onSaveToken = await captureOnSaveToken();
    vi.mocked(setStoredReadToken).mockClear();

    await onSaveToken("fox-owl");

    expect(setStoredReadToken).not.toHaveBeenCalled();
  });

  it("adapts an invalid (422) result to a failure with the server's message", async () => {
    const { postTokenUpdate } = await import("./tokenUpdateClient");
    vi.mocked(postTokenUpdate).mockResolvedValue({
      status: "invalid",
      message: "username is required",
    });
    const onSaveToken = await captureOnSaveToken();

    const result = await onSaveToken("fox-owl");

    expect(result).toEqual({ ok: false, message: "username is required" });
  });

  it("adapts a schemaMismatch (426) result to a failure with a friendly message", async () => {
    const { postTokenUpdate } = await import("./tokenUpdateClient");
    vi.mocked(postTokenUpdate).mockResolvedValue({ status: "schemaMismatch" });
    const onSaveToken = await captureOnSaveToken();

    const result = await onSaveToken("fox-owl");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/out of date|reinstall/i);
  });

  it("adapts a networkError result to a failure with a friendly message", async () => {
    const { postTokenUpdate } = await import("./tokenUpdateClient");
    vi.mocked(postTokenUpdate).mockResolvedValue({ status: "networkError" });
    const onSaveToken = await captureOnSaveToken();

    const result = await onSaveToken("fox-owl");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/network|connection|reach/i);
  });
});
