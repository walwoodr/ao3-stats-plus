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

describe("yearLabelPlacement: cascading collision after a textAnchor flip (regression, adversarial review batch #2, Finding 1)", () => {
  // Adversarial reviewer's own reproduction: a middle mark collides with its
  // (later) neighbor and gets dropped; that neighbor flips to
  // textAnchor="end" because it's near the plot's right edge, which moves
  // its rendered extent LEFTWARD (renders from `x - width`, not `x`). The
  // earlier-still-kept mark was only ever checked against the middle mark's
  // raw (pre-drop) extent, never against the flipped neighbor's actual
  // (further-left) extent - so the two surviving labels can end up closer
  // than the module's own MIN_YEAR_LABEL_GAP_PX (8px) guarantee, despite
  // every individual adjacent-raw-pair check reporting "no collision" at
  // the time it ran.
  it("still keeps >=8px between the two survivors when the later mark's flip reaches back into the earlier-kept mark's extent", () => {
    const marks: RawYearLabelMark[] = [
      { key: "2023", x: 510, label: "2023" },
      { key: "2024", x: 545, label: "2024" },
      { key: "2025", x: 570, label: "2025" },
    ];
    const placed = computeYearLabelPlacements(marks, BOUNDS);

    // The middle mark ("2024") must not survive alongside two marks that,
    // once "2025" resolves its own right-edge overflow, end up too close.
    for (let i = 0; i < placed.length - 1; i += 1) {
      const current = placed[i];
      const next = placed[i + 1];
      const currentWidth = estimateYearLabelWidth(current.label);
      const nextWidth = estimateYearLabelWidth(next.label);
      const currentRight = current.textAnchor === "end" ? current.x : current.x + currentWidth;
      const nextLeft = next.textAnchor === "end" ? next.x - nextWidth : next.x;
      expect(nextLeft - currentRight).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("yearLabelPlacement: no-two-kept-marks-closer-than-8px is a general invariant, not a one-input coincidence", () => {
  // The pre-fix module had exactly one test proving the 8px guarantee, on
  // one hardcoded input - which is precisely what let the cascading-flip
  // bug above ship undetected (that one input never happened to trigger a
  // flip that reached back past its immediate neighbor). This test instead
  // brute-force-sweeps a wide range of mark configurations - varying count,
  // spacing, and position relative to the right edge (where flips happen) -
  // and asserts the invariant holds for every one of them, mirroring the
  // adversarial reviewer's own verification method rather than trusting a
  // single case again.
  function assertNoCollisions(placed: ReturnType<typeof computeYearLabelPlacements>): void {
    for (let i = 0; i < placed.length - 1; i += 1) {
      const current = placed[i];
      const next = placed[i + 1];
      const currentWidth = estimateYearLabelWidth(current.label);
      const nextWidth = estimateYearLabelWidth(next.label);
      const currentRight = current.textAnchor === "end" ? current.x : current.x + currentWidth;
      const nextLeft = next.textAnchor === "end" ? next.x - nextWidth : next.x;
      expect(nextLeft - currentRight).toBeGreaterThanOrEqual(8);
    }
  }

  // Sweeping gaps forward from a single fixed starting point (an earlier
  // draft of this sweep) is exactly what let this slip through before: it
  // only varies spacing BETWEEN marks, never the absolute position of the
  // last mark relative to bounds.maxX - and this bug's trigger condition
  // (whether the last mark's raw extent overflows maxX and flips
  // textAnchor) depends on that absolute position, not just the gaps. That
  // first draft (fixed base, gaps 0-60) ran 3256 configurations and found
  // zero failures - against the *pre-fix, buggy* algorithm. It was a
  // brute-force sweep that itself proved nothing, the same class of mistake
  // as the single-hardcoded-case test it was meant to replace. Verified
  // independently (see scratchpad sweep) that scanning the last mark's
  // ABSOLUTE position across the boundary-crossing zone, crossed with dense
  // gaps for the earlier marks, finds 3276 failing configurations against
  // the pre-fix code out of ~115k - and zero against the fix below.
  const GAPS = Array.from({ length: 61 }, (_, i) => i);
  // Spans bounds.maxX - width(4-char label) on both sides, so both the
  // flipped and non-flipped case for the last mark are covered.
  const END_X_VALUES = Array.from({ length: 31 }, (_, i) => BOUNDS.maxX - 30 + i);

  it("holds for every 3-mark configuration, sweeping the last mark's absolute position across the right-edge flip boundary crossed with dense gaps for the earlier two", () => {
    let casesRun = 0;
    for (const x3 of END_X_VALUES) {
      for (const gap2 of GAPS) {
        for (const gap1 of GAPS) {
          const x2 = x3 - gap2;
          const x1 = x2 - gap1;
          if (x1 < BOUNDS.minX) continue;
          const marks: RawYearLabelMark[] = [
            { key: "y1", x: x1, label: "2010" },
            { key: "y2", x: x2, label: "2020" },
            { key: "y3", x: x3, label: "2030" },
          ];
          assertNoCollisions(computeYearLabelPlacements(marks, BOUNDS));
          casesRun += 1;
        }
      }
    }
    // Sanity-check the sweep itself actually exercised a meaningful number
    // of configurations, not an accidentally-empty loop (this exact
    // mistake - a sweep that silently runs ~0 real cases - is how the
    // earlier draft of this test passed against buggy code without proving
    // anything).
    expect(casesRun).toBeGreaterThan(100000);
  });

  it("holds for runs of 4 marks near the right edge (a colliding pop can itself expose a further-earlier collision)", () => {
    const smallGaps = Array.from({ length: 16 }, (_, i) => i * 2);
    const endXValues = Array.from({ length: 11 }, (_, i) => BOUNDS.maxX - 20 + i * 2);
    let casesRun = 0;
    for (const x4 of endXValues) {
      for (const gap3 of smallGaps) {
        for (const gap2 of smallGaps) {
          for (const gap1 of smallGaps) {
            const x3 = x4 - gap3;
            const x2 = x3 - gap2;
            const x1 = x2 - gap1;
            if (x1 < BOUNDS.minX) continue;
            const marks: RawYearLabelMark[] = [
              { key: "y1", x: x1, label: "2005" },
              { key: "y2", x: x2, label: "2015" },
              { key: "y3", x: x3, label: "2025" },
              { key: "y4", x: x4, label: "2035" },
            ];
            assertNoCollisions(computeYearLabelPlacements(marks, BOUNDS));
            casesRun += 1;
          }
        }
      }
    }
    expect(casesRun).toBeGreaterThan(10000);
  });
});
