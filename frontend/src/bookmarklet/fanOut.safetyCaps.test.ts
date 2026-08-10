import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkDetailIngestResult } from "./workDetailIngestClient";
import {
  baseOptions,
  emptyBookmarksResult,
  importRunFanOut,
  scrapedWorkPage,
  stubBannerImplementation,
} from "./fanOutTestSupport";

// Split from fanOut.test.ts (CODE_STANDARDS.md's 400-line .ts budget) - see
// fanOutTestSupport.ts's doc comment for the shared fixtures/mocking
// rationale. This file covers the run's safety caps (maxWorksPerRun,
// maxBookmarkPagesPerWork) that truncate rather than silently drop work.
vi.mock("./scrapeWorkPage", () => ({ scrapeWorkPage: vi.fn() }));
vi.mock("./scrapeWorkBookmarks", () => ({ fetchAllWorkBookmarks: vi.fn() }));
vi.mock("./workDetailIngestClient", () => ({ postWorkDetail: vi.fn() }));
vi.mock("./banners", () => ({
  renderProgressBanner: vi.fn(),
  updateProgressBanner: vi.fn(),
  renderSummaryBanner: vi.fn(),
}));

describe("runFanOut - safety caps", () => {
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
      baseOptions(container, [111, 222, 333, 444, 555], { maxWorksPerRun: 3 }),
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
    vi.mocked(fetchAllWorkBookmarks).mockResolvedValue({
      bookmarks: [],
      truncated: true,
      pagesFetched: 5,
    });
    vi.mocked(postWorkDetail).mockResolvedValue({ status: "success" } as WorkDetailIngestResult);

    const summary = await runFanOut(baseOptions(container, [111], { maxBookmarkPagesPerWork: 5 }), {
      fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
      fetchBookmarksPageDocument: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(fetchAllWorkBookmarks).toHaveBeenCalledWith(expect.any(Function), { maxPages: 5 });
    expect(summary.truncatedBookmarkPagesCount).toBe(1);
  });
});
