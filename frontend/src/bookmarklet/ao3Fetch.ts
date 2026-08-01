// ao3Fetch.ts is the real (non-injected) implementation of fanOut.ts's
// FanOutDependencies: same-origin fetch()es to /works/:id and
// /works/:id/bookmarks?page=N, each bounded by an AbortController-based
// timeout, parsed via DOMParser. fanOut.test.ts exercises the orchestration
// logic entirely through injected mocks (per the plan's own framing of that
// task), so this file has no dedicated spec - it's built directly against
// plan section 5's stated behavior (timeout via AbortController, same-origin
// fetch, DOMParser).
//
// A timed-out/aborted/non-2xx fetch resolves to null rather than throwing or
// rejecting - fanOut.ts treats null as "this work/page couldn't be fetched
// this run" and tallies it as skipped, never fabricating data for it.

import type { FanOutDependencies } from "./fanOut";

const FETCH_TIMEOUT_MS = 10_000;

async function fetchDocument(path: string): Promise<Document | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) return null;

    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    // Covers both a network failure and the AbortController firing on
    // timeout - both a genuinely unreachable page and a slow/hung one are
    // treated identically by the caller (skip and continue).
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createAo3FanOutDependencies(): FanOutDependencies {
  return {
    fetchWorkPageDocument: (ao3WorkId) => fetchDocument(`/works/${ao3WorkId}`),
    fetchBookmarksPageDocument: (ao3WorkId, page) =>
      fetchDocument(`/works/${ao3WorkId}/bookmarks?page=${page}`),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
