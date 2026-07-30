import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderFailureBanner,
  renderInfoBanner,
  renderRetryBanner,
  renderSuccessBanner,
  renderUnauthorizedBanner,
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
