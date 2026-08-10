import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapedData, ScrapeResult } from "./scrapeStats";
import type { IngestResult } from "./ingestClient";

// entrypoint.ts stores its re-injection guard state directly on `window`
// (see the top-level comment below for why) - this augmentation just gives
// the spec a typed handle onto that, matching the shape assumed throughout.
declare global {
  interface Window {
    __ao3StatsPlus?: { banner: HTMLElement | null };
  }
}

// entrypoint.ts is the bookmarklet's IIFE orchestrator (the literal Vite
// entry point built into bookmarklet.js): re-injection guard -> capture the
// frontend origin from document.currentScript -> scrape -> read any stored
// token -> build the payload -> POST -> route the outcome to the right
// banner, persisting the returned token on success. It has no exports; it
// runs its flow as a side effect of being imported/executed, exactly as a
// re-injected <script src> tag would re-run it on the real AO3 page. Each
// `it` below therefore dynamically (re-)imports the module rather than
// calling an exported function directly, so the guard behavior (state
// stored on `window`, since a classic <script> re-execution has no module
// cache to rely on) is exercised the same way it would be for real.
//
// scrapeStats, ingestClient, tokenStorage, tokenSuggestion,
// tokenUpdateClient, and banners are all mocked so this spec is a pure test
// of entrypoint's orchestration/wiring, not of their individual
// implementations (each already has, or will have, its own unit spec).
//
// Per docs/plans/memorable-token-and-recovery.md section 1/10 (task 13):
// on a first-ever capture (no stored token), entrypoint picks the token to
// send by generating a fresh word-pair via generateTokenSuggestion() -
// replacing the old "send null and let the server mint one" behavior. The
// success banner's onSaveToken callback (banners.ts's new editable-token
// Save action) is entrypoint's adapter from tokenUpdateClient's four-state
// TokenUpdateResult (success/invalid/schemaMismatch/networkError) down to
// banners.ts's simpler two-state SaveTokenResult ({ok:true,readToken} |
// {ok:false,message}) - see "onSaveToken wiring" below.
vi.mock("./scrapeStats", () => ({ scrapeStats: vi.fn() }));
vi.mock("./ingestClient", () => ({ postIngest: vi.fn() }));
vi.mock("./tokenStorage", () => ({
  getStoredReadToken: vi.fn(),
  setStoredReadToken: vi.fn(),
}));
vi.mock("./tokenSuggestion", () => ({ generateTokenSuggestion: vi.fn() }));
vi.mock("./tokenUpdateClient", () => ({ postTokenUpdate: vi.fn() }));
vi.mock("./banners", () => ({
  renderSuccessBanner: vi.fn(),
  renderInfoBanner: vi.fn(),
  renderFailureBanner: vi.fn(),
  renderRetryBanner: vi.fn(),
  renderUnauthorizedBanner: vi.fn(),
  removeBannerStack: vi.fn(),
}));

const FRONTEND_ORIGIN = "https://app.example.com";
const API_ORIGIN = "https://api.example.com";
const AO3_PATHNAME = "/users/someauthor/stats";

const scrapedData: ScrapedData = {
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

function stubCurrentScript(src: string) {
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: { src } as unknown as HTMLScriptElement,
  });
}

// Every mocked banner renderer creates+appends a real element (mirroring
// banners.ts's real behavior closely enough to assert on DOM
// presence/removal for the re-injection guard), rather than being an inert
// vi.fn() with no implementation.
function stubBannerImplementation(fn: ReturnType<typeof vi.fn>) {
  fn.mockImplementation((container: HTMLElement) => {
    const el = document.createElement("div");
    container.appendChild(el);
    return el;
  });
}

describe("bookmarklet entrypoint", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "__ao3StatsPlus");
    vi.stubEnv("VITE_API_ORIGIN", API_ORIGIN);
    stubCurrentScript(`${FRONTEND_ORIGIN}/bookmarklet.js?t=12345`);
    window.history.pushState({}, "", AO3_PATHNAME);

    const banners = await import("./banners");
    stubBannerImplementation(vi.mocked(banners.renderSuccessBanner));
    stubBannerImplementation(vi.mocked(banners.renderInfoBanner));
    stubBannerImplementation(vi.mocked(banners.renderFailureBanner));
    stubBannerImplementation(vi.mocked(banners.renderRetryBanner));
    stubBannerImplementation(vi.mocked(banners.renderUnauthorizedBanner));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(document, "currentScript");
  });

  describe("happy path", () => {
    it("scrapes, generates a fresh word-pair token on a first-ever capture, builds a schemaVersion 1 payload with it, and shows the success banner", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken, setStoredReadToken } = await import("./tokenStorage");
      const { generateTokenSuggestion } = await import("./tokenSuggestion");
      const { renderSuccessBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue(undefined);
      vi.mocked(generateTokenSuggestion).mockReturnValue("cat-dog");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "cat-dog",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

      expect(scrapeStats).toHaveBeenCalledWith(document, AO3_PATHNAME);
      expect(getStoredReadToken).toHaveBeenCalledWith("someauthor");
      expect(generateTokenSuggestion).toHaveBeenCalled();
      expect(postIngest).toHaveBeenCalledWith(
        API_ORIGIN,
        expect.objectContaining({ schemaVersion: 1, username: "someauthor", readToken: "cat-dog" }),
      );
      expect(setStoredReadToken).toHaveBeenCalledWith("someauthor", "cat-dog");
      // Per banners.ts's new interface (memorable-token-and-recovery plan
      // section 4/10 task 14), renderSuccessBanner takes frontendOrigin +
      // username + an onSaveToken callback rather than a pre-built
      // dashboardUrl, so it can recompute the link after a Save - see
      // "onSaveToken wiring" below for that callback's own behavior.
      expect(renderSuccessBanner).toHaveBeenCalledWith(document.body, {
        readToken: "cat-dog",
        frontendOrigin: FRONTEND_ORIGIN,
        username: "someauthor",
        onSaveToken: expect.any(Function),
      });
    });

    it("encodes the username when building the dashboard URL and the token-storage key", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken, setStoredReadToken } = await import("./tokenStorage");
      const { generateTokenSuggestion } = await import("./tokenSuggestion");
      const { renderSuccessBanner } = await import("./banners");
      const weirdUsername = "weird/name&value";
      vi.mocked(scrapeStats).mockReturnValue({
        ok: true,
        data: { ...scrapedData, username: weirdUsername },
      } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue(undefined);
      vi.mocked(generateTokenSuggestion).mockReturnValue("cat-dog");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_new",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

      // getStoredReadToken/setStoredReadToken take the raw username - encoding
      // for storage is tokenStorage's own concern (see tokenStorage.test.ts) -
      // but the dashboard URL is built here, so it must not let a URL-special
      // character (e.g. "&", "/") corrupt the path segment or query string.
      expect(getStoredReadToken).toHaveBeenCalledWith(weirdUsername);
      expect(setStoredReadToken).toHaveBeenCalledWith(weirdUsername, "tok_new");
      // Username encoding for the dashboard link is banners.ts's own concern
      // now (it builds the URL from frontendOrigin + username + token) - see
      // banners.test.ts's "links to the dashboard URL..." case for that
      // coverage. entrypoint's job is just to pass the raw username through.
      expect(renderSuccessBanner).toHaveBeenCalledWith(document.body, {
        readToken: "tok_new",
        frontendOrigin: FRONTEND_ORIGIN,
        username: weirdUsername,
        onSaveToken: expect.any(Function),
      });
    });

    it("generates a fresh word-pair via generateTokenSuggestion() when no token is stored", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken } = await import("./tokenStorage");
      const { generateTokenSuggestion } = await import("./tokenSuggestion");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue(undefined);
      vi.mocked(generateTokenSuggestion).mockReturnValue("fox-owl");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "fox-owl",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(postIngest).toHaveBeenCalled());

      expect(generateTokenSuggestion).toHaveBeenCalledOnce();
      expect(postIngest).toHaveBeenCalledWith(
        API_ORIGIN,
        expect.objectContaining({ readToken: "fox-owl" }),
      );
    });

    it("replays a previously stored token in the payload on a repeat capture, without generating a new one", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken } = await import("./tokenStorage");
      const { generateTokenSuggestion } = await import("./tokenSuggestion");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue("tok_prev");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_prev",
        capturedOn: "2026-07-23",
        deduped: true,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(postIngest).toHaveBeenCalled());

      expect(postIngest).toHaveBeenCalledWith(
        API_ORIGIN,
        expect.objectContaining({ readToken: "tok_prev" }),
      );
      expect(generateTokenSuggestion).not.toHaveBeenCalled();
    });

    it("still treats a same-day dedup response (200, deduped: true) as success", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken } = await import("./tokenStorage");
      const {
        renderSuccessBanner,
        renderFailureBanner,
        renderRetryBanner,
        renderUnauthorizedBanner,
      } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue("tok_prev");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_prev",
        capturedOn: "2026-07-23",
        deduped: true,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

      expect(renderFailureBanner).not.toHaveBeenCalled();
      expect(renderRetryBanner).not.toHaveBeenCalled();
      expect(renderUnauthorizedBanner).not.toHaveBeenCalled();
    });
  });

  // The onSaveToken callback passed to renderSuccessBanner (see "happy
  // path" above) is entrypoint's own adapter from tokenUpdateClient's
  // TokenUpdateResult (success/invalid/schemaMismatch/networkError) down to
  // banners.ts's simpler SaveTokenResult ({ok:true,readToken} |
  // {ok:false,message}) - banners.ts deliberately knows nothing about
  // apiOrigin/fetch/tokenUpdateClient, per its own "mirrors the existing
  // onRetry callback pattern" design (memorable-token-and-recovery plan
  // section 4). These tests capture the real callback entrypoint builds and
  // invoke it directly, rather than re-asserting banners.ts's own Save-button
  // behavior (already covered by banners.test.ts).
  describe("onSaveToken wiring (the success banner's Save action)", () => {
    async function captureOnSaveToken() {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { getStoredReadToken } = await import("./tokenStorage");
      const { generateTokenSuggestion } = await import("./tokenSuggestion");
      const { renderSuccessBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(getStoredReadToken).mockReturnValue(undefined);
      vi.mocked(generateTokenSuggestion).mockReturnValue("cat-dog");
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "cat-dog",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalled());

      const onSaveToken = vi.mocked(renderSuccessBanner).mock.calls[0][1].onSaveToken;
      return onSaveToken;
    }

    it("POSTs the new token via postTokenUpdate and adapts a success result", async () => {
      const { postTokenUpdate } = await import("./tokenUpdateClient");
      vi.mocked(postTokenUpdate).mockResolvedValue({ status: "success", readToken: "fox-owl" });
      const onSaveToken = await captureOnSaveToken();

      const result = await onSaveToken("fox-owl");

      expect(postTokenUpdate).toHaveBeenCalledWith(
        API_ORIGIN,
        expect.objectContaining({ schemaVersion: 1, username: "someauthor", readToken: "fox-owl" }),
      );
      expect(result).toEqual({ ok: true, readToken: "fox-owl" });
    });

    // Without this, a later repeat capture would replay the stale
    // pre-edit token from AO3-origin localStorage instead of the one the
    // user just saved server-side, silently undoing the edit on next use.
    it("updates AO3-origin localStorage with the new token on a successful save", async () => {
      const { postTokenUpdate } = await import("./tokenUpdateClient");
      const { setStoredReadToken } = await import("./tokenStorage");
      vi.mocked(postTokenUpdate).mockResolvedValue({ status: "success", readToken: "fox-owl" });
      const onSaveToken = await captureOnSaveToken();
      vi.mocked(setStoredReadToken).mockClear();

      await onSaveToken("fox-owl");

      expect(setStoredReadToken).toHaveBeenCalledWith("someauthor", "fox-owl");
    });

    it("does not update AO3-origin localStorage when the save fails", async () => {
      const { postTokenUpdate } = await import("./tokenUpdateClient");
      const { setStoredReadToken } = await import("./tokenStorage");
      vi.mocked(postTokenUpdate).mockResolvedValue({ status: "networkError" });
      const onSaveToken = await captureOnSaveToken();
      vi.mocked(setStoredReadToken).mockClear();

      await onSaveToken("fox-owl");

      expect(setStoredReadToken).not.toHaveBeenCalled();
    });

    it("adapts an invalid (422) result to a failure with the server's message", async () => {
      const { postTokenUpdate } = await import("./tokenUpdateClient");
      vi.mocked(postTokenUpdate).mockResolvedValue({
        status: "invalid",
        message: "username is required",
      });
      const onSaveToken = await captureOnSaveToken();

      const result = await onSaveToken("fox-owl");

      expect(result).toEqual({ ok: false, message: "username is required" });
    });

    it("adapts a schemaMismatch (426) result to a failure with a friendly message", async () => {
      const { postTokenUpdate } = await import("./tokenUpdateClient");
      vi.mocked(postTokenUpdate).mockResolvedValue({ status: "schemaMismatch" });
      const onSaveToken = await captureOnSaveToken();

      const result = await onSaveToken("fox-owl");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/out of date|reinstall/i);
    });

    it("adapts a networkError result to a failure with a friendly message", async () => {
      const { postTokenUpdate } = await import("./tokenUpdateClient");
      vi.mocked(postTokenUpdate).mockResolvedValue({ status: "networkError" });
      const onSaveToken = await captureOnSaveToken();

      const result = await onSaveToken("fox-owl");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/network|connection|reach/i);
    });
  });

  describe("scrape failures", () => {
    it.each([
      ["no-works", /work/i],
      ["not-all-years", /all years/i],
      ["scrape-failed", /layout|read your stats/i],
    ] as const)(
      "renders an info banner for scrape failure reason %s and does not POST",
      async (reason, messagePattern) => {
        const { scrapeStats } = await import("./scrapeStats");
        const { postIngest } = await import("./ingestClient");
        const { renderInfoBanner } = await import("./banners");
        vi.mocked(scrapeStats).mockReturnValue({ ok: false, reason } as ScrapeResult);

        await import("./entrypoint");
        await vi.waitFor(() => expect(renderInfoBanner).toHaveBeenCalled());

        expect(renderInfoBanner).toHaveBeenCalledWith(
          document.body,
          expect.objectContaining({ message: expect.stringMatching(messagePattern) }),
        );
        expect(postIngest).not.toHaveBeenCalled();
      },
    );
  });

  describe("HTTP error responses", () => {
    // tokenMismatch is gone entirely (plan section 6/10 task 13): /ingest is
    // always-accept and can never return that result any more, so
    // routeResult no longer has a case for it, and renderUnauthorizedBanner
    // is no longer reachable from the ingest flow at all - the old
    // "renders the unauthorized banner on a tokenMismatch (403) result"
    // test that used to live here is deliberately removed, not replaced.
    it("renders a failure banner explaining the bookmarklet is out of date on a schemaMismatch (426) result", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderFailureBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({ status: "schemaMismatch" } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderFailureBanner).toHaveBeenCalled());

      expect(renderFailureBanner).toHaveBeenCalledWith(
        document.body,
        expect.objectContaining({
          message: expect.stringMatching(/out of date|reinstall/i),
          schemaVersion: 1,
        }),
      );
    });

    it("renders a failure banner with the server's message on an invalid (422) result", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderFailureBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({
        status: "invalid",
        message: "username is required",
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderFailureBanner).toHaveBeenCalled());

      expect(renderFailureBanner).toHaveBeenCalledWith(
        document.body,
        expect.objectContaining({ message: "username is required", schemaVersion: 1 }),
      );
    });
  });

  describe("network/5xx failure", () => {
    it("renders a retry banner whose onRetry re-POSTs the same payload without re-scraping", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderRetryBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({ status: "networkError" } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderRetryBanner).toHaveBeenCalled());

      expect(scrapeStats).toHaveBeenCalledTimes(1);
      expect(postIngest).toHaveBeenCalledTimes(1);

      const { onRetry } = vi.mocked(renderRetryBanner).mock.calls[0][1] as unknown as {
        onRetry: () => void;
      };
      onRetry();
      await vi.waitFor(() => expect(postIngest).toHaveBeenCalledTimes(2));

      expect(scrapeStats).toHaveBeenCalledTimes(1);
    });
  });

  describe("re-injection guard", () => {
    it("removes the existing banner and does not re-scrape/re-POST on a second injection", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { renderSuccessBanner } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_new",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(renderSuccessBanner).toHaveBeenCalledTimes(1));
      const firstBanner = vi.mocked(renderSuccessBanner).mock.results[0]?.value as HTMLElement;
      expect(firstBanner.isConnected).toBe(true);
      expect(window.__ao3StatsPlus).toBeTruthy();

      vi.resetModules();
      await import("./entrypoint");
      await vi.waitFor(() => expect(firstBanner.isConnected).toBe(false));

      expect(scrapeStats).toHaveBeenCalledTimes(1);
      expect(postIngest).toHaveBeenCalledTimes(1);
      expect(renderSuccessBanner).toHaveBeenCalledTimes(1);
    });

    // TECH_DEBT.md, 2026-07-23 "Re-injection cleanup gap": the tracked-
    // banner reference alone never covered fan-out's untracked progress/
    // summary banners (or the now-empty stack wrapper itself), so
    // re-injection must also remove the whole shared banner-stack wrapper -
    // this pins that the real cleanup helper (banners.ts's
    // removeBannerStack, not just the single-banner .remove()) is called
    // against document.body on every re-injection.
    it("also removes the whole shared banner-stack wrapper on re-injection, not just the single tracked banner", async () => {
      const { scrapeStats } = await import("./scrapeStats");
      const { postIngest } = await import("./ingestClient");
      const { removeBannerStack } = await import("./banners");
      vi.mocked(scrapeStats).mockReturnValue({ ok: true, data: scrapedData } as ScrapeResult);
      vi.mocked(postIngest).mockResolvedValue({
        status: "success",
        readToken: "tok_new",
        capturedOn: "2026-07-23",
        deduped: false,
      } as IngestResult);

      await import("./entrypoint");
      await vi.waitFor(() => expect(window.__ao3StatsPlus).toBeTruthy());
      expect(removeBannerStack).not.toHaveBeenCalled();

      vi.resetModules();
      await import("./entrypoint");

      expect(removeBannerStack).toHaveBeenCalledExactlyOnceWith(document.body);
    });
  });
});
