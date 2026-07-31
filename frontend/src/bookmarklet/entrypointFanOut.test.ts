import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapedData, ScrapeResult } from "./scrapeStats";
import type { IngestResult } from "./ingestClient";

declare global {
  interface Window {
    __ao3StatsPlus?: { banner: HTMLElement | null };
  }
}

// This is a focused sibling to entrypoint.test.ts, scoped to exactly one
// new concern from the work-page enrichment plan (section 2, task 7): once
// entrypoint.ts is wired to run Phase 2, Phase 1's scrape+POST (unchanged)
// must fully complete and persist *before* Phase 2's fan-out (runFanOut)
// starts, so the reliable core path is never blocked or slowed by it, and
// today's snapshot is guaranteed to exist for enrichment to attach to (plan
// section 2, step 2). Kept in its own file rather than folded into
// entrypoint.test.ts's already-near-the-400-line-cap suite - see
// CODE_STANDARDS.md's per-file-type length limits.
//
// entrypoint.ts does not import "./fanOut" yet (that wiring is
// Implementation's job, plan task 14) - mocking it here is inert until
// then, which is exactly why these assertions are expected to fail (red):
// runFanOut is never actually called.
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
vi.mock("./fanOut", () => ({ runFanOut: vi.fn() }));

const FRONTEND_ORIGIN = "https://app.example.com";
const API_ORIGIN = "https://api.example.com";
const AO3_PATHNAME = "/users/someauthor/stats";

const scrapedData: ScrapedData = {
  username: "someauthor",
  earliestPostYear: null,
  aggregate: {
    hits: 1234, kudos: 100, comments: 20, bookmarks: 15, subscriptions: 10,
    userSubscriptions: 5, wordCount: 75_000, worksCount: 1,
  },
  works: [
    {
      ao3WorkId: 111, title: "Work A", fandoms: ["Fandom One"], hits: 400,
      kudos: 40, comments: 8, bookmarks: 6, subscriptions: 4, wordCount: 30_000,
    },
  ],
};

function stubCurrentScript(src: string) {
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: { src } as unknown as HTMLScriptElement,
  });
}

function stubBannerImplementation(fn: ReturnType<typeof vi.fn>) {
  fn.mockImplementation((container: HTMLElement) => {
    const el = document.createElement("div");
    container.appendChild(el);
    return el;
  });
}

describe("bookmarklet entrypoint - Phase 1 -> Phase 2 handoff", () => {
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

  it("starts Phase 2's fan-out only after Phase 1's POST has resolved successfully", async () => {
    const { scrapeStats } = await import("./scrapeStats");
    const { postIngest } = await import("./ingestClient");
    const { runFanOut } = await import("./fanOut");
    vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
    vi.mocked(postIngest).mockResolvedValue({
      status: "success", readToken: "tok_new", capturedOn: "2026-07-23", deduped: false,
    } as IngestResult);

    await import("./entrypoint");
    await vi.waitFor(() => expect(runFanOut).toHaveBeenCalled());

    expect(postIngest).toHaveBeenCalled();
  });

  it("passes the scraped works, username, apiOrigin, and the POST result's readToken into the fan-out", async () => {
    const { scrapeStats } = await import("./scrapeStats");
    const { postIngest } = await import("./ingestClient");
    const { runFanOut } = await import("./fanOut");
    vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
    vi.mocked(postIngest).mockResolvedValue({
      status: "success", readToken: "tok_new", capturedOn: "2026-07-23", deduped: false,
    } as IngestResult);

    await import("./entrypoint");
    await vi.waitFor(() => expect(runFanOut).toHaveBeenCalled());

    expect(runFanOut).toHaveBeenCalledWith(
      expect.objectContaining({
        apiOrigin: API_ORIGIN,
        username: "someauthor",
        readToken: "tok_new",
        works: [expect.objectContaining({ ao3WorkId: 111 })],
      }),
      expect.anything(),
    );
  });

  it("still starts the fan-out on a same-day dedup response (deduped: true is still success)", async () => {
    const { scrapeStats } = await import("./scrapeStats");
    const { postIngest } = await import("./ingestClient");
    const { runFanOut } = await import("./fanOut");
    vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
    vi.mocked(postIngest).mockResolvedValue({
      status: "success", readToken: "tok_prev", capturedOn: "2026-07-23", deduped: true,
    } as IngestResult);

    await import("./entrypoint");
    await vi.waitFor(() => expect(runFanOut).toHaveBeenCalled());
  });

  it.each(["tokenMismatch", "schemaMismatch", "networkError"] as const)(
    "does not start the fan-out when Phase 1's POST result is %s",
    async (status) => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { runFanOut } = await import("./fanOut");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({ status } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(postIngest).toHaveBeenCalled());

      expect(runFanOut).not.toHaveBeenCalled();
    },
  );

  it("does not start the fan-out (or POST) when the scrape itself fails", async () => {
    const { scrapeStats } = await import("./scrapeStats");
    const { postIngest } = await import("./ingestClient");
    const { runFanOut } = await import("./fanOut");
    vi.mocked(scrapeStats).mockReturnValue({ ok: false, reason: "no-works" } as ScrapeResult);

    await import("./entrypoint");
    await vi.waitFor(() => expect(postIngest).not.toHaveBeenCalled());

    expect(runFanOut).not.toHaveBeenCalled();
  });
});
