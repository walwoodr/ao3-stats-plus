// Regression fix (2026-09-27, Review batch): DateGroupingOverlay.tsx's year
// labels used a fixed `textAnchor="start"` and a bounds guard that only
// checked the label's ANCHOR point, never the rendered TEXT's width - two
// confirmed, reachable defects (both reviewers, independently):
//   1. A label whose anchor sits near the plot's right edge renders its
//      text past that edge, silently clipped off-canvas.
//   2. A lead-in's synthetic (clamped-near-first-real) x-position puts its
//      year label only a few px from the first real year's label, even
//      though the two years themselves are often a decade apart - a
//      near-guaranteed collision for any multi-year account with a lead-in,
//      not a rare edge case.
// This module is the pure geometry fix for both, kept separate from
// DateGroupingOverlay.tsx (no React/Recharts import) so it's directly unit-
// testable without the Recharts scale-hook harness those component tests
// require.

export interface RawYearLabelMark {
  key: string;
  x: number;
  label: string;
}

export interface PlacedYearLabelMark {
  key: string;
  x: number;
  label: string;
  textAnchor: "start" | "end";
}

export interface PlotBoundsX {
  minX: number;
  maxX: number;
}

// Deterministic character-count width estimate, not a live DOM measurement -
// same rationale as chartTimeAxis.ts's `estimateYAxisWidth` (jsdom never
// lays text out, and this project's own multi-round tick-machinery history
// showed Recharts' own "auto"/live-measurement paths aren't trustworthy
// either). Scaled down from that module's 7.3px/char (measured at the
// charts' 12px tick font) to this overlay's smaller 11px year-label font.
const YEAR_LABEL_CHAR_WIDTH_PX = 6.7;

export function estimateYearLabelWidth(label: string): number {
  return label.length * YEAR_LABEL_CHAR_WIDTH_PX;
}

// Two labels whose estimated extents land within this many px of each other
// read as visually touching/crowded even before they literally intersect -
// matches this codebase's other visual-spacing tuning (dateGroupingChart
// Layout.ts's EXTRA_BAND_HEIGHT, DateGroupingOverlay.tsx's own offset
// constants) being done against real rendering rather than a bare 0px
// threshold.
const MIN_YEAR_LABEL_GAP_PX = 8;

interface PlacedWithExtent extends PlacedYearLabelMark {
  left: number;
  right: number;
}

// A label anchored at its real data-point x always renders its text
// leftward (`textAnchor="end"`) instead of rightward whenever the rightward
// rendering would push past the plot's right edge - the anchor itself never
// moves, only which side of it the text is drawn on. Left-edge overflow is
// not defended symmetrically here: every anchor is an in-domain point by
// construction (DateGroupingOverlay's own §0.2 load-bearing rule), so it can
// never sit left of the plot's own left edge the way it can sit at/near the
// right edge (the last real/lead-in point in a series is exactly as likely
// to land at the domain's right edge as its left).
function placeWithExtent(mark: RawYearLabelMark, bounds: PlotBoundsX): PlacedWithExtent {
  const width = estimateYearLabelWidth(mark.label);
  const overflowsRight = mark.x + width > bounds.maxX;
  const textAnchor: "start" | "end" = overflowsRight ? "end" : "start";
  const left = textAnchor === "start" ? mark.x : mark.x - width;
  const right = textAnchor === "start" ? mark.x + width : mark.x;
  return { key: mark.key, x: mark.x, label: mark.label, textAnchor, left, right };
}

// `marks` must already be in ascending x order (DateGroupingOverlay builds
// them in chronological hierarchy order off a scale that's monotonic in x,
// so this always holds for its real call site). Resolves right-edge
// overflow per mark first, then drops the EARLIER of any two adjacent marks
// whose resolved extents collide (overlap, or land within
// MIN_YEAR_LABEL_GAP_PX) - the later year is kept, since it's the one about
// to become "current" on screen, and the dropped earlier year is still
// conveyed by the month-span row and the year-rule line immediately next to
// it. A run of 3+ colliding marks collapses correctly via the same
// adjacent-pair rule applied left-to-right (each survivor is re-compared
// against the next raw mark, not against an already-dropped one).
export function computeYearLabelPlacements(
  marks: RawYearLabelMark[],
  bounds: PlotBoundsX,
): PlacedYearLabelMark[] {
  const placed = marks.map((mark) => placeWithExtent(mark, bounds));
  const kept: PlacedWithExtent[] = [];
  for (let index = 0; index < placed.length; index += 1) {
    const current = placed[index];
    const next = placed[index + 1];
    const collidesWithNext = next != null && current.right + MIN_YEAR_LABEL_GAP_PX > next.left;
    if (collidesWithNext) continue;
    kept.push(current);
  }
  return kept.map(({ key, x, label, textAnchor }) => ({ key, x, label, textAnchor }));
}
