import { afterEach, describe, expect, it, vi } from "vitest";
import {
  animateScrollLeft,
  computeTargetScrollLeft,
  easeInOutCubic,
  prefersReducedMotion,
  type ColumnLayout,
} from "./scrollColumnIntoView";

// Maintenance item 5 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): a pure, DOM-layout-independent module so the "3rd visible
// position, whole-column preference, clamp near the start/end" placement
// math and the eased requestAnimationFrame-driven scroll animation are both
// fully unit-testable without depending on jsdom's (nonexistent) real
// layout engine - see TrendChart.sync.test.tsx's own EXTERNAL-UNVERIFIED
// precedent for why real-layout-dependent tests in this codebase are kept
// to a minimum and heavily caveated.

const STICKY_WIDTH = 150;

function columnsAt(offsets: number[], width = 100): ColumnLayout[] {
  return offsets.map((offsetLeft, index) => ({
    dateKey: `col-${index}`,
    offsetLeft,
    width,
  }));
}

describe("computeTargetScrollLeft", () => {
  it("places the target column at the 3rd visible position (2 whole columns before it)", () => {
    // Sticky column occupies [0, 150). Date columns start at offsetLeft 150,
    // each 100px wide: col-0@150, col-1@250, col-2@350, col-3@450, col-4@550.
    const columns = columnsAt([150, 250, 350, 450, 550]);

    const result = computeTargetScrollLeft({
      columns,
      targetDateKey: "col-3",
      stickyColumnWidth: STICKY_WIDTH,
      maxScrollLeft: 10000,
    });

    // Position 3 (0-indexed target position 2) means col-1 becomes the
    // first visible date column, right after the sticky column: scrollLeft
    // = col-1.offsetLeft - stickyColumnWidth = 250 - 150 = 100.
    expect(result).toBe(100);
  });

  it("clamps to scrollLeft 0 when fewer than 2 columns precede the target (near the start)", () => {
    const columns = columnsAt([150, 250, 350, 450, 550]);

    const result = computeTargetScrollLeft({
      columns,
      targetDateKey: "col-1",
      stickyColumnWidth: STICKY_WIDTH,
      maxScrollLeft: 10000,
    });

    expect(result).toBe(0);
  });

  it("clamps to scrollLeft 0 for the very first column", () => {
    const columns = columnsAt([150, 250, 350]);

    const result = computeTargetScrollLeft({
      columns,
      targetDateKey: "col-0",
      stickyColumnWidth: STICKY_WIDTH,
      maxScrollLeft: 10000,
    });

    expect(result).toBe(0);
  });

  it("clamps to maxScrollLeft when the naive 3rd-position target would overscroll past the end", () => {
    const columns = columnsAt([150, 250, 350, 450, 550]);

    const result = computeTargetScrollLeft({
      columns,
      targetDateKey: "col-4",
      stickyColumnWidth: STICKY_WIDTH,
      // Naive target would be col-2.offsetLeft - sticky = 350 - 150 = 200,
      // but the real scrollable range caps out lower than that.
      maxScrollLeft: 120,
    });

    expect(result).toBe(120);
  });

  it("returns null when the target dateKey isn't among the columns (defensive - never throw)", () => {
    const columns = columnsAt([150, 250, 350]);

    const result = computeTargetScrollLeft({
      columns,
      targetDateKey: "does-not-exist",
      stickyColumnWidth: STICKY_WIDTH,
      maxScrollLeft: 10000,
    });

    expect(result).toBeNull();
  });

  it("never returns a negative scrollLeft", () => {
    const columns = columnsAt([150]);

    const result = computeTargetScrollLeft({
      columns,
      targetDateKey: "col-0",
      stickyColumnWidth: STICKY_WIDTH,
      maxScrollLeft: 10000,
    });

    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe("easeInOutCubic", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("is exactly 0.5 at the midpoint (symmetric ease-in-out)", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });

  it("is monotonically non-decreasing across the full range", () => {
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const value = easeInOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("animateScrollLeft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("jumps instantly to the target when prefersReducedMotion is true, without scheduling any frames", () => {
    const container = { scrollLeft: 0 } as HTMLElement;
    const requestFrame = vi.fn();

    animateScrollLeft({
      container,
      targetScrollLeft: 500,
      prefersReducedMotion: true,
      requestFrame,
    });

    expect(container.scrollLeft).toBe(500);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("does nothing (no frames scheduled) when already at the target", () => {
    const container = { scrollLeft: 300 } as HTMLElement;
    const requestFrame = vi.fn();

    animateScrollLeft({
      container,
      targetScrollLeft: 300,
      requestFrame,
    });

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("drives scrollLeft through the eased curve over exactly the given duration, reaching the exact target at the end", () => {
    const container = { scrollLeft: 0 } as HTMLElement;
    // A property on a mutable object, not a bare `let`, sidesteps a
    // TypeScript control-flow-narrowing quirk where a `let` reassigned only
    // inside a nested closure gets narrowed back to its initial `null` type
    // at later call sites (microsoft/TypeScript#9998).
    const frame: { callback: FrameRequestCallback | null } = { callback: null };
    const requestFrame = vi.fn((cb: FrameRequestCallback) => {
      frame.callback = cb;
      return 1;
    });

    let currentTime = 1000;
    const now = () => currentTime;

    animateScrollLeft({
      container,
      targetScrollLeft: 1000,
      durationMs: 1500,
      now,
      requestFrame,
    });

    expect(requestFrame).toHaveBeenCalledTimes(1);

    // Halfway through the duration - eased progress at t=0.5 is exactly 0.5.
    currentTime = 1000 + 750;
    frame.callback?.(currentTime);
    expect(container.scrollLeft).toBeCloseTo(500, 5);
    expect(requestFrame).toHaveBeenCalledTimes(2);

    // Past the full duration - clamps to progress 1, exact target, and
    // stops scheduling further frames.
    currentTime = 1000 + 1600;
    frame.callback?.(currentTime);
    expect(container.scrollLeft).toBe(1000);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });
});

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when the media query matches", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);

    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("returns false when the media query does not match", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));

    expect(prefersReducedMotion()).toBe(false);
  });
});
