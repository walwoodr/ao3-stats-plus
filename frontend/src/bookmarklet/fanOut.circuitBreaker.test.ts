import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkDetailIngestResult } from "./workDetailIngestClient";
import {
  baseOptions,
  importRunFanOut,
  scrapedWorkPage,
  stubBannerImplementation,
  stubSuccessfulWork,
} from "./fanOutTestSupport";

// Split from fanOut.test.ts (CODE_STANDARDS.md's 400-line .ts budget) - see
// fanOutTestSupport.ts's doc comment for the shared fixtures/mocking
// rationale. This file covers the circuit breaker that stops a run early
// after too many consecutive AO3-fetch failures (work-page or bookmark-page).
vi.mock("./scrapeWorkPage", () => ({ scrapeWorkPage: vi.fn() }));
vi.mock("./scrapeWorkBookmarks", () => ({ fetchAllWorkBookmarks: vi.fn() }));
vi.mock("./workDetailIngestClient", () => ({ postWorkDetail: vi.fn() }));
vi.mock("./banners", () => ({
  renderProgressBanner: vi.fn(),
  updateProgressBanner: vi.fn(),
  renderSummaryBanner: vi.fn(),
}));

describe("runFanOut - circuit breaker on repeated AO3-fetch failures", () => {
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

  it("stops the run early after N consecutive fetch failures and marks circuitBroken", async () => {
    const runFanOut = await importRunFanOut();
    const fetchWorkPageDocument = vi.fn().mockResolvedValue(null);

    const summary = await runFanOut(
      baseOptions(container, [111, 222, 333, 444, 555], { circuitBreakerThreshold: 3 }),
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
      baseOptions(container, [111, 112, 222, 113, 114], { circuitBreakerThreshold: 3 }),
      {
        fetchWorkPageDocument,
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(summary.circuitBroken).toBe(false);
    expect(fetchWorkPageDocument).toHaveBeenCalledTimes(5);
  });

  it("counts a bookmark-page fetch failure toward the consecutive-failure count, same as a work-page failure", async () => {
    const runFanOut = await importRunFanOut();
    const { scrapeWorkPage } = await import("./scrapeWorkPage");
    const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
    const { postWorkDetail } = await import("./workDetailIngestClient");
    vi.mocked(scrapeWorkPage).mockReturnValue(scrapedWorkPage(111));
    vi.mocked(postWorkDetail).mockResolvedValue({ status: "success" } as WorkDetailIngestResult);

    // Two bookmark-page fetches resolve null (timed out/failed); the
    // work-page fetch itself succeeds, so any tripped breaker must be
    // attributable to the bookmark-page failures.
    vi.mocked(fetchAllWorkBookmarks).mockImplementation(async (fetchPage) => {
      await fetchPage(1);
      await fetchPage(2);
      return { bookmarks: [], truncated: false, pagesFetched: 2 };
    });

    const summary = await runFanOut(baseOptions(container, [111], { circuitBreakerThreshold: 2 }), {
      fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
      fetchBookmarksPageDocument: vi.fn().mockResolvedValue(null),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(summary.circuitBroken).toBe(true);
  });

  it("already-enriched works stay counted even when a later circuit break stops the run", async () => {
    const runFanOut = await importRunFanOut();
    await stubSuccessfulWork(111);
    const fetchWorkPageDocument = vi
      .fn()
      .mockResolvedValueOnce(new Document())
      .mockResolvedValue(null);

    const summary = await runFanOut(
      baseOptions(container, [111, 222, 333, 444], { circuitBreakerThreshold: 2 }),
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
