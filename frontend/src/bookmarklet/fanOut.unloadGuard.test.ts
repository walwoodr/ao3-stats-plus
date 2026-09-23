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
// rationale. This file covers ROADMAP.md's "don't close this page" guard
// (2026-08-02 v2 candidate): the beforeunload listener (unloadGuard.ts)
// must be active for exactly the lifetime of a run - started when the
// progress banner appears, stopped in every terminal state (success,
// partial-success/failure, circuit-broken, and an unexpected throw), never
// left dangling afterward.
//
// unloadGuard.ts is deliberately imported dynamically (via
// importIsUnloadGuardActive below), never statically at module scope: this
// suite calls vi.resetModules() per test (matching every sibling fanOut.*
// test file's pattern), which gives fanOut.ts's own dynamically-resolved
// "./unloadGuard" import a fresh module instance each time - a static
// top-level import here would instead keep pointing at whatever instance
// existed when this test file first loaded, permanently out of sync with
// the instance fanOut.ts is actually using from the second test onward.
async function importIsUnloadGuardActive() {
  const { isUnloadGuardActive } = await import("./unloadGuard");
  return isUnloadGuardActive;
}
vi.mock("./scrapeWorkPage", () => ({ scrapeWorkPage: vi.fn() }));
vi.mock("./scrapeWorkBookmarks", () => ({ fetchAllWorkBookmarks: vi.fn() }));
vi.mock("./workDetailIngestClient", () => ({ postWorkDetail: vi.fn() }));
vi.mock("./banners", () => ({
  renderProgressBanner: vi.fn(),
  updateProgressBanner: vi.fn(),
  renderSummaryBanner: vi.fn(),
}));

describe("runFanOut - beforeunload guard lifecycle", () => {
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

  afterEach(async () => {
    // Cleans up using the same module instance the just-run test's fanOut.ts
    // used - resetModules() in the *next* beforeEach discards it anyway, so
    // this only matters for a test that fails partway through and leaves a
    // real listener attached to this shared jsdom `window`.
    const { stopUnloadGuard } = await import("./unloadGuard");
    stopUnloadGuard();
    container.remove();
  });

  it("is not active before a run starts", async () => {
    const isUnloadGuardActive = await importIsUnloadGuardActive();
    expect(isUnloadGuardActive()).toBe(false);
  });

  it("is active while the run is in progress", async () => {
    const runFanOut = await importRunFanOut();
    const isUnloadGuardActive = await importIsUnloadGuardActive();
    let resolveWork: () => void = () => {};
    const fetchWorkPageDocument = vi.fn().mockImplementation(
      () =>
        new Promise<Document | null>((resolve) => {
          resolveWork = () => resolve(new Document());
        }),
    );
    await stubSuccessfulWork(111);

    const runPromise = runFanOut(baseOptions(container, [111]), {
      fetchWorkPageDocument,
      fetchBookmarksPageDocument: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(isUnloadGuardActive()).toBe(true);

    resolveWork();
    await runPromise;
  });

  it("is inactive again once the run completes successfully", async () => {
    const runFanOut = await importRunFanOut();
    const isUnloadGuardActive = await importIsUnloadGuardActive();
    await stubSuccessfulWork(111);

    await runFanOut(baseOptions(container, [111]), {
      fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
      fetchBookmarksPageDocument: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(isUnloadGuardActive()).toBe(false);
  });

  it("is inactive again once the run completes with only partial success", async () => {
    const runFanOut = await importRunFanOut();
    const isUnloadGuardActive = await importIsUnloadGuardActive();
    const { scrapeWorkPage } = await import("./scrapeWorkPage");
    vi.mocked(scrapeWorkPage).mockReturnValue({ ok: false, reason: "scrape-failed" });

    await runFanOut(baseOptions(container, [111, 222]), {
      fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
      fetchBookmarksPageDocument: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(isUnloadGuardActive()).toBe(false);
  });

  it("is inactive again once the run stops early via the circuit breaker", async () => {
    const runFanOut = await importRunFanOut();
    const isUnloadGuardActive = await importIsUnloadGuardActive();
    const fetchWorkPageDocument = vi.fn().mockResolvedValue(null);

    const summary = await runFanOut(
      baseOptions(container, [111, 222, 333], { circuitBreakerThreshold: 2 }),
      {
        fetchWorkPageDocument,
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      },
    );

    expect(summary.circuitBroken).toBe(true);
    expect(isUnloadGuardActive()).toBe(false);
  });

  it("is inactive again if the run throws unexpectedly mid-loop", async () => {
    const runFanOut = await importRunFanOut();
    const isUnloadGuardActive = await importIsUnloadGuardActive();
    const { scrapeWorkPage } = await import("./scrapeWorkPage");
    vi.mocked(scrapeWorkPage).mockImplementation(() => {
      throw new Error("unexpected scrape crash");
    });

    await expect(
      runFanOut(baseOptions(container, [111]), {
        fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
        fetchBookmarksPageDocument: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow("unexpected scrape crash");

    expect(isUnloadGuardActive()).toBe(false);
  });

  it("guards a run with zero works (still inactive by the time it resolves)", async () => {
    const runFanOut = await importRunFanOut();
    const isUnloadGuardActive = await importIsUnloadGuardActive();

    await runFanOut(baseOptions(container, []), {
      fetchWorkPageDocument: vi.fn(),
      fetchBookmarksPageDocument: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(isUnloadGuardActive()).toBe(false);
  });

  it("does not require postWorkDetail to resolve for the guard to be considered active mid-run", async () => {
    // Sanity check distinguishing this guard from postWorkDetail success/
    // failure - it tracks run-in-progress, not per-work outcome.
    const runFanOut = await importRunFanOut();
    const isUnloadGuardActive = await importIsUnloadGuardActive();
    const { scrapeWorkPage } = await import("./scrapeWorkPage");
    const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
    const { postWorkDetail } = await import("./workDetailIngestClient");
    vi.mocked(scrapeWorkPage).mockReturnValue(scrapedWorkPage(111));
    vi.mocked(fetchAllWorkBookmarks).mockResolvedValue({
      bookmarks: [],
      truncated: false,
      pagesFetched: 1,
    });
    let resolvePost: (result: WorkDetailIngestResult) => void = () => {};
    vi.mocked(postWorkDetail).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    const runPromise = runFanOut(baseOptions(container, [111]), {
      fetchWorkPageDocument: vi.fn().mockResolvedValue(new Document()),
      fetchBookmarksPageDocument: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(isUnloadGuardActive()).toBe(true);

    resolvePost({ status: "success" } as WorkDetailIngestResult);
    await runPromise;
    expect(isUnloadGuardActive()).toBe(false);
  });
});
