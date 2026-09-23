// fanOut.ts is Phase 2's orchestrator (docs/plans/work-page-enrichment-data-model.md
// section 5): once Phase 1's scrape+POST has persisted today's snapshot, it
// walks the scraped works sequentially - "fetch work page -> fetch
// bookmarks -> build payload -> POST" per work - throttled, with a
// per-request timeout/abort, a circuit breaker on repeated AO3-fetch
// failures, safety caps, and a live progress banner + a final summary
// banner. Never parallel bursts: AO3 politeness is a first-class design
// concern here, not an afterthought.
//
// AO3 fetch/timeout mechanics are injected via FanOutDependencies
// (fetchWorkPageDocument/fetchBookmarksPageDocument resolve to null on a
// timed-out/failed fetch, mirroring an AbortController-based fetch
// wrapper's outcome) so the orchestration logic itself - throttle timing,
// circuit-breaker counting, cap enforcement, partial-success tallying - is
// independently testable without a real network. See ao3Fetch.ts for the
// real fetch()/AbortController-based implementations of those two
// functions, wired in by entrypoint.ts.

import { scrapeWorkPage } from "./scrapeWorkPage";
import { fetchAllWorkBookmarks } from "./scrapeWorkBookmarks";
import { buildWorkDetailPayload } from "./buildWorkDetailPayload";
import { postWorkDetail } from "./workDetailIngestClient";
import {
  renderProgressBanner,
  renderSummaryBanner,
  updateProgressBanner,
  type SummaryBannerData,
} from "./banners";
import { WORK_DETAIL_SCHEMA_VERSION } from "./constants";
import { startUnloadGuard, stopUnloadGuard } from "./unloadGuard";

export interface FanOutWork {
  ao3WorkId: number;
}

export interface FanOutOptions {
  apiOrigin: string;
  username: string;
  readToken: string;
  works: FanOutWork[];
  container: HTMLElement;
  throttleMs?: number;
  circuitBreakerThreshold?: number;
  maxWorksPerRun?: number;
  maxBookmarkPagesPerWork?: number;
}

export interface FanOutDependencies {
  fetchWorkPageDocument: (ao3WorkId: number) => Promise<Document | null>;
  fetchBookmarksPageDocument: (ao3WorkId: number, page: number) => Promise<Document | null>;
  sleep: (ms: number) => Promise<void>;
}

export type FanOutSummary = SummaryBannerData;

// Target ~a few hundred ms to ~1s between AO3 requests per the plan; tuned
// against real AO3 behaviour post-Implementation (see Retrospective, task
// 18) rather than treated as final here.
const DEFAULT_THROTTLE_MS = 750;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;
const DEFAULT_MAX_WORKS_PER_RUN = 200;
const DEFAULT_MAX_BOOKMARK_PAGES_PER_WORK = 50;

export async function runFanOut(
  options: FanOutOptions,
  deps: FanOutDependencies,
): Promise<FanOutSummary> {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const circuitBreakerThreshold =
    options.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
  const maxWorksPerRun = options.maxWorksPerRun ?? DEFAULT_MAX_WORKS_PER_RUN;
  const maxBookmarkPagesPerWork =
    options.maxBookmarkPagesPerWork ?? DEFAULT_MAX_BOOKMARK_PAGES_PER_WORK;

  const truncatedWorks = options.works.length > maxWorksPerRun;
  const works = options.works.slice(0, maxWorksPerRun);
  const total = works.length;

  let enriched = 0;
  let skipped = 0;
  let truncatedBookmarkPagesCount = 0;
  let consecutiveFetchFailures = 0;
  let circuitBroken = false;

  const progressBanner = renderProgressBanner(options.container, { current: 0, total });
  // ROADMAP.md (2026-08-02 v2 candidate): a run in progress can represent a
  // real amount of unsaved-elsewhere work (up to maxWorksPerRun works, each
  // with up to maxBookmarkPagesPerWork bookmark pages) - the beforeunload
  // guard is started/stopped at exactly these two points (progress banner
  // created/removed), inside a try/finally, so it can never disagree with
  // the banner about whether a run is active, and is never left dangling
  // (stuck warning on future navigation) if the loop below throws.
  startUnloadGuard();

  try {
    for (let index = 0; index < works.length; index++) {
      const { ao3WorkId } = works[index];

      const enrichedThisWork = await processWork(
        ao3WorkId,
        options,
        deps,
        maxBookmarkPagesPerWork,
        throttleMs,
        {
          onTruncatedBookmarkPages: () => truncatedBookmarkPagesCount++,
          onFetchFailure: () => consecutiveFetchFailures++,
          onFetchSuccess: () => (consecutiveFetchFailures = 0),
        },
      );

      if (enrichedThisWork) enriched++;
      else skipped++;

      updateProgressBanner(progressBanner, { current: index + 1, total });

      if (consecutiveFetchFailures >= circuitBreakerThreshold) {
        circuitBroken = true;
        break;
      }

      const isLastWork = index === works.length - 1;
      if (!isLastWork) await deps.sleep(throttleMs);
    }
  } finally {
    stopUnloadGuard();
    progressBanner.remove();
  }

  const summary: FanOutSummary = {
    enriched,
    skipped,
    total,
    truncatedWorks,
    truncatedBookmarkPagesCount,
    circuitBroken,
  };
  renderSummaryBanner(options.container, summary);

  return summary;
}

interface WorkOutcomeHooks {
  onTruncatedBookmarkPages: () => void;
  onFetchFailure: () => void;
  onFetchSuccess: () => void;
}

// Processes exactly one work's full "fetch -> parse -> POST" chain,
// returning whether it was successfully enriched. Any failure along the
// way (fetch, parse, or ingest) is tallied as a skip rather than thrown -
// partial success is the normal operating mode under fan-out (plan
// section 5).
async function processWork(
  ao3WorkId: number,
  options: FanOutOptions,
  deps: FanOutDependencies,
  maxBookmarkPagesPerWork: number,
  throttleMs: number,
  hooks: WorkOutcomeHooks,
): Promise<boolean> {
  const workPageDocument = await deps.fetchWorkPageDocument(ao3WorkId);
  if (!workPageDocument) {
    hooks.onFetchFailure();
    return false;
  }
  hooks.onFetchSuccess();

  const scraped = scrapeWorkPage(workPageDocument, `/works/${ao3WorkId}`);
  if (!scraped.ok) return false;

  const bookmarksResult = await fetchAllWorkBookmarks(
    (page) => fetchBookmarksPageOrEmpty(ao3WorkId, page, deps, throttleMs, hooks),
    { maxPages: maxBookmarkPagesPerWork },
  );
  if (bookmarksResult.truncated) hooks.onTruncatedBookmarkPages();

  const payload = buildWorkDetailPayload(scraped.data, bookmarksResult.bookmarks, {
    schemaVersion: WORK_DETAIL_SCHEMA_VERSION,
    username: options.username,
    readToken: options.readToken,
  });

  const ingestResult = await postWorkDetail(options.apiOrigin, payload);
  return ingestResult.status === "success";
}

// fetchAllWorkBookmarks expects a page fetcher returning a Document (never
// null) - a timed-out/failed bookmark-page fetch falls back to an empty
// Document, which parses as zero bookmarks/no next page, so it simply ends
// that work's pagination early rather than throwing.
//
// The throttle is applied here, before every bookmark-page fetch, rather
// than only between works: this is the single callback fetchAllWorkBookmarks
// invokes once per page (including the first), so it naturally covers both
// the gap between a work's work-page fetch and its first bookmark-page
// fetch, and the gap between successive bookmark-page fetches (plan
// section 5: throttle "applies to both work-page and bookmark-page
// fetches").
//
// Bookmark-page outcomes also feed the same onFetchFailure/onFetchSuccess
// hooks the work-page fetch uses, so the circuit breaker sees a struggling
// AO3 regardless of which kind of request is failing, not just work-page
// fetches.
async function fetchBookmarksPageOrEmpty(
  ao3WorkId: number,
  page: number,
  deps: FanOutDependencies,
  throttleMs: number,
  hooks: WorkOutcomeHooks,
): Promise<Document> {
  await deps.sleep(throttleMs);
  const doc = await deps.fetchBookmarksPageDocument(ao3WorkId, page);
  if (doc) hooks.onFetchSuccess();
  else hooks.onFetchFailure();
  return doc ?? new Document();
}
