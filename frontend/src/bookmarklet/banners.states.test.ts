import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderFailureBanner,
  renderInfoBanner,
  renderRetryBanner,
  renderUnauthorizedBanner,
} from "./banners";

// Split out of banners.test.ts (TECH_DEBT.md, 2026-08-03: that file exceeded
// CODE_STANDARDS.md's 400-line .ts budget) - the four "something didn't go
// as planned" banner variants (scrape-layout failure, pre-POST info,
// network/POST retry, unauthorized/out-of-date), mirroring fanOut.test.ts's
// existing split-by-scenario-group convention.
describe("bookmarklet banners (failure/info/retry/unauthorized states)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
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

    // The schemaVersion is a debugging detail, not something a non-technical
    // reader needs to parse alongside the actual problem - it must not be
    // concatenated into the primary message sentence.
    it("keeps the schemaVersion out of the primary message text", () => {
      const banner = renderFailureBanner(container, {
        message: "This bookmarklet is out of date - please reinstall it.",
        schemaVersion: 1,
      });

      const message = banner.querySelector("p");
      expect(message?.textContent).toBe("This bookmarklet is out of date - please reinstall it.");
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

    // TECH_DEBT.md (2026-07-23): this is the ONLY feedback shown when a
    // capture can't even start (no works / not "All Years" / scrape
    // failed), yet it used to be a polite role="status" - weaker than the
    // assertive role="alert" the post-capture failure/unauthorized banners
    // use. Tightened from a permissive ["status", "alert"] check to require
    // "alert" specifically, matching that assertiveness.
    it("uses role=alert (not the weaker role=status) so screen readers announce it assertively, matching the other failure banners", () => {
      const banner = renderInfoBanner(container, {
        message: "Couldn't read your stats page - AO3's layout may have changed.",
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

  describe("renderRetryBanner visual treatment", () => {
    it("styles the Retry button as clearly clickable, not a bare browser default", () => {
      renderRetryBanner(container, { message: "Couldn't reach the server", onRetry: vi.fn() });

      const retryButton = container.querySelector("button");
      expect(retryButton?.style.backgroundColor).not.toBe("");
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
