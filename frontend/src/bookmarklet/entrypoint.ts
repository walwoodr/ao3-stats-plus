// entrypoint.ts is the bookmarklet's IIFE orchestrator - the literal Vite
// entry point built into bookmarklet.js (see vite.bookmarklet.config.ts).
// It has no exports: it runs guard -> scrape -> build payload -> POST ->
// banner routing as a side effect of being loaded, exactly as a real
// AO3-page `<script src>` injection would. Re-running it (double-click on
// the bookmarklet, or any other re-injection) is guarded via
// `window.__ao3StatsPlus` rather than module-level state, since a classic
// re-injected `<script>` has no module cache to rely on - only `window`
// persists across injections on the same page.

import { scrapeStats, type ScrapeFailureReason } from "./scrapeStats";
import { buildIngestPayload, type IngestPayload } from "./buildIngestPayload";
import { postIngest, type IngestResult } from "./ingestClient";
import { getStoredReadToken, setStoredReadToken } from "./tokenStorage";
import { generateTokenSuggestion } from "./tokenSuggestion";
import { postTokenUpdate } from "./tokenUpdateClient";
import {
  renderFailureBanner,
  renderInfoBanner,
  renderRetryBanner,
  renderSuccessBanner,
  type SaveTokenResult,
} from "./banners";
import { SCHEMA_VERSION } from "./constants";
import { runFanOut } from "./fanOut";
import { createAo3FanOutDependencies } from "./ao3Fetch";

declare global {
  interface Window {
    __ao3StatsPlus?: { banner: HTMLElement | null };
  }
}

const SCRAPE_FAILURE_MESSAGES: Record<ScrapeFailureReason, string> = {
  "no-works": "You don't have any works yet, so there's nothing to capture.",
  "not-all-years": 'Please switch to the "All Years" view before capturing your stats.',
  "scrape-failed": "Couldn't read your stats page - AO3's layout may have changed.",
};

// The frontend origin (where bookmarklet.js, and the dashboard, are
// hosted) can only be recovered from the script tag that loaded this file
// - it isn't the same as `location.origin`, which is the AO3 page this
// script is running on. Falls back to any other bookmarklet.js script tag
// on the page if `document.currentScript` is unavailable (older/unusual
// injection paths), and finally to "" rather than throwing.
function getFrontendOrigin(): string {
  const candidates = [
    document.currentScript,
    document.querySelector("script[src*='bookmarklet.js']"),
  ];

  for (const script of candidates) {
    const src = script && "src" in script ? (script as { src?: string }).src : undefined;
    if (!src) continue;
    try {
      return new URL(src).origin;
    } catch {
      continue;
    }
  }

  return "";
}

function setGuardBanner(banner: HTMLElement): void {
  if (window.__ao3StatsPlus) window.__ao3StatsPlus.banner = banner;
}

// Adapts tokenUpdateClient's four-state TokenUpdateResult down to
// banners.ts's simpler two-state SaveTokenResult, so banners.ts never has
// to know about apiOrigin/fetch/tokenUpdateClient directly (mirrors the
// existing onRetry callback pattern used by renderRetryBanner). This is the
// "Save token" button's actual POST /ingest/token call.
function buildOnSaveToken(
  apiOrigin: string,
  username: string,
): (newToken: string) => Promise<SaveTokenResult> {
  return async (newToken: string) => {
    const result = await postTokenUpdate(apiOrigin, {
      schemaVersion: SCHEMA_VERSION,
      username,
      readToken: newToken,
    });

    switch (result.status) {
      case "success":
        setStoredReadToken(username, result.readToken);
        return { ok: true, readToken: result.readToken };
      case "invalid":
        return { ok: false, message: result.message };
      case "schemaMismatch":
        return { ok: false, message: "This bookmarklet is out of date - please reinstall it." };
      case "networkError":
        return {
          ok: false,
          message: "Couldn't reach the server - check your connection and try again.",
        };
    }
  };
}

function routeResult(
  result: IngestResult,
  frontendOrigin: string,
  apiOrigin: string,
  username: string,
  retry: () => void,
): void {
  switch (result.status) {
    case "success":
      setStoredReadToken(username, result.readToken);
      setGuardBanner(
        renderSuccessBanner(document.body, {
          readToken: result.readToken,
          frontendOrigin,
          username,
          onSaveToken: buildOnSaveToken(apiOrigin, username),
        }),
      );
      return;
    case "schemaMismatch":
      setGuardBanner(
        renderFailureBanner(document.body, {
          message: "This bookmarklet is out of date - please reinstall it.",
          schemaVersion: SCHEMA_VERSION,
        }),
      );
      return;
    case "invalid":
      setGuardBanner(
        renderFailureBanner(document.body, {
          message: result.message,
          schemaVersion: SCHEMA_VERSION,
        }),
      );
      return;
    case "networkError":
      setGuardBanner(
        renderRetryBanner(document.body, {
          message: "Couldn't reach the server - check your connection and try again.",
          onRetry: retry,
        }),
      );
      return;
  }
}

// Phase 2 (fan-out enrichment) only ever starts once Phase 1's POST has
// resolved successfully (plan section 2, step 2) - a dedup response
// (deduped: true) still counts as success, since today's snapshot exists
// either way and is what Phase 2 attaches its enrichment to. Deliberately
// fire-and-forget with a caught/logged failure rather than awaited: Phase 1
// has already succeeded and shown its own banner by this point, so a bug in
// Phase 2's long-running background enrichment must never surface as an
// unhandled rejection or otherwise disturb that already-complete outcome.
function startFanOut(
  apiOrigin: string,
  username: string,
  readToken: string,
  works: IngestPayload["works"],
): void {
  Promise.resolve(
    runFanOut(
      {
        apiOrigin,
        username,
        readToken,
        works: works.map((work) => ({ ao3WorkId: work.ao3WorkId })),
        container: document.body,
      },
      createAo3FanOutDependencies(),
    ),
  ).catch((error: unknown) => {
    console.error("[ao3-stats-plus] work-page enrichment fan-out failed", error);
  });
}

// Re-POSTs the same already-built payload without re-scraping, so a
// networkError's Retry button (and any retry after that) doesn't make the
// user re-trigger a scrape just to resubmit.
async function submit(
  apiOrigin: string,
  frontendOrigin: string,
  username: string,
  payload: IngestPayload,
): Promise<void> {
  const result = await postIngest(apiOrigin, payload);
  routeResult(result, frontendOrigin, apiOrigin, username, () => {
    void submit(apiOrigin, frontendOrigin, username, payload);
  });

  if (result.status === "success") {
    startFanOut(apiOrigin, username, result.readToken, payload.works);
  }
}

async function main(): Promise<void> {
  const frontendOrigin = getFrontendOrigin();
  const apiOrigin = import.meta.env.VITE_API_ORIGIN as string;

  const scraped = scrapeStats(document, window.location.pathname);
  if (!scraped.ok) {
    setGuardBanner(
      renderInfoBanner(document.body, { message: SCRAPE_FAILURE_MESSAGES[scraped.reason] }),
    );
    return;
  }

  const { username } = scraped.data;
  // Stored-or-generate (plan section 1): a repeat capture replays whatever
  // token is already on file; a first-ever capture has nothing to replay,
  // so it mints a fresh word-pair suggestion client-side instead of sending
  // null and letting the server mint one (the server no longer does that -
  // see SnapshotIngestService section 3a).
  const readToken = getStoredReadToken(username) ?? generateTokenSuggestion();
  const payload = buildIngestPayload(scraped.data, { schemaVersion: SCHEMA_VERSION, readToken });

  await submit(apiOrigin, frontendOrigin, username, payload);
}

const existing = window.__ao3StatsPlus;
if (existing) {
  // Re-injection: drop the previous banner (avoids duplicate live-region
  // announcements) and stop - do not re-scrape or re-POST.
  existing.banner?.remove();
} else {
  window.__ao3StatsPlus = { banner: null };
  void main();
}
