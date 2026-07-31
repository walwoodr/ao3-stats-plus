import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderFailureBanner,
  renderInfoBanner,
  renderProgressBanner,
  renderRetryBanner,
  renderSuccessBanner,
  renderSummaryBanner,
  renderUnauthorizedBanner,
  updateProgressBanner,
} from "./banners";

// The bookmarklet's confirmation/failure banners are injected into the AO3
// page itself, since that's where the user is at success/failure time. Per
// the plan: the success banner shows the readToken as visible, copyable
// text plus a link to the dashboard; failure banners are accessible
// (role="alert" so screen readers announce them) and keyboard-operable.
describe("bookmarklet banners", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe("renderSuccessBanner", () => {
    it("displays the read token as visible, copyable text", () => {
      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });

      expect(container.textContent).toContain("tok_visible_123");
    });

    it("links to the dashboard URL for this username", () => {
      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });

      const link = container.querySelector("a");
      expect(link?.getAttribute("href")).toBe("https://app.example.com/u/someauthor");
    });

    it("provides a keyboard-operable Copy button", () => {
      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });

      const copyButton = container.querySelector("button");
      expect(copyButton?.tagName).toBe("BUTTON");
      expect(copyButton?.getAttribute("tabindex")).not.toBe("-1");
    });

    it("copies the token to the clipboard when the Copy button is activated", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });
      container.querySelector("button")?.click();

      expect(writeText).toHaveBeenCalledWith("tok_visible_123");
    });

    it("uses an accessible status role so screen readers announce success", () => {
      const banner = renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });

      expect(banner.getAttribute("role")).toBe("status");
    });

    it("moves focus to the banner so keyboard/screen-reader users notice it", () => {
      const banner = renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });

      expect(document.activeElement).toBe(banner);
    });
  });

  describe("renderFailureBanner (scrape failure)", () => {
    it("explains the layout may have changed and includes the schemaVersion", () => {
      const banner = renderFailureBanner(container, {
        message: "Couldn't read your stats page - AO3's layout may have changed",
        schemaVersion: 1,
      });

      expect(banner.textContent).toContain("Couldn't read your stats page");
      expect(banner.textContent).toContain("1");
    });

    it("uses an alert role so screen readers announce it immediately", () => {
      const banner = renderFailureBanner(container, {
        message: "Couldn't read your stats page - AO3's layout may have changed",
        schemaVersion: 1,
      });

      expect(banner.getAttribute("role")).toBe("alert");
    });
  });

  // renderInfoBanner fills the banner-naming gap the plan calls out: scrape
  // failures (no-works / not-all-years / scrape-failed) are informational,
  // pre-POST outcomes with no schemaVersion in play, so reusing
  // renderFailureBanner (which always appends a "(schemaVersion N)" suffix)
  // would be a misleading, semantically-wrong fit for them.
  describe("renderInfoBanner (scrape-failure/informational messages)", () => {
    it("renders the given message", () => {
      const banner = renderInfoBanner(container, {
        message: "You don't have any works yet, so there's nothing to capture.",
      });

      expect(banner.textContent).toContain("You don't have any works yet");
    });

    it("does not append a schemaVersion suffix", () => {
      const banner = renderInfoBanner(container, {
        message: "Please switch to the 'All Years' view before capturing your stats.",
      });

      expect(banner.textContent).not.toMatch(/schemaVersion/i);
    });

    it("uses an accessible role so screen readers announce it", () => {
      const banner = renderInfoBanner(container, {
        message: "Couldn't read your stats page - AO3's layout may have changed.",
      });

      expect(["status", "alert"]).toContain(banner.getAttribute("role"));
    });
  });

  describe("renderRetryBanner (network/POST failure)", () => {
    it("renders a keyboard-operable Retry button", () => {
      const onRetry = vi.fn();
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry });

      const retryButton = container.querySelector("button");
      retryButton?.focus();
      expect(document.activeElement).toBe(retryButton);
    });

    it("calls onRetry when the Retry button is clicked", () => {
      const onRetry = vi.fn();
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry });

      container.querySelector("button")?.click();

      expect(onRetry).toHaveBeenCalledOnce();
    });

    it("calls onRetry when the Retry button is activated via the keyboard", () => {
      const onRetry = vi.fn();
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry });

      const retryButton = container.querySelector("button") as HTMLButtonElement;
      retryButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

      expect(onRetry).toHaveBeenCalledOnce();
    });
  });

  describe("renderUnauthorizedBanner (403/CORS rejection)", () => {
    it("explains the bookmarklet is unauthorized or out of date", () => {
      const banner = renderUnauthorizedBanner(container, {
        message: "This bookmarklet is out of date or not authorized - please reinstall it.",
      });

      expect(banner.textContent).toMatch(/out of date|not authorized/i);
      expect(banner.getAttribute("role")).toBe("alert");
    });
  });

  // renderProgressBanner is the Phase 2 fan-out's live-progress indicator
  // (plan section 8): a polite live region that updates *in place* as each
  // work is processed, rather than spamming a new alert node per work - a
  // screen-reader user should hear periodic progress, not a flood.
  describe("renderProgressBanner (Phase 2 fan-out live progress)", () => {
    it("renders the initial progress message", () => {
      const banner = renderProgressBanner(container, { current: 0, total: 12 });

      expect(banner.textContent).toMatch(/12/);
    });

    it("uses a polite live region, not an assertive alert, so progress doesn't interrupt the user", () => {
      const banner = renderProgressBanner(container, { current: 0, total: 12 });

      expect(banner.getAttribute("role")).toBe("status");
      expect(banner.getAttribute("aria-live")).toBe("polite");
    });

    it("does not move focus (unlike the success banner) - progress shouldn't steal keyboard focus repeatedly", () => {
      const banner = renderProgressBanner(container, { current: 0, total: 12 });

      expect(document.activeElement).not.toBe(banner);
    });
  });

  describe("updateProgressBanner (updates in place, no new DOM node per work)", () => {
    it("updates the existing banner's text to reflect the new current/total", () => {
      const banner = renderProgressBanner(container, { current: 1, total: 5 });

      updateProgressBanner(banner, { current: 3, total: 5 });

      expect(banner.textContent).toMatch(/3/);
      expect(banner.textContent).toMatch(/5/);
    });

    it("does not append any additional banner nodes to the container", () => {
      const banner = renderProgressBanner(container, { current: 1, total: 5 });

      updateProgressBanner(banner, { current: 2, total: 5 });
      updateProgressBanner(banner, { current: 3, total: 5 });

      expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(banner.isConnected).toBe(true);
    });

    it("keeps the same aria-live polite status role after updating", () => {
      const banner = renderProgressBanner(container, { current: 1, total: 5 });

      updateProgressBanner(banner, { current: 2, total: 5 });

      expect(banner.getAttribute("role")).toBe("status");
      expect(banner.getAttribute("aria-live")).toBe("polite");
    });
  });

  // renderSummaryBanner is the final report once the fan-out finishes (or
  // is capped/circuit-broken) - plan section 7: "enriched X of M, Y
  // skipped" plus any truncation, so partial success (the normal operating
  // mode under fan-out) is always visible, never silently swallowed.
  describe("renderSummaryBanner (Phase 2 fan-out final report)", () => {
    it("reports the enriched, skipped, and total counts", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 8, skipped: 2, total: 10, truncatedWorks: false,
        truncatedBookmarkPagesCount: 0, circuitBroken: false,
      });

      expect(banner.textContent).toMatch(/8/);
      expect(banner.textContent).toMatch(/2/);
    });

    it("surfaces truncation rather than silently dropping it", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 3, skipped: 0, total: 3, truncatedWorks: true,
        truncatedBookmarkPagesCount: 1, circuitBroken: false,
      });

      expect(banner.textContent).toMatch(/truncat/i);
    });

    it("surfaces a circuit-broken run distinctly from an ordinary partial-success summary", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 1, skipped: 4, total: 5, truncatedWorks: false,
        truncatedBookmarkPagesCount: 0, circuitBroken: true,
      });

      expect(banner.textContent).toMatch(/stopped|circuit|paused/i);
    });

    it("uses an accessible status role so screen readers announce the final result", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 5, skipped: 0, total: 5, truncatedWorks: false,
        truncatedBookmarkPagesCount: 0, circuitBroken: false,
      });

      expect(banner.getAttribute("role")).toBe("status");
    });
  });

  // Regression coverage for the "unreadable and very ugly" report: a shared
  // base gave every banner readable typography plus a flex-column layout
  // (so multi-element banners get consistent gap-based spacing instead of
  // elements crammed against each other), across all five variants.
  describe("shared banner readability/layout styling", () => {
    it("gives every banner variant a readable font size/line-height and consistent flex-column spacing", () => {
      const banners = [
        renderSuccessBanner(container, {
          readToken: "tok_visible_123",
          dashboardUrl: "https://app.example.com/u/someauthor",
        }),
        renderFailureBanner(container, { message: "failure", schemaVersion: 1 }),
        renderInfoBanner(container, { message: "info" }),
        renderRetryBanner(container, { message: "retry", onRetry: vi.fn() }),
        renderUnauthorizedBanner(container, { message: "unauthorized" }),
      ];

      for (const banner of banners) {
        expect(banner.style.display).toBe("flex");
        expect(banner.style.flexDirection).toBe("column");
        expect(banner.style.gap).not.toBe("");
        expect(banner.style.lineHeight).not.toBe("");
        expect(banner.style.fontSize).not.toBe("");
      }
    });
  });

  describe("renderSuccessBanner visual treatment", () => {
    it("gives the token a monospace, break-all treatment so a long token can't overflow the fixed-width banner", () => {
      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });

      const token = container.querySelector("code");
      expect(token?.style.wordBreak).toBe("break-all");
      expect(token?.style.fontFamily).toMatch(/mono/i);
    });

    it("styles the Copy button and dashboard link as clearly clickable, not bare browser defaults", () => {
      renderSuccessBanner(container, {
        readToken: "tok_visible_123",
        dashboardUrl: "https://app.example.com/u/someauthor",
      });

      const button = container.querySelector("button");
      const link = container.querySelector("a");

      expect(button?.style.backgroundColor).not.toBe("");
      expect(link?.style.textDecoration).toBe("none");
      expect(link?.style.border).not.toBe("");
    });
  });

  describe("renderRetryBanner visual treatment", () => {
    it("styles the Retry button as clearly clickable, not a bare browser default", () => {
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry: vi.fn() });

      const retryButton = container.querySelector("button");
      expect(retryButton?.style.backgroundColor).not.toBe("");
    });
  });
});
