import { describe, expect, it } from "vitest";
import {
  computeMonthLabelPlacements,
  estimateMonthLabelWidth,
  type RawMonthLabelMark,
} from "./monthLabelPlacement";

const BOUNDS = { minX: 65, maxX: 595 };

describe("monthLabelPlacement: estimateMonthLabelWidth", () => {
  it("scales linearly with label length (deterministic char-count estimate, no live DOM measurement)", () => {
    expect(estimateMonthLabelWidth("Sep")).toBeCloseTo(3 * 6.7, 5);
    expect(estimateMonthLabelWidth("September")).toBeGreaterThan(estimateMonthLabelWidth("Sep"));
  });
});

describe("monthLabelPlacement: left-edge Y-axis collision (regression, TECH_DEBT.md 2026-09-29)", () => {
  it("keeps textAnchor='middle' for a label with room on both sides", () => {
    const marks: RawMonthLabelMark[] = [{ key: "2026-7", x1: 300, x2: 320, label: "Jul" }];
    const [placed] = computeMonthLabelPlacements(marks, BOUNDS);
    expect(placed.textAnchor).toBe("middle");
    expect(placed.x).toBe(310);
  });

  it("flips to textAnchor='start' when a single-point month sits exactly at the plot's left edge (the exact lead-in/first-point reproduction)", () => {
    // x1 === x2 === bounds.minX: a single-point month (e.g. a lead-in,
    // or the first real point with no lead-in) at the domain minimum -
    // the midpoint under the old always-"middle" behavior sat exactly on
    // bounds.minX, so half the rendered text bled left of it into the
    // Y-axis's own reserved width (the reported "0Sep" collision).
    const marks: RawMonthLabelMark[] = [
      { key: "2014-9", x1: BOUNDS.minX, x2: BOUNDS.minX, label: "Sep" },
    ];
    const [placed] = computeMonthLabelPlacements(marks, BOUNDS);

    expect(placed.textAnchor).toBe("start");
    // The anchor itself never moves - only which side the text renders on.
    expect(placed.x).toBe(BOUNDS.minX);

    const width = estimateMonthLabelWidth("Sep");
    const left = placed.textAnchor === "start" ? placed.x : placed.x - width / 2;
    expect(left).toBeGreaterThanOrEqual(BOUNDS.minX);
  });

  it("flips to textAnchor='start' for a multi-point month whose midpoint still overflows the left edge", () => {
    // x1 at the left edge, x2 only a couple px right of it - midpoint is
    // still close enough to bounds.minX that half of a 3-letter label's
    // estimated width pushes past it under "middle".
    const marks: RawMonthLabelMark[] = [
      { key: "2026-1", x1: BOUNDS.minX, x2: BOUNDS.minX + 2, label: "Jan" },
    ];
    const [placed] = computeMonthLabelPlacements(marks, BOUNDS);
    expect(placed.textAnchor).toBe("start");
  });

  it("never renders text left of bounds.minX, swept across a range of left-edge-adjacent positions", () => {
    for (let offset = 0; offset <= 20; offset += 1) {
      const x = BOUNDS.minX + offset;
      const marks: RawMonthLabelMark[] = [{ key: "m", x1: x, x2: x, label: "Sep" }];
      const [placed] = computeMonthLabelPlacements(marks, BOUNDS);
      const width = estimateMonthLabelWidth("Sep");
      const left = placed.textAnchor === "start" ? placed.x : placed.x - width / 2;
      expect(left).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-9);
    }
  });

  it("returns an empty array for no marks", () => {
    expect(computeMonthLabelPlacements([], BOUNDS)).toEqual([]);
  });
});
