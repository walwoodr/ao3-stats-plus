import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkPageScrapeResult } from "./scrapeWorkPage";
import type { FetchWorkBookmarksResult } from "./scrapeWorkBookmarks";
import type { WorkDetailIngestResult } from "./workDetailIngestClient";

// fanOut.ts is Phase 2's orchestrator (docs/plans/work-page-enrichment-data-model.md
// section 5): sequential, throttled, per-work "fetch work page -> fetch
// bookmarks -> build payload -> POST" iteration with a per-request timeout/
// abort, a circuit breaker on repeated AO3-fetch failures, safety caps, and
// a live progress banner + a final summary banner. AO3 fetch/timeout
// mechanics are injected via FanOutDependencies (fetchWorkPageDocument/
// fetchBookmarksPageDocument resolve to null on a timed-out/failed fetch,
// mirroring an AbortController-based fetch wrapper's outcome) rather than
// exercised through a real fetch()/AbortController here, so this spec is a
// pure test of the orchestration logic - scrapeWorkPage, scrapeWorkBookmarks
// (fetchAllWorkBookmarks), workDetailIngestClient (postWorkDetail), and
// banners are all mocked, per the plan's own framing of this task.
vi.mock("./scrapeWorkPage", () => ({ scrapeWorkPage: vi.fn() }));
vi.mock("./scrapeWorkBookmarks", () => ({ fetchAllWorkBookmarks: vi.fn() }));
vi.mock("./workDetailIngestClient", () => ({ postWorkDetail: vi.fn() }));
vi.mock("./banners", () => ({
  renderProgressBanner: vi.fn(),
  updateProgressBanner: vi.fn(),
  renderSummaryBanner: vi.fn(),
}));

const API_ORIGIN = "https://api.example.com";

const scrapedWorkPage = (ao3WorkId: number): WorkPageScrapeResult =>
  ({
    ok: true,
    data: {
      ao3WorkId, publicBookmarks: 1, visibleComments: 2, publishedOn: "2023-05-01",
      chapterCount: 1, chaptersExpected: 1, complete: false, series: [],
    },
  }) as WorkPageScrapeResult;

const emptyBookmarksResult: FetchWorkBookmarksResult = { bookmarks: [], truncated: false, pagesFetched: 1 };

function stubBannerImplementation(fn: ReturnType<typeof vi.fn>) {
  fn.mockImplementation((container: HTMLElement) => {
    const el = document.createElement("div");
    container.appendChild(el);
    return el;
  });
}

async function importRunFanOut() {
  const { runFanOut } = await import("./fanOut");
  return runFanOut;
}

describe("runFanOut", () => {
  let container: HTMLElement;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);

    const banners = await import("./banners");
    stubBannerImplementation(vi.mocked(banners.renderProgressBanner));
    stubBannerImplementation(vi.mocked(banners.renderSummaryBanner));
  });

  afterEach(() => {
    container.remove();
  });

  function baseOptions(
    works: number[],
    overrides: {
      throttleMs?: number;
      circuitBreakerThreshold?: number;
      maxWorksPerRun?: number;
      maxBookmarkPagesPerWork?: number;
    } = {},
  ) {
    return {
      apiOrigin: API_ORIGIN,
      username: "someauthor",
      readToken: "tok_prev",
      works: works.map((ao3WorkId) => ({ ao3WorkId })),
      container,
      ...overrides,
    };
  }

  async function stubSuccessfulWork(ao3WorkId: number) {
    const { scrapeWorkPage } = await import("./scrapeWorkPage");
    const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
    const { postWorkDetail } = await import("./workDetailIngestClient");
    vi.mocked(scrapeWorkPage).mockReturnValueOnce(scrapedWorkPage(ao3WorkId));
    vi.mocked(fetchAllWorkBookmarks).mockResolvedValueOnce(emptyBookmarksResult);
    vi.mocked(postWorkDetail).mockResolvedValueOnce({ status: "success" } as WorkDetailIngestResult);
  }

  describe("sequential throttled iteration (never parallel bursts)", () => {
    it("does not start fetching work 2 until work 1's full chain has resolved", async () => {
      const runFanOut = await importRunFanOut();
      let resolveWork1: () => void = () => {};
      const fetchWorkPageDocument = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Document | null>((resolve) => {
              resolveWork1 = () => resolve(new Document());
            }),
        )
        .mockImplementationOnce(() => Promise.resolve(new Document()));

      await stubSuccessfulWork(111);
      await stubSuccessfulWork(222);

      const runPromise = runFanOut(baseOptions([111, 222]), {
        fetchWorkPageDocument,
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(fetchWorkPageDocument).toHaveBeenCalledTimes(1);

      resolveWork1();
      await runPromise;

      expect(fetchWorkPageDocument).toHaveBeenCalledTimes(2);
    });

    it("sleeps between each work's requests (throttled, not fired back-to-back)", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      await stubSuccessfulWork(222);
      const sleep = vi.fn().mockResolvedValue(undefined);

      await runFanOut(baseOptions([111, 222], { throttleMs: 750 }), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep,
      });

      expect(sleep).toHaveBeenCalledWith(750);
    });
  });

  describe("per-work POST persists incrementally", () => {
    it("calls postWorkDetail once per work, during the loop rather than batched at the end", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      await stubSuccessfulWork(222);
      const { postWorkDetail } = await import("./workDetailIngestClient");

      await runFanOut(baseOptions([111, 222]), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(postWorkDetail).toHaveBeenCalledTimes(2);
    });
  });

  describe("partial success (the normal operating mode)", () => {
    it("tallies a fetch failure as skipped but still enriches the surrounding works", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      await stubSuccessfulWork(333);
      const fetchWorkPageDocument = vi
        .fn()
        .mockResolvedValueOnce(new Document())
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(new Document());

      const summary = await runFanOut(baseOptions([111, 222, 333]), {
        fetchWorkPageDocument,
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(summary).toMatchObject({ total: 3, enriched: 2, skipped: 1 });
    });

    it("tallies a postWorkDetail failure (e.g. a 422) as skipped without aborting the run", async () => {
      const runFanOut = await importRunFanOut();
      const { scrapeWorkPage } = await import("./scrapeWorkPage");
      const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
      const { postWorkDetail } = await import("./workDetailIngestClient");
      vi.mocked(scrapeWorkPage).mockReturnValue(scrapedWorkPage(111));
      vi.mocked(fetchAllWorkBookmarks).mockResolvedValue(emptyBookmarksResult);
      vi.mocked(postWorkDetail)
        .mockResolvedValueOnce({ status: "invalid", message: "bad payload" } as WorkDetailIngestResult)
        .mockResolvedValueOnce({ status: "success" } as WorkDetailIngestResult);

      const summary = await runFanOut(baseOptions([111, 222]), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(summary).toMatchObject({ total: 2, enriched: 1, skipped: 1 });
    });
  });

  describe("per-request timeout/abort", () => {
    it("skips a work whose page fetch resolves null (timed out/aborted) and continues to the next", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(222);
      const fetchWorkPageDocument = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(new Document());

      const summary = await runFanOut(baseOptions([111, 222]), {
        fetchWorkPageDocument,
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(fetchWorkPageDocument).toHaveBeenCalledTimes(2);
      expect(summary).toMatchObject({ enriched: 1, skipped: 1 });
    });
  });

  describe("circuit breaker on repeated AO3-fetch failures", () => {
    it("stops the run early after N consecutive fetch failures and marks circuitBroken", async () => {
      const runFanOut = await importRunFanOut();
      const fetchWorkPageDocument = vi.fn().mockResolvedValue(null);

      const summary = await runFanOut(
        baseOptions([111, 222, 333, 444, 555], { circuitBreakerThreshold: 3 }),
        {
          fetchWorkPageDocument,
          fetchBookmarksPageDocument: vi.fn(),
          sleep: vi.fn().mockResolvedValue(undefined),
        },
      );

      expect(fetchWorkPageDocument).toHaveBeenCalledTimes(3);
      expect(summary.circuitBroken).toBe(true);
      expect(summary.enriched).toBe(0);
    });

    it("does not trip the breaker when a success resets the consecutive-failure count", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(222);
      const fetchWorkPageDocument = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(new Document()) // resets the streak
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const summary = await runFanOut(
        baseOptions([111, 112, 222, 113, 114], { circuitBreakerThreshold: 3 }),
        {
          fetchWorkPageDocument,
          fetchBookmarksPageDocument: vi.fn(),
          sleep: vi.fn().mockResolvedValue(undefined),
        },
      );

      expect(summary.circuitBroken).toBe(false);
      expect(fetchWorkPageDocument).toHaveBeenCalledTimes(5);
    });

    it("already-enriched works stay counted even when a later circuit break stops the run", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      const fetchWorkPageDocument = vi
        .fn()
        .mockResolvedValueOnce(new Document())
        .mockResolvedValue(null);

      const summary = await runFanOut(
        baseOptions([111, 222, 333, 444], { circuitBreakerThreshold: 2 }),
        {
          fetchWorkPageDocument,
          fetchBookmarksPageDocument: vi.fn(),
          sleep: vi.fn().mockResolvedValue(undefined),
        },
      );

      expect(summary.enriched).toBe(1);
      expect(summary.circuitBroken).toBe(true);
    });
  });

  describe("safety caps", () => {
    it("truncates to maxWorksPerRun and reports truncatedWorks rather than silently dropping the rest", async () => {
      const runFanOut = await importRunFanOut();
      const { scrapeWorkPage } = await import("./scrapeWorkPage");
      const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
      const { postWorkDetail } = await import("./workDetailIngestClient");
      vi.mocked(scrapeWorkPage).mockReturnValue(scrapedWorkPage(111));
      vi.mocked(fetchAllWorkBookmarks).mockResolvedValue(emptyBookmarksResult);
      vi.mocked(postWorkDetail).mockResolvedValue({ status: "success" } as WorkDetailIngestResult);
      const fetchWorkPageDocument = vi.fn().mockResolvedValue(new Document());

      const summary = await runFanOut(
        baseOptions([111, 222, 333, 444, 555], { maxWorksPerRun: 3 }),
        {
          fetchWorkPageDocument,
          fetchBookmarksPageDocument: vi.fn(),
          sleep: vi.fn().mockResolvedValue(undefined),
        },
      );

      expect(fetchWorkPageDocument).toHaveBeenCalledTimes(3);
      expect(summary).toMatchObject({ total: 3, truncatedWorks: true });
    });

    it("forwards maxBookmarkPagesPerWork to fetchAllWorkBookmarks and reports a truncated work's bookmark pages", async () => {
      const runFanOut = await importRunFanOut();
      const { scrapeWorkPage } = await import("./scrapeWorkPage");
      const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
      const { postWorkDetail } = await import("./workDetailIngestClient");
      vi.mocked(scrapeWorkPage).mockReturnValue(scrapedWorkPage(111));
      vi.mocked(fetchAllWorkBookmarks).mockResolvedValue({ bookmarks: [], truncated: true, pagesFetched: 5 });
      vi.mocked(postWorkDetail).mockResolvedValue({ status: "success" } as WorkDetailIngestResult);

      const summary = await runFanOut(baseOptions([111], { maxBookmarkPagesPerWork: 5 }), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(fetchAllWorkBookmarks).toHaveBeenCalledWith(expect.any(Function), { maxPages: 5 });
      expect(summary.truncatedBookmarkPagesCount).toBe(1);
    });
  });

  describe("progress banner", () => {
    it("renders a progress banner once and updates it in place once per work processed", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      await stubSuccessfulWork(222);
      const banners = await import("./banners");

      await runFanOut(baseOptions([111, 222]), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(banners.renderProgressBanner).toHaveBeenCalledTimes(1);
      expect(banners.updateProgressBanner).toHaveBeenCalledTimes(2);
      expect(banners.updateProgressBanner).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({ current: 1, total: 2 }),
      );
      expect(banners.updateProgressBanner).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({ current: 2, total: 2 }),
      );
    });
  });

  describe("final summary banner", () => {
    it("removes the progress banner before rendering the summary banner", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      const banners = await import("./banners");

      await runFanOut(baseOptions([111]), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      const progressBanner = vi.mocked(banners.renderProgressBanner).mock.results[0]?.value as HTMLElement;
      expect(progressBanner.isConnected).toBe(false);
      expect(banners.renderSummaryBanner).toHaveBeenCalledTimes(1);
    });

    it("reports success/skip/truncation counts in the summary banner data", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      const { scrapeWorkPage } = await import("./scrapeWorkPage");
      // stubSuccessfulWork queued one successful scrapeWorkPage() return for
      // work 111 via mockReturnValueOnce - this sets the *default* fallback
      // used once that one-shot queue is exhausted, so work 222 fails.
      vi.mocked(scrapeWorkPage).mockReturnValue({ ok: false, reason: "scrape-failed" });
      const banners = await import("./banners");

      await runFanOut(baseOptions([111, 222]), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(banners.renderSummaryBanner).toHaveBeenCalledWith(
        container,
        expect.objectContaining({ enriched: 1, skipped: 1, total: 2 }),
      );
    });
  });
});
