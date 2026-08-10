import { vi } from "vitest";
import type { WorkPageScrapeResult } from "./scrapeWorkPage";
import type { FetchWorkBookmarksResult } from "./scrapeWorkBookmarks";
import type { WorkDetailIngestResult } from "./workDetailIngestClient";

// Shared fixtures/mocks/helpers for fanOut.ts's test suite, split by scenario
// group into sibling fanOut.*.test.ts files (CODE_STANDARDS.md's 400-line
// .ts budget - the single fanOut.test.ts this replaces had grown to 486
// lines). Every split file imports from here rather than re-declaring its
// own copies, so the fixtures can't drift between them. See fanOut.test.ts's
// original module doc comment (preserved verbatim below) for why the AO3
// fetch/timeout mechanics are injected rather than exercised via a real
// fetch()/AbortController.
//
// fanOut.ts is Phase 2's orchestrator (docs/plans/work-page-enrichment-data-model.md
// section 5): sequential, throttled, per-work "fetch work page -> fetch
// bookmarks -> build payload -> POST" iteration with a per-request timeout/
// abort, a circuit breaker on repeated AO3-fetch failures, safety caps, and
// a live progress banner + a final summary banner. scrapeWorkPage,
// scrapeWorkBookmarks (fetchAllWorkBookmarks), workDetailIngestClient
// (postWorkDetail), and banners are all mocked, per the plan's own framing
// of this task - each split spec file declares its own vi.mock() calls
// (required at module scope, so they can't live here).

export const API_ORIGIN = "https://api.example.com";

export const scrapedWorkPage = (ao3WorkId: number): WorkPageScrapeResult =>
  ({
    ok: true,
    data: {
      ao3WorkId,
      publicBookmarks: 1,
      visibleComments: 2,
      publishedOn: "2023-05-01",
      chapterCount: 1,
      chaptersExpected: 1,
      complete: false,
      series: [],
    },
  }) as WorkPageScrapeResult;

export const emptyBookmarksResult: FetchWorkBookmarksResult = {
  bookmarks: [],
  truncated: false,
  pagesFetched: 1,
};

export function stubBannerImplementation(fn: ReturnType<typeof vi.fn>) {
  fn.mockImplementation((container: HTMLElement) => {
    const el = document.createElement("div");
    container.appendChild(el);
    return el;
  });
}

export async function importRunFanOut() {
  const { runFanOut } = await import("./fanOut");
  return runFanOut;
}

export function baseOptions(
  container: HTMLElement,
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

export async function stubSuccessfulWork(ao3WorkId: number) {
  const { scrapeWorkPage } = await import("./scrapeWorkPage");
  const { fetchAllWorkBookmarks } = await import("./scrapeWorkBookmarks");
  const { postWorkDetail } = await import("./workDetailIngestClient");
  vi.mocked(scrapeWorkPage).mockReturnValueOnce(scrapedWorkPage(ao3WorkId));
  vi.mocked(fetchAllWorkBookmarks).mockResolvedValueOnce(emptyBookmarksResult);
  vi.mocked(postWorkDetail).mockResolvedValueOnce({
    status: "success",
  } as WorkDetailIngestResult);
}
