import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  removeBannerStack,
  renderFailureBanner,
  renderInfoBanner,
  renderProgressBanner,
  renderRetryBanner,
  renderSuccessBanner,
  renderSummaryBanner,
  renderUnauthorizedBanner,
  type SaveTokenResult,
} from "./banners";

// The bookmarklet's confirmation/failure banners are injected into the AO3
// page itself, since that's where the user is at success/failure time. Per
// the plan: the success banner shows the readToken as visible, copyable
// text plus a link to the dashboard; failure banners are accessible
// (role="alert" so screen readers announce them) and keyboard-operable.
//
// Per-banner-type describe blocks (renderSuccessBanner, renderFailureBanner/
// renderInfoBanner/renderRetryBanner/renderUnauthorizedBanner,
// renderProgressBanner/updateProgressBanner/renderSummaryBanner) live in
// sibling banners.success.test.ts/banners.states.test.ts/
// banners.progress.test.ts respectively - split out (TECH_DEBT.md,
// 2026-08-03/2026-08-09) once this file exceeded CODE_STANDARDS.md's
// 400-line .ts budget, mirroring fanOut.test.ts's existing split-by-
// scenario-group convention. What remains here is genuinely cross-cutting:
// behavior that spans multiple banner types (shared styling, the shared
// stacking wrapper, re-injection cleanup), which wouldn't belong to any one
// banner-specific file.
describe("bookmarklet banners (cross-cutting: shared styling, stacking, cleanup)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
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
          frontendOrigin: "https://app.example.com",
          username: "someauthor",
          onSaveToken: vi.fn().mockResolvedValue({
            ok: true,
            readToken: "tok_visible_123",
          } satisfies SaveTokenResult),
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

  // Every banner used to be independently position:fixed at the same
  // top:1rem;right:1rem spot, so a second banner (e.g. runFanOut's summary
  // banner, rendered without removing its own progress banner - see
  // fanOut.ts) landed exactly on top of the first instead of below it. All
  // banners now render into one shared fixed-position stack that lays its
  // children out in a column, so multiple simultaneous banners visibly
  // stack down the Y axis instead of overlapping.
  describe("banner stacking wrapper", () => {
    it("renders multiple banners into one shared wrapper, not as separate top-level fixed banners", () => {
      renderInfoBanner(container, { message: "First" });
      renderRetryBanner(container, { message: "Second", onRetry: vi.fn() });

      const stacks = container.querySelectorAll("[data-ao3-stats-plus-banner-stack]");
      expect(stacks).toHaveLength(1);

      const stack = stacks[0];
      expect(stack.children).toHaveLength(2);
      expect(stack.children[0].textContent).toContain("First");
      expect(stack.children[1].textContent).toContain("Second");
    });

    it("gives the shared wrapper (not each individual banner) the fixed positioning and column layout", () => {
      renderInfoBanner(container, { message: "First" });
      renderRetryBanner(container, { message: "Second", onRetry: vi.fn() });

      const stack = container.querySelector(
        "[data-ao3-stats-plus-banner-stack]",
      ) as HTMLElement | null;
      expect(stack?.style.position).toBe("fixed");
      expect(stack?.style.flexDirection).toBe("column");
      expect(stack?.style.gap).not.toBe("");

      for (const banner of Array.from(stack?.children ?? [])) {
        expect((banner as HTMLElement).style.position).not.toBe("fixed");
      }
    });

    it("reuses the same wrapper across every banner type (success, failure, progress, summary, etc.)", () => {
      renderProgressBanner(container, { current: 1, total: 3 });
      renderSuccessBanner(container, {
        readToken: "cat-dog",
        frontendOrigin: "https://app.example.com",
        username: "someauthor",
        onSaveToken: vi.fn().mockResolvedValue({ ok: true, readToken: "cat-dog" }),
      });
      renderSummaryBanner(container, {
        enriched: 2,
        skipped: 1,
        total: 3,
        truncatedWorks: false,
        truncatedBookmarkPagesCount: 0,
        circuitBroken: false,
      });

      const stacks = container.querySelectorAll("[data-ao3-stats-plus-banner-stack]");
      expect(stacks).toHaveLength(1);
      expect(stacks[0].children).toHaveLength(3);
    });
  });

  // TECH_DEBT.md, 2026-07-23 "Re-injection cleanup gap": entrypoint.ts's
  // re-injection guard only ever tracked a single banner via
  // setGuardBanner, so any OTHER banner sharing the stack (fan-out's
  // progress/summary banners, never tracked there) plus the stack wrapper
  // itself were left orphaned in document.body across a re-injection.
  // removeBannerStack drops the whole shared wrapper in one call instead of
  // relying on a single tracked-banner reference.
  describe("removeBannerStack", () => {
    it("removes the whole shared stack wrapper, including every banner inside it", () => {
      renderInfoBanner(container, { message: "Progress-like banner" });
      renderRetryBanner(container, { message: "Tracked banner", onRetry: vi.fn() });
      expect(container.querySelectorAll("[data-ao3-stats-plus-banner-stack]")).toHaveLength(1);

      removeBannerStack(container);

      expect(container.querySelectorAll("[data-ao3-stats-plus-banner-stack]")).toHaveLength(0);
      expect(container.textContent).not.toContain("Progress-like banner");
      expect(container.textContent).not.toContain("Tracked banner");
    });

    it("is a no-op when no stack exists yet", () => {
      expect(() => removeBannerStack(container)).not.toThrow();
      expect(container.children).toHaveLength(0);
    });
  });
});
