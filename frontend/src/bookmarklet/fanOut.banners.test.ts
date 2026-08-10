import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  baseOptions,
  importRunFanOut,
  stubBannerImplementation,
  stubSuccessfulWork,
} from "./fanOutTestSupport";

// Split from fanOut.test.ts (CODE_STANDARDS.md's 400-line .ts budget) - see
// fanOutTestSupport.ts's doc comment for the shared fixtures/mocking
// rationale. This file covers the live progress banner and the final
// summary banner the run renders into the page.
vi.mock("./scrapeWorkPage", () => ({ scrapeWorkPage: vi.fn() }));
vi.mock("./scrapeWorkBookmarks", () => ({ fetchAllWorkBookmarks: vi.fn() }));
vi.mock("./workDetailIngestClient", () => ({ postWorkDetail: vi.fn() }));
vi.mock("./banners", () => ({
  renderProgressBanner: vi.fn(),
  updateProgressBanner: vi.fn(),
  renderSummaryBanner: vi.fn(),
}));

describe("runFanOut - progress and summary banners", () => {
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

  describe("progress banner", () => {
    it("renders a progress banner once and updates it in place once per work processed", async () => {
      const runFanOut = await importRunFanOut();
      await stubSuccessfulWork(111);
      await stubSuccessfulWork(222);
      const banners = await import("./banners");

      await runFanOut(baseOptions(container, [111, 222]), {
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

      await runFanOut(baseOptions(container, [111]), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      const progressBanner = vi.mocked(banners.renderProgressBanner).mock.results[0]
        ?.value as HTMLElement;
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

      await runFanOut(baseOptions(container, [111, 222]), {
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
