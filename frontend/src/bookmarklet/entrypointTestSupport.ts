import { vi } from "vitest";
import type { ScrapedData } from "./scrapeStats";

// Shared fixtures/helpers for entrypoint.ts's test suite, split by scenario
// group into sibling entrypoint*.test.ts files (CODE_STANDARDS.md's 400-line
// .ts budget - the single entrypoint.test.ts this replaces had grown to 553
// lines). Mirrors fanOutTestSupport.ts's existing split-by-scenario-group
// convention for this same reason. Every split file still declares its own
// vi.mock() calls (required at module scope, so they can't live here) and
// its own `declare global { interface Window { __ao3StatsPlus?: ... } }`
// augmentation (typing entrypoint.ts's window-level re-injection/fan-out
// guard state - see entrypoint.ts's own header comment for why that's
// window state rather than module state).

export const FRONTEND_ORIGIN = "https://app.example.com";
export const API_ORIGIN = "https://api.example.com";
export const AO3_PATHNAME = "/users/someauthor/stats";

export const scrapedData: ScrapedData = {
  username: "someauthor",
  earliestPostYear: null,
  aggregate: {
    hits: 1234,
    kudos: 100,
    comments: 20,
    bookmarks: 15,
    subscriptions: 10,
    userSubscriptions: 5,
    wordCount: 75_000,
    worksCount: 1,
  },
  works: [
    {
      ao3WorkId: 111,
      title: "Work A",
      fandoms: ["Fandom One"],
      hits: 400,
      kudos: 40,
      comments: 8,
      bookmarks: 6,
      subscriptions: 4,
      wordCount: 30_000,
    },
  ],
};

export function stubCurrentScript(src: string) {
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: { src } as unknown as HTMLScriptElement,
  });
}

// Every mocked banner renderer creates+appends a real element (mirroring
// banners.ts's real behavior closely enough to assert on DOM
// presence/removal for the re-injection guard), rather than being an inert
// vi.fn() with no implementation.
export function stubBannerImplementation(fn: ReturnType<typeof vi.fn>) {
  fn.mockImplementation((container: HTMLElement) => {
    const el = document.createElement("div");
    container.appendChild(el);
    return el;
  });
}
