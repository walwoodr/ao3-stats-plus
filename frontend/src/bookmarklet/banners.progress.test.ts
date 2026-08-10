import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderProgressBanner, renderSummaryBanner, updateProgressBanner } from "./banners";

// Split out of banners.test.ts (TECH_DEBT.md, 2026-08-03: that file exceeded
// CODE_STANDARDS.md's 400-line .ts budget) - the Phase 2 fan-out live-
// progress indicator and its final summary report, mirroring fanOut.test.ts's
// existing split-by-scenario-group convention.
describe("bookmarklet banners (fan-out progress/summary)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
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
  // is capped/circuit-broken) - plan section 7: "Saved further data for X of M, Y
  // skipped" plus any truncation, so partial success (the normal operating
  // mode under fan-out) is always visible, never silently swallowed.
  describe("renderSummaryBanner (Phase 2 fan-out final report)", () => {
    it("reports the enriched, skipped, and total counts", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 8,
        skipped: 2,
        total: 10,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: false,
      });

      expect(banner.textContent).toMatch(/8/);
      expect(banner.textContent).toMatch(/2/);
    });

    it("surfaces truncation rather than silently dropping it", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 3,
        skipped: 0,
        total: 3,
        truncatedWorks: true,
        truncatedBookmarkPagesCount: 1,
        circuitBroken: false,
      });

      expect(banner.textContent).toMatch(/truncat/i);
    });

    it("surfaces a circuit-broken run distinctly from an ordinary partial-success summary", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 1,
        skipped: 4,
        total: 5,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: true,
      });

      expect(banner.textContent).toMatch(/stopped|circuit|paused/i);
    });

    it("uses an accessible status role so screen readers announce the final result", () => {
      const banner = renderSummaryBanner(container, {
        enriched: 5,
        skipped: 0,
        total: 5,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: false,
      });

      expect(banner.getAttribute("role")).toBe("status");
    });
  });
});
