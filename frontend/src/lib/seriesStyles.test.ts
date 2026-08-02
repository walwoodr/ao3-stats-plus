import { describe, expect, it } from "vitest";
import {
  assignStyleSlot,
  releaseStyleSlot,
  SERIES_STYLE_SLOTS,
  type SeriesStyleSlot,
} from "./seriesStyles";

// The 6-slot (shape, dash, color-role) table from the plan's Q3 table, plus
// a stable workId -> styleIndex assignment. Assignment is threaded through
// as an immutable Map (assign/release return a new map) so
// WorkComparisonSection can keep it in useState and re-derive per render
// without a class/singleton.
describe("SERIES_STYLE_SLOTS", () => {
  it("has exactly 6 slots - the resolved cap from Q2, one style per work", () => {
    expect(SERIES_STYLE_SLOTS).toHaveLength(6);
  });

  // Pinned exactly from the plan's Q3 table - shape, dash, and color-role
  // per slot. Dash uses `null` to represent "solid" (slot 1) rather than an
  // empty string, so a solid line is an explicit choice, not a missing
  // value.
  it("matches the plan's Q3 table exactly, in order", () => {
    const expected: SeriesStyleSlot[] = [
      { shape: "circle", dash: null, colorRole: "wine" },
      { shape: "square", dash: "6 4", colorRole: "teal" },
      { shape: "triangle", dash: "2 3", colorRole: "amber" },
      { shape: "diamond", dash: "9 3 2 3", colorRole: "indigo" },
      { shape: "plus", dash: "4 4", colorRole: "green" },
      { shape: "star", dash: "1 3", colorRole: "purple" },
    ];

    expected.forEach((slot, index) => {
      expect(SERIES_STYLE_SLOTS[index]).toMatchObject(slot);
    });
  });

  it("gives every slot a distinct shape", () => {
    const shapes = SERIES_STYLE_SLOTS.map((s) => s.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("gives every slot a distinct dash pattern", () => {
    const dashes = SERIES_STYLE_SLOTS.map((s) => s.dash);
    expect(new Set(dashes).size).toBe(dashes.length);
  });

  it("gives every slot a distinct color role", () => {
    const roles = SERIES_STYLE_SLOTS.map((s) => s.colorRole);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("gives every slot a human-readable dashLabel usable in the legend's worded style description", () => {
    SERIES_STYLE_SLOTS.forEach((slot) => {
      expect(typeof slot.dashLabel).toBe("string");
      expect(slot.dashLabel.length).toBeGreaterThan(0);
    });
    // Solid (slot 1) must be described in words, exactly matching the
    // plan's own worked example: "solid wine line, circle marker".
    expect(SERIES_STYLE_SLOTS[0].dashLabel).toBe("solid");
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

  it("does not assign a 7th slot once all 6 are taken (matches SERIES_STYLE_SLOTS.length)", () => {
    let assignment = new Map<number, number>();
    for (let workId = 1; workId <= 6; workId += 1) {
      assignment = assignStyleSlot(assignment, workId);
    }

    assignment = assignStyleSlot(assignment, 7);

    expect(assignment.has(7)).toBe(false);
    expect(assignment.size).toBe(6);
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

  it("reuses the LOWEST free index, not just any free index, when multiple slots are free", () => {
    let assignment = new Map<number, number>();
    for (let workId = 1; workId <= 6; workId += 1) {
      assignment = assignStyleSlot(assignment, workId);
    }
    // Free slots 1 and 3 (indices), leaving 0, 2, 4, 5 taken.
    assignment = releaseStyleSlot(assignment, 2);
    assignment = releaseStyleSlot(assignment, 4);

    assignment = assignStyleSlot(assignment, 7);

    expect(assignment.get(7)).toBe(1);
  });
});
