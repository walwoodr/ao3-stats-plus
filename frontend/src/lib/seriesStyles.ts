// The 10-slot (shape, color) style table from the plan's section 3 table
// (docs/plans/usds-dataviz-color-scheme.md), superseding the original
// 6-slot (shape, dash, color-role) table from
// docs/plans/per-work-comparison-graph.md's Q3 decision. Shape is now the
// SOLE accessibility-guaranteed, non-color differentiator - per the plan's
// "Dash decision," 10 mutually distinguishable dasharray patterns don't
// exist, so per-series lines are solid and dash is reserved exclusively for
// the already-shipped zero-basis lead-in (MultiSeriesTrendChart.tsx, not
// read from this table). colorRole is a redundant reinforcement channel
// resolved against `ColorTokens.series` (see colorTokens.ts) in the SAME
// slot order.
export type MarkerShapeName =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "plus"
  | "star"
  | "triangle-down"
  | "cross"
  | "circle-hollow"
  | "square-hollow";

export interface SeriesStyleSlot {
  shape: MarkerShapeName;
  colorRole: string;
}

export const SERIES_STYLE_SLOTS: readonly SeriesStyleSlot[] = [
  { shape: "circle", colorRole: "wine" },
  { shape: "square", colorRole: "orange" },
  { shape: "triangle", colorRole: "amber" },
  { shape: "diamond", colorRole: "green" },
  { shape: "plus", colorRole: "teal" },
  { shape: "star", colorRole: "azure" },
  { shape: "triangle-down", colorRole: "indigo" },
  { shape: "cross", colorRole: "magenta" },
  { shape: "circle-hollow", colorRole: "slate" },
  { shape: "square-hollow", colorRole: "brown" },
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
  // All 10 slots taken - no 11th style exists to assign (matches the
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
