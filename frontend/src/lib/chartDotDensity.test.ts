import { describe, expect, it } from "vitest";
import {
  maxDotsFor,
  PLOT_WIDTH_BY_BREAKPOINT,
  selectVisibleDotIndices,
} from "./chartDotDensity";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4 item 7/§8 T7): chartDotDensity.ts does not exist yet - every test
// below fails at the import, a genuine red for this whole file. Pure,
// dependency-free helper (no React import) per the plan's own file-budget
// rationale, mirroring selectDisplayedTicks's (chartTimeAxis.ts)
// edge-keeping/even-sampling algorithm shape.
describe("PLOT_WIDTH_BY_BREAKPOINT: hardcoded per-breakpoint plot-width constants (no live measurement, by explicit requirement)", () => {
  it("defines exactly base and md tiers at the plan's specified pixel widths", () => {
    expect(PLOT_WIDTH_BY_BREAKPOINT).toEqual({ base: 280, md: 700 });
  });
});

describe("maxDotsFor: one dot per ~20px of plot width, per breakpoint", () => {
  it("resolves 'base' to 14 (floor(280 / 20))", () => {
    expect(maxDotsFor("base")).toBe(14);
  });

  it("resolves 'md' to 35 (floor(700 / 20))", () => {
    expect(maxDotsFor("md")).toBe(35);
  });
});

describe("selectVisibleDotIndices: edge-preserving even sampling", () => {
  it("returns every index (\"all\") when pointCount is <= maxDots", () => {
    expect(selectVisibleDotIndices(5, 14)).toBe("all");
    expect(selectVisibleDotIndices(14, 14)).toBe("all");
  });

  it("returns exactly maxDots indices when pointCount exceeds maxDots", () => {
    const result = selectVisibleDotIndices(45, 14);
    expect(result).not.toBe("all");
    expect((result as Set<number>).size).toBe(14);
  });

  it("always keeps the first (0) and last (pointCount - 1) indices", () => {
    const result = selectVisibleDotIndices(45, 14) as Set<number>;
    expect(result.has(0)).toBe(true);
    expect(result.has(44)).toBe(true);
  });

  it("samples roughly evenly across the range, not clustered at one end", () => {
    const result = selectVisibleDotIndices(100, 10) as Set<number>;
    const sorted = [...result].sort((a, b) => a - b);
    // No gap between consecutive picked indices should wildly dominate -
    // with 10 evenly spread picks across 100 points, every gap should be
    // close to 100/9 ≈ 11, not e.g. 90 (which would indicate clustering).
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i] - sorted[i - 1]).toBeLessThan(25);
    }
  });

  it("produces a stable, deterministic result for the same inputs", () => {
    const first = selectVisibleDotIndices(45, 14);
    const second = selectVisibleDotIndices(45, 14);
    expect(first).toEqual(second);
  });

  // §6 error states: guard against a divide-by-zero/NaN-index result for a
  // degenerate pointCount/maxDots, matching this module's established
  // defense-in-depth precedent (selectDisplayedTicks/formatDayTick).
  describe("error states (§6)", () => {
    it("does not throw and returns a sane result for pointCount <= 0", () => {
      expect(() => selectVisibleDotIndices(0, 14)).not.toThrow();
      const result = selectVisibleDotIndices(0, 14);
      expect(result === "all" || (result as Set<number>).size === 0).toBe(true);
    });

    it("does not throw and returns a sane result for maxDots <= 0", () => {
      expect(() => selectVisibleDotIndices(45, 0)).not.toThrow();
      const result = selectVisibleDotIndices(45, 0);
      expect(result === "all" || (result as Set<number>).size === 0).toBe(true);
    });

    it("never produces a NaN index", () => {
      const result = selectVisibleDotIndices(45, 14) as Set<number>;
      [...result].forEach((index) => expect(Number.isNaN(index)).toBe(false));
    });
  });
});
