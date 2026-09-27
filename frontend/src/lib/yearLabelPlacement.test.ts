import { describe, expect, it } from "vitest";
import {
  computeYearLabelPlacements,
  estimateYearLabelWidth,
  type RawYearLabelMark,
} from "./yearLabelPlacement";

const BOUNDS = { minX: 65, maxX: 595 };

describe("yearLabelPlacement: estimateYearLabelWidth", () => {
  it("scales linearly with label length (deterministic char-count estimate, no live DOM measurement)", () => {
    expect(estimateYearLabelWidth("2026")).toBeCloseTo(4 * 6.7, 5);
    expect(estimateYearLabelWidth("20261")).toBeGreaterThan(estimateYearLabelWidth("2026"));
  });
});

describe("yearLabelPlacement: right-edge overflow (regression, Finding 1)", () => {
  it("keeps textAnchor='start' for a label with room to its right", () => {
    const marks: RawYearLabelMark[] = [{ key: "2020", x: 100, label: "2020" }];
    const [placed] = computeYearLabelPlacements(marks, BOUNDS);
    expect(placed.textAnchor).toBe("start");
  });

  it("flips to textAnchor='end' when the label's estimated text would overflow the plot's right edge, rather than clipping off-canvas", () => {
    // Anchor exactly at the plot's right edge - "start" would render the
    // full 4-char label entirely past maxX (the exact overflow shape both
    // reviewers demonstrated: a year's first point landing at/near the
    // right edge of the plot).
    const marks: RawYearLabelMark[] = [{ key: "2025", x: BOUNDS.maxX, label: "2025" }];
    const [placed] = computeYearLabelPlacements(marks, BOUNDS);

    expect(placed.textAnchor).toBe("end");
    // The anchor point itself never moves - only which side the text
    // renders on.
    expect(placed.x).toBe(BOUNDS.maxX);

    const width = estimateYearLabelWidth("2025");
    const right = placed.textAnchor === "end" ? placed.x : placed.x + width;
    const left = placed.textAnchor === "end" ? placed.x - width : placed.x;
    expect(right).toBeLessThanOrEqual(BOUNDS.maxX);
    expect(left).toBeGreaterThanOrEqual(BOUNDS.minX);
  });
});

describe("yearLabelPlacement: lead-in/first-real-year collision (regression, Finding 2)", () => {
  it("drops the earlier of two marks whose estimated extents collide, keeping the later one", () => {
    // Mirrors the adversarial reviewer's own real-scale-math reproduction:
    // a lead-in's clamped synthetic x lands only a few px from the first
    // real year's x, even though the calendar years are a decade apart.
    const marks: RawYearLabelMark[] = [
      { key: "2014", x: 65, label: "2014" },
      { key: "2020", x: 68.4, label: "2020" },
      { key: "2026", x: 590, label: "2026" },
    ];
    const placed = computeYearLabelPlacements(marks, BOUNDS);

    const keys = placed.map((mark) => mark.key);
    expect(keys).not.toContain("2014");
    expect(keys).toEqual(["2020", "2026"]);
  });

  it("keeps both marks when they are far enough apart not to collide", () => {
    const marks: RawYearLabelMark[] = [
      { key: "2014", x: 65, label: "2014" },
      { key: "2026", x: 590, label: "2026" },
    ];
    const placed = computeYearLabelPlacements(marks, BOUNDS);
    expect(placed.map((mark) => mark.key)).toEqual(["2014", "2026"]);
  });

  it("collapses a run of 3+ colliding marks down to just the last one", () => {
    const marks: RawYearLabelMark[] = [
      { key: "2014", x: 65, label: "2014" },
      { key: "2015", x: 68, label: "2015" },
      { key: "2020", x: 71, label: "2020" },
    ];
    const placed = computeYearLabelPlacements(marks, BOUNDS);
    expect(placed.map((mark) => mark.key)).toEqual(["2020"]);
  });

  it("never returns two marks with overlapping (or <8px apart) extents", () => {
    const marks: RawYearLabelMark[] = [
      { key: "2014", x: 65, label: "2014" },
      { key: "2020", x: 68.4, label: "2020" },
      { key: "2026", x: 590, label: "2026" },
    ];
    const placed = computeYearLabelPlacements(marks, BOUNDS);

    for (let i = 0; i < placed.length - 1; i += 1) {
      const current = placed[i];
      const next = placed[i + 1];
      const currentWidth = estimateYearLabelWidth(current.label);
      const currentRight = current.textAnchor === "end" ? current.x : current.x + currentWidth;
      const nextLeft =
        next.textAnchor === "end" ? next.x - estimateYearLabelWidth(next.label) : next.x;
      expect(nextLeft - currentRight).toBeGreaterThanOrEqual(8);
    }
  });

  it("returns an empty array for no marks and a single mark unchanged for one", () => {
    expect(computeYearLabelPlacements([], BOUNDS)).toEqual([]);
    const marks: RawYearLabelMark[] = [{ key: "2026", x: 300, label: "2026" }];
    expect(computeYearLabelPlacements(marks, BOUNDS)).toEqual([
      { key: "2026", x: 300, label: "2026", textAnchor: "start" },
    ]);
  });
});
