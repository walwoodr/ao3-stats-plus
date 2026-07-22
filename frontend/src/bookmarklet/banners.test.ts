import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderFailureBanner,
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
});
