// The 6-slot (shape, dash, color-role) style table from the plan's Q3 table
// (docs/plans/per-work-comparison-graph.md), plus a stable workId ->
// styleIndex assignment. Shape + dash is the accessibility-guaranteed,
// non-color differentiator; colorRole is a redundant reinforcement channel
// resolved against `ColorTokens.series` (see colorTokens.ts) in the SAME
// slot order (wine, teal, amber, indigo, green, purple).
export type MarkerShapeName = "circle" | "square" | "triangle" | "diamond" | "plus" | "star";

export interface SeriesStyleSlot {
  shape: MarkerShapeName;
  dash: string | null; // null = solid (slot 1) - an explicit choice, not a missing value.
  colorRole: string;
  dashLabel: string; // human-readable word for the legend's worded style description.
}

export const SERIES_STYLE_SLOTS: readonly SeriesStyleSlot[] = [
  { shape: "circle", dash: null, colorRole: "wine", dashLabel: "solid" },
  { shape: "square", dash: "6 4", colorRole: "teal", dashLabel: "dashed" },
  { shape: "triangle", dash: "2 3", colorRole: "amber", dashLabel: "dotted" },
  { shape: "diamond", dash: "9 3 2 3", colorRole: "indigo", dashLabel: "dash-dot" },
  { shape: "plus", dash: "4 4", colorRole: "green", dashLabel: "short-dashed" },
  { shape: "star", dash: "1 3", colorRole: "purple", dashLabel: "fine-dotted" },
];

// Assignment is threaded through as an immutable Map (assign/release return
// a new map) so WorkComparisonSection can keep it in useState and re-derive
// per render without a class/singleton - see the plan's "State management"
// section.
export function assignStyleSlot(
  assignment: ReadonlyMap<number, number>,
  workId: number,
): Map<number, number> {
  if (assignment.has(workId)) return new Map(assignment);

  const usedIndices = new Set(assignment.values());
  let freeIndex = -1;
  for (let index = 0; index < SERIES_STYLE_SLOTS.length; index += 1) {
    if (!usedIndices.has(index)) {
      freeIndex = index;
      break;
    }
  }
  // All 6 slots taken - no 7th style exists to assign (matches the
  // MAX_SELECTED_WORKS cap in comparisonSelection.ts), so this is a no-op.
  if (freeIndex === -1) return new Map(assignment);

  const next = new Map(assignment);
  next.set(workId, freeIndex);
  return next;
}

export function releaseStyleSlot(
  assignment: ReadonlyMap<number, number>,
  workId: number,
): Map<number, number> {
  if (!assignment.has(workId)) return new Map(assignment);

  const next = new Map(assignment);
  next.delete(workId);
  return next;
}
