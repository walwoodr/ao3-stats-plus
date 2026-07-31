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
import {
  renderFailureBanner,
  renderInfoBanner,
  renderRetryBanner,
  renderSuccessBanner,
  renderUnauthorizedBanner,
} from "./banners";
import { SCHEMA_VERSION } from "./constants";

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

function routeResult(
  result: IngestResult,
  frontendOrigin: string,
  username: string,
  retry: () => void,
): void {
  switch (result.status) {
    case "success":
      setStoredReadToken(username, result.readToken);
      setGuardBanner(
        renderSuccessBanner(document.body, {
          readToken: result.readToken,
          dashboardUrl: `${frontendOrigin}/u/${encodeURIComponent(username)}?token=${result.readToken}`,
        }),
      );
      return;
    case "tokenMismatch":
      setGuardBanner(
        renderUnauthorizedBanner(document.body, {
          message: "This bookmarklet's token is out of date - please reinstall it and try again.",
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
  routeResult(result, frontendOrigin, username, () => {
    void submit(apiOrigin, frontendOrigin, username, payload);
  });
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
  const readToken = getStoredReadToken(username);
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
