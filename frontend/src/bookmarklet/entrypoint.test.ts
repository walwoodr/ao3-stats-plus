import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapedData, ScrapeResult } from "./scrapeStats";
import type { IngestResult } from "./ingestClient";

// entrypoint.ts stores its re-injection guard state directly on `window`
// (see the top-level comment below for why) - this augmentation just gives
// the spec a typed handle onto that, matching the shape assumed throughout.
declare global {
  interface Window {
    __ao3StatsPlus?: { banner: HTMLElement | null };
  }
}

// entrypoint.ts is the bookmarklet's IIFE orchestrator (the literal Vite
// entry point built into bookmarklet.js): re-injection guard -> capture the
// frontend origin from document.currentScript -> scrape -> read any stored
// token -> build the payload -> POST -> route the outcome to the right
// banner, persisting the returned token on success. It has no exports; it
// runs its flow as a side effect of being imported/executed, exactly as a
// re-injected <script src> tag would re-run it on the real AO3 page. Each
// `it` below therefore dynamically (re-)imports the module rather than
// calling an exported function directly, so the guard behavior (state
// stored on `window`, since a classic <script> re-execution has no module
// cache to rely on) is exercised the same way it would be for real.
//
// scrapeStats, ingestClient, tokenStorage, and banners are all mocked so
// this spec is a pure test of entrypoint's orchestration/wiring, not of
// their individual implementations (each already has, or will have, its
// own unit spec).
vi.mock("./scrapeStats", () => ({ scrapeStats: vi.fn() }));
vi.mock("./ingestClient", () => ({ postIngest: vi.fn() }));
vi.mock("./tokenStorage", () => ({
  getStoredReadToken: vi.fn(),
  setStoredReadToken: vi.fn(),
}));
vi.mock("./banners", () => ({
  renderSuccessBanner: vi.fn(),
  renderInfoBanner: vi.fn(),
  renderFailureBanner: vi.fn(),
  renderRetryBanner: vi.fn(),
  renderUnauthorizedBanner: vi.fn(),
}));

const FRONTEND_ORIGIN = "https://app.example.com";
const API_ORIGIN = "https://api.example.com";
const AO3_PATHNAME = "/users/someauthor/stats";

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

function stubCurrentScript(src: string) {
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: { src } as unknown as HTMLScriptElement,
  });
}

// Every mocked banner renderer creates+appends a real element (mirroring
// banners.ts's real behavior closely enough to assert on DOM
// presence/removal for the re-injection guard), rather than being an inert
// vi.fn() with no implementation.
function stubBannerImplementation(fn: ReturnType<typeof vi.fn>) {
  fn.mockImplementation((container: HTMLElement) => {
    const el = document.createElement("div");
    container.appendChild(el);
    return el;
  });
}

describe("bookmarklet entrypoint", () => {
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

  describe("happy path", () => {
    it("scrapes, builds a schemaVersion 1 payload with no stored token on a first-ever capture, and shows the success banner", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken, setStoredReadToken } = await import("./tokenStorage");
      const { renderSuccessBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue(undefined);
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_new",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

      expect(scrapeStats).toHaveBeenCalledWith(document, AO3_PATHNAME);
      expect(getStoredReadToken).toHaveBeenCalledWith("someauthor");
      expect(postIngest).toHaveBeenCalledWith(
        API_ORIGIN,
        expect.objectContaining({ schemaVersion: 1, username: "someauthor", readToken: null }),
      );
      expect(setStoredReadToken).toHaveBeenCalledWith("someauthor", "tok_new");
      expect(renderSuccessBanner).toHaveBeenCalledWith(document.body, {
        readToken: "tok_new",
        dashboardUrl: `${FRONTEND_ORIGIN}/u/someauthor?token=tok_new`,
      });
    });

    it("encodes the username when building the dashboard URL and the token-storage key", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken, setStoredReadToken } = await import("./tokenStorage");
      const { renderSuccessBanner } = await import("./banners");
      const weirdUsername = "weird/name&value";
      vi.mocked(scrapeStats).mockReturnValue({
        ok: true,
        data: { ...scrapedData, username: weirdUsername },
      } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue(undefined);
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_new",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

      // getStoredReadToken/setStoredReadToken take the raw username - encoding
      // for storage is tokenStorage's own concern (see tokenStorage.test.ts) -
      // but the dashboard URL is built here, so it must not let a URL-special
      // character (e.g. "&", "/") corrupt the path segment or query string.
      expect(getStoredReadToken).toHaveBeenCalledWith(weirdUsername);
      expect(setStoredReadToken).toHaveBeenCalledWith(weirdUsername, "tok_new");
      expect(renderSuccessBanner).toHaveBeenCalledWith(document.body, {
        readToken: "tok_new",
        dashboardUrl: `${FRONTEND_ORIGIN}/u/${encodeURIComponent(weirdUsername)}?token=tok_new`,
      });
    });

    it("replays a previously stored token in the payload on a repeat capture", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken } = await import("./tokenStorage");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue("tok_prev");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_prev",
        capturedOn: "2026-07-23",
        deduped: true,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(postIngest).toHaveBeenCalled());

      expect(postIngest).toHaveBeenCalledWith(
        API_ORIGIN,
        expect.objectContaining({ readToken: "tok_prev" }),
      );
    });

    it("still treats a same-day dedup response (200, deduped: true) as success", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken } = await import("./tokenStorage");
      const {
        renderSuccessBanner,
        renderFailureBanner,
        renderRetryBanner,
        renderUnauthorizedBanner,
      } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue("tok_prev");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_prev",
        capturedOn: "2026-07-23",
        deduped: true,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

      expect(renderFailureBanner).not.toHaveBeenCalled();
      expect(renderRetryBanner).not.toHaveBeenCalled();
      expect(renderUnauthorizedBanner).not.toHaveBeenCalled();
    });
  });

  describe("scrape failures", () => {
    it.each([
      ["no-works", /work/i],
      ["not-all-years", /all years/i],
      ["scrape-failed", /layout|read your stats/i],
    ] as const)(
      "renders an info banner for scrape failure reason %s and does not POST",
      async (reason, messagePattern) => {
        const { scrapeStats } = await import("./scrapeStats");
        const { postIngest } = await import("./ingestClient");
        const { renderInfoBanner } = await import("./banners");
        vi.mocked(scrapeStats).mockReturnValue({ ok: false, reason } as ScrapeResult);

        await import("./entrypoint");
        await vi.waitFor(() => expect(renderInfoBanner).toHaveBeenCalled());

        expect(renderInfoBanner).toHaveBeenCalledWith(
          document.body,
          expect.objectContaining({ message: expect.stringMatching(messagePattern) }),
        );
        expect(postIngest).not.toHaveBeenCalled();
      },
    );
  });

  describe("HTTP error responses", () => {
    it("renders the unauthorized banner on a tokenMismatch (403) result", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderUnauthorizedBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({ status: "tokenMismatch" } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderUnauthorizedBanner).toHaveBeenCalled());

      expect(renderUnauthorizedBanner).toHaveBeenCalledWith(
        document.body,
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    it("renders a failure banner explaining the bookmarklet is out of date on a schemaMismatch (426) result", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderFailureBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({ status: "schemaMismatch" } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderFailureBanner).toHaveBeenCalled());

      expect(renderFailureBanner).toHaveBeenCalledWith(
        document.body,
        expect.objectContaining({
          message: expect.stringMatching(/out of date|reinstall/i),
          schemaVersion: 1,
        }),
      );
    });

    it("renders a failure banner with the server's message on an invalid (422) result", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderFailureBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({
        status: "invalid",
        message: "username is required",
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderFailureBanner).toHaveBeenCalled());

      expect(renderFailureBanner).toHaveBeenCalledWith(
        document.body,
        expect.objectContaining({ message: "username is required", schemaVersion: 1 }),
      );
    });
  });

  describe("network/5xx failure", () => {
    it("renders a retry banner whose onRetry re-POSTs the same payload without re-scraping", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderRetryBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({ status: "networkError" } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderRetryBanner).toHaveBeenCalled());

      expect(scrapeStats).toHaveBeenCalledTimes(1);
      expect(postIngest).toHaveBeenCalledTimes(1);

      const { onRetry } = vi.mocked(renderRetryBanner).mock.calls[0][1] as unknown as {
        onRetry: () => void;
      };
      onRetry();
      await vi.waitFor(() => expect(postIngest).toHaveBeenCalledTimes(2));

      expect(scrapeStats).toHaveBeenCalledTimes(1);
    });
  });

  describe("re-injection guard", () => {
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
  });
});
