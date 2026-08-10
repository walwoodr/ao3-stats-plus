import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkDetailIngestResult } from "./workDetailIngestClient";
import {
  baseOptions,
  emptyBookmarksResult,
  importRunFanOut,
  scrapedWorkPage,
  stubBannerImplementation,
  stubSuccessfulWork,
} from "./fanOutTestSupport";

// Split from fanOut.test.ts (CODE_STANDARDS.md's 400-line .ts budget) - see
// fanOutTestSupport.ts's doc comment for the shared fixtures/mocking
// rationale. This file covers the core sequential/throttled orchestration
// loop, its per-work incremental POST behavior, and its two "keep going"
// failure modes (partial success, per-request timeout/abort) - the
// happy-path-adjacent scenarios, as opposed to the circuit-breaker/
// safety-cap/banner scenarios split into their own sibling files.
vi.mock("./scrapeWorkPage", () => ({ scrapeWorkPage: vi.fn() }));
vi.mock("./scrapeWorkBookmarks", () => ({ fetchAllWorkBookmarks: vi.fn() }));
vi.mock("./workDetailIngestClient", () => ({ postWorkDetail: vi.fn() }));
vi.mock("./banners", () => ({
  renderProgressBanner: vi.fn(),
  updateProgressBanner: vi.fn(),
  renderSummaryBanner: vi.fn(),
}));

describe("runFanOut - sequencing, throttle, and partial success", () => {
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

      const runPromise = runFanOut(baseOptions(container, [111, 222]), {
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

      await runFanOut(baseOptions(container, [111, 222], { throttleMs: 750 }), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep,
      });

      expect(sleep).toHaveBeenCalledWith(750);
    });

    it("sleeps before each bookmark-page fetch within a work, not just once at the work boundary", async () => {
      const runFanOut = await importRunFanOut();
      const { scrapeWorkPage } = await import("./scrapeWorkPage");
      const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
      const { postWorkDetail } = await import("./workDetailIngestClient");
      vi.mocked(scrapeWorkPage).mockReturnValue(scrapedWorkPage(111));
      vi.mocked(postWorkDetail).mockResolvedValue({ status: "success" } as WorkDetailIngestResult);

      const calls: string[] = [];
      const sleep = vi.fn().mockImplementation(async () => {
        calls.push("sleep");
      });
      const fetchBookmarksPageDocument = vi.fn().mockImplementation(async () => {
        calls.push("bookmarkFetch");
        return new Document();
      });

      // Simulates fetchAllWorkBookmarks's real pagination-following behavior
      // (two pages) so we can observe how the injected fetchPage callback
      // (fetchBookmarksPageOrEmpty in fanOut.ts) interleaves with sleep,
      // without depending on scrapeWorkBookmarks's real implementation.
      vi.mocked(fetchAllWorkBookmarks).mockImplementation(async (fetchPage) => {
        await fetchPage(1);
        await fetchPage(2);
        return { bookmarks: [], truncated: false, pagesFetched: 2 };
      });

      await runFanOut(baseOptions(container, [111], { throttleMs: 750 }), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument,
        sleep,
      });

      expect(sleep).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(750);
      expect(calls).toEqual(["sleep", "bookmarkFetch", "sleep", "bookmarkFetch"]);
    });
  });

  describe("per-work POST persists incrementally", () => {
    it("calls postWorkDetail once per work, during the loop rather than batched at the end", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      await stubSuccessfulWork(222);
      const { postWorkDetail } = await import("./workDetailIngestClient");

      await runFanOut(baseOptions(container, [111, 222]), {
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

      const summary = await runFanOut(baseOptions(container, [111, 222, 333]), {
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
        .mockResolvedValueOnce({
          status: "invalid",
          message: "bad payload",
        } as WorkDetailIngestResult)
        .mockResolvedValueOnce({ status: "success" } as WorkDetailIngestResult);

      const summary = await runFanOut(baseOptions(container, [111, 222]), {
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
      const fetchWorkPageDocument = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(new Document());

      const summary = await runFanOut(baseOptions(container, [111, 222]), {
        fetchWorkPageDocument,
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(fetchWorkPageDocument).toHaveBeenCalledTimes(2);
      expect(summary).toMatchObject({ enriched: 1, skipped: 1 });
    });
  });
});
