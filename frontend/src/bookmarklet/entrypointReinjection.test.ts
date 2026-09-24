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
// entrypoint.ts's re-injection guard: a second script injection on the same
// page (e.g. a double-click on the bookmarklet) must drop the previous
// banner/banner-stack and stop - not re-scrape or re-POST - since a classic
// re-injected <script> has no module cache to rely on, only
// window.__ao3StatsPlus persists across injections.
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

describe("bookmarklet entrypoint - re-injection guard", () => {
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

  it("removes the existing banner and does not re-scrape/re-POST on a second injection", async () => {
    const { scrapeStats } = await import("./scrapeStats");
    const { postIngest } = await import("./ingestClient");
    const { renderSuccessBanner } = await import("./banners");
    vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
    vi.mocked(postIngest).mockResolvedValue({
      status: "success",
      readToken: "tok_new",
      capturedOn: "2026-07-23",
      deduped: false,
    } as IngestResult);

    await import("./entrypoint");
    await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalledTimes(1));
    const firstBanner = vi.mocked(renderSuccessBanner).mock.results[0]?.value as HTMLElement;
    expect(firstBanner.isConnected).toBe(true);
    expect(window.__ao3StatsPlus).toBeTruthy();

    vi.resetModules();
    await import("./entrypoint");
    await vi.waitFor(() => expect(firstBanner.isConnected).toBe(false));

    expect(scrapeStats).toHaveBeenCalledTimes(1);
    expect(postIngest).toHaveBeenCalledTimes(1);
    expect(renderSuccessBanner).toHaveBeenCalledTimes(1);
  });

  // TECH_DEBT.md, 2026-07-23 "Re-injection cleanup gap": the tracked-
  // banner reference alone never covered fan-out's untracked progress/
  // summary banners (or the now-empty stack wrapper itself), so
  // re-injection must also remove the whole shared banner-stack wrapper -
  // this pins that the real cleanup helper (banners.ts's
  // removeBannerStack, not just the single-banner .remove()) is called
  // against document.body on every re-injection.
  it("also removes the whole shared banner-stack wrapper on re-injection, not just the single tracked banner", async () => {
    const { scrapeStats } = await import("./scrapeStats");
    const { postIngest } = await import("./ingestClient");
    const { removeBannerStack } = await import("./banners");
    vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
    vi.mocked(postIngest).mockResolvedValue({
      status: "success",
      readToken: "tok_new",
      capturedOn: "2026-07-23",
      deduped: false,
    } as IngestResult);

    await import("./entrypoint");
    await vi.waitFor(() => expect(window.__ao3StatsPlus).toBeTruthy());
    expect(removeBannerStack).not.toHaveBeenCalled();

    vi.resetModules();
    await import("./entrypoint");

    expect(removeBannerStack).toHaveBeenCalledExactlyOnceWith(document.body);
  });
});
