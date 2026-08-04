import { describe, expect, it } from "vitest";
import {
  assignStyleSlot,
  releaseStyleSlot,
  SERIES_STYLE_SLOTS,
  type SeriesStyleSlot,
} from "./seriesStyles";

// The 10-slot (shape, color) style table (docs/plans/usds-dataviz-color-
// scheme.md, replacing the 6-slot shape/dash/color table from
// docs/plans/per-work-comparison-graph.md), plus a stable workId ->
// styleIndex assignment. Shape is now the SOLE accessibility-guaranteed,
// non-color channel (dash is gone - lines are solid, see the plan's "Dash
// decision"); colorRole is a redundant reinforcement channel resolved
// against `ColorTokens.series` (see colorTokens.ts) in the SAME slot order.
describe("SERIES_STYLE_SLOTS", () => {
  it("has exactly 10 slots - the resolved cap raise, one style per work", () => {
    expect(SERIES_STYLE_SLOTS).toHaveLength(10);
  });

  // Pinned from the plan's 10-slot table (section 3), as corrected same-day
  // by the user's 2026-08-04 basic-geometric-shapes-only review (see the
  // plan doc's addendum and TECH_DEBT.md-style dated note): slots 4/5/7
  // swap plus/star/cross for hollow/outline diamond, triangle, and
  // triangle-down respectively - no plus/star/cross anywhere in the final
  // set. Colors are untouched (colorRole per slot index is independent of
  // shape - see colorTokens.ts). No `dash`/`dashLabel` fields at all
  // (Partial<SeriesStyleSlot> below intentionally only checks these two
  // fields, so it also silently accepts an implementation that still
  // carries extra fields - the "does not have a dash/dashLabel field"
  // tests below cover their actual absence).
  it("matches the corrected 10-slot table exactly, in order (basic geometric shapes only)", () => {
    const expected: Partial<SeriesStyleSlot>[] = [
      { shape: "circle", colorRole: "wine" },
      { shape: "square", colorRole: "orange" },
      { shape: "triangle", colorRole: "amber" },
      { shape: "diamond", colorRole: "green" },
      { shape: "diamond-hollow", colorRole: "teal" },
      { shape: "triangle-hollow", colorRole: "azure" },
      { shape: "triangle-down", colorRole: "indigo" },
      { shape: "triangle-down-hollow", colorRole: "magenta" },
      { shape: "circle-hollow", colorRole: "slate" },
      { shape: "square-hollow", colorRole: "brown" },
    ];

    expected.forEach((slot, index) => {
      expect(SERIES_STYLE_SLOTS[index]).toMatchObject(slot);
    });
  });

  it("gives every slot a distinct shape", () => {
    const shapes = SERIES_STYLE_SLOTS.map((s) => s.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("gives every slot a distinct color role", () => {
    const roles = SERIES_STYLE_SLOTS.map((s) => s.colorRole);
    expect(new Set(roles).size).toBe(roles.length);
  });

  // Dash is gone entirely (plan's "Dash decision": at 10 slots, 10 mutually
  // distinguishable dasharrays don't exist, and dash was always redundant
  // with shape as a non-color channel) - no slot should carry a `dash` or
  // `dashLabel` field at all, not even `null`/an empty string.
  it("does not carry a `dash` field on any slot (lines are solid, dash removed as a per-series channel)", () => {
    SERIES_STYLE_SLOTS.forEach((slot) => {
      expect(slot).not.toHaveProperty("dash");
    });
  });

  it("does not carry a `dashLabel` field on any slot (the legend's worded description drops the dash word)", () => {
    SERIES_STYLE_SLOTS.forEach((slot) => {
      expect(slot).not.toHaveProperty("dashLabel");
    });
  });
});

describe("assignStyleSlot", () => {
  it("assigns the lowest free index (0) to the first work", () => {
    const assignment = assignStyleSlot(new Map(), 1);

    expect(assignment.get(1)).toBe(0);
  });

  it("assigns the next lowest free index to each subsequent work", () => {
    let assignment = assignStyleSlot(new Map(), 1);
    assignment = assignStyleSlot(assignment, 2);
    assignment = assignStyleSlot(assignment, 3);

    expect(assignment.get(1)).toBe(0);
    expect(assignment.get(2)).toBe(1);
    expect(assignment.get(3)).toBe(2);
  });

  it("is a no-op (returns the same assignment) for a work that already has a slot", () => {
    let assignment = assignStyleSlot(new Map(), 1);
    assignment = assignStyleSlot(assignment, 2);
    const before = assignment.get(1);

    assignment = assignStyleSlot(assignment, 1);

    expect(assignment.get(1)).toBe(before);
  });

  it("keeps a work's slot stable while other works are toggled on", () => {
    let assignment = assignStyleSlot(new Map(), 1);
    const workOneSlot = assignment.get(1);

    assignment = assignStyleSlot(assignment, 2);
    assignment = assignStyleSlot(assignment, 3);

    expect(assignment.get(1)).toBe(workOneSlot);
  });

  it("assigns up to all 10 slots as 10 works are added in sequence", () => {
    let assignment = new Map<number, number>();
    for (let workId = 1; workId <= 10; workId += 1) {
      assignment = assignStyleSlot(assignment, workId);
    }

    for (let workId = 1; workId <= 10; workId += 1) {
      expect(assignment.get(workId)).toBe(workId - 1);
    }
    expect(assignment.size).toBe(10);
  });

  it("does not assign an 11th slot once all 10 are taken (matches SERIES_STYLE_SLOTS.length)", () => {
    let assignment = new Map<number, number>();
    for (let workId = 1; workId <= 10; workId += 1) {
      assignment = assignStyleSlot(assignment, workId);
    }

    assignment = assignStyleSlot(assignment, 11);

    expect(assignment.has(11)).toBe(false);
    expect(assignment.size).toBe(10);
  });
});

describe("releaseStyleSlot", () => {
  it("removes a work's slot assignment", () => {
    let assignment = assignStyleSlot(new Map(), 1);
    assignment = releaseStyleSlot(assignment, 1);

    expect(assignment.has(1)).toBe(false);
  });

  it("is a no-op releasing a work that has no slot", () => {
    const assignment = releaseStyleSlot(new Map(), 99);

    expect(assignment.size).toBe(0);
  });

  it("frees the lowest index for reuse by the next newly-added work", () => {
    let assignment = assignStyleSlot(new Map(), 1); // slot 0
    assignment = assignStyleSlot(assignment, 2); // slot 1
    assignment = assignStyleSlot(assignment, 3); // slot 2

    assignment = releaseStyleSlot(assignment, 1); // frees slot 0
    assignment = assignStyleSlot(assignment, 4);

    expect(assignment.get(4)).toBe(0);
  });

  it("does not disturb other works' slots when releasing one", () => {
    let assignment = assignStyleSlot(new Map(), 1);
    assignment = assignStyleSlot(assignment, 2);
    const workTwoSlot = assignment.get(2);

    assignment = releaseStyleSlot(assignment, 1);

    expect(assignment.get(2)).toBe(workTwoSlot);
  });

  it("reuses the LOWEST free index, not just any free index, when multiple slots are free (extended over 10 slots)", () => {
    let assignment = new Map<number, number>();
    for (let workId = 1; workId <= 10; workId += 1) {
      assignment = assignStyleSlot(assignment, workId);
    }
    // Free slots 1 and 3 (indices), leaving 0, 2, 4-9 taken.
    assignment = releaseStyleSlot(assignment, 2);
    assignment = releaseStyleSlot(assignment, 4);

    assignment = assignStyleSlot(assignment, 11);

    expect(assignment.get(11)).toBe(1);
  });

  it("refills all 10 slots correctly after releasing and re-adding across the full range", () => {
    let assignment = new Map<number, number>();
    for (let workId = 1; workId <= 10; workId += 1) {
      assignment = assignStyleSlot(assignment, workId);
    }
    // Release every even-numbered work (slots 1, 3, 5, 7, 9).
    [2, 4, 6, 8, 10].forEach((workId) => {
      assignment = releaseStyleSlot(assignment, workId);
    });
    expect(assignment.size).toBe(5);

    // Re-add 5 new works - each should land on the lowest free slot,
    // lowest-first.
    [12, 13, 14, 15, 16].forEach((workId) => {
      assignment = assignStyleSlot(assignment, workId);
    });

    expect(assignment.get(12)).toBe(1);
    expect(assignment.get(13)).toBe(3);
    expect(assignment.get(14)).toBe(5);
    expect(assignment.get(15)).toBe(7);
    expect(assignment.get(16)).toBe(9);
    expect(assignment.size).toBe(10);
  });
});
