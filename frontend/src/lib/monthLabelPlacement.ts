// Maintenance fix (2026-10-15, TECH_DEBT.md 2026-09-29 entry: "Month-label/
// Y-axis-tick collision"). DateGroupingOverlay.tsx renders each month-span
// label centered (`textAnchor="middle"`) on the midpoint between its first
// and last plotted day. For a single-point month sitting at the domain
// minimum (a lead-in, or the first real point when there's no lead-in), that
// midpoint equals the point's own x - which is exactly plotArea.x, the
// plot's left edge. A centered label there renders HALF its text to the
// LEFT of plotArea.x, directly into the Y-axis's own reserved width, where
// the Y-axis's leftmost tick label (e.g. "0") already renders - producing
// the reported "0Sep" collision with no gap between them.
//
// This mirrors yearLabelPlacement.ts's existing edge-safety guard (Finding
// 1 there: a label whose anchor sits near the plot's RIGHT edge flips
// `textAnchor` from "start" to "end" so its text renders leftward instead of
// clipping off-canvas). The geometry here is the mirror image: a label whose
// CENTER sits near the plot's LEFT edge flips from "middle" to "start" so
// its text renders rightward from that center instead of bleeding left of
// it. The anchor itself never moves, same as yearLabelPlacement.ts's own
// invariant - only which side of it the text draws on.
//
// Unlike yearLabelPlacement.ts, this module only needs the single edge-
// safety guard, not its collision-between-marks machinery (Finding 2,
// computeYearLabelPlacements' drop-the-earlier-of-two-colliding-marks
// logic) - month labels aren't reported/observed to collide with each
// other's own mark the way a lead-in's and the first real year's label can;
// this fix is scoped to the one confirmed defect.
//
// Maintenance fix (2026-10-21, TECH_DEBT.md 2026-10-15 entry: "Month-label
// right-edge overflow"). The mirror-image case of the left-edge guard above:
// a single-point month sitting at the domain MAXIMUM (e.g. the most recent
// capture date) has its midpoint land on bounds.maxX, the plot's right
// edge - a centered label there renders half its text past that edge. This
// flips `textAnchor` to "end" (mirroring yearLabelPlacement.ts's own
// right-edge guard, Finding 1 there) so the text renders leftward from the
// center instead of overflowing right. Both edge checks are independent (a
// mark can only realistically overflow one side at once for any plausible
// plot width), so left is checked first and takes precedence if a
// pathologically narrow bounds ever made both true.

export interface RawMonthLabelMark {
  key: string;
  x1: number;
  x2: number;
  label: string;
}

export interface PlacedMonthLabelMark {
  key: string;
  x: number;
  label: string;
  textAnchor: "start" | "middle" | "end";
}

export interface PlotBoundsX {
  minX: number;
  maxX: number;
}

// Same deterministic character-count estimate approach as
// yearLabelPlacement.ts's estimateYearLabelWidth (jsdom never lays text out,
// and this project's own tick-machinery history showed live DOM measurement
// isn't trustworthy either) - reused at the same value since month labels
// render at the same 10px/600-weight size as year labels (just a different,
// `var(--font-sans)` family instead of `var(--font-mono)`), and the 3-letter
// month abbreviations this estimates (Jan/Feb/.../Dec) are a similar glyph
// mix to the 4-digit year labels the constant was originally tuned against.
const MONTH_LABEL_CHAR_WIDTH_PX = 6.7;

export function estimateMonthLabelWidth(label: string): number {
  return label.length * MONTH_LABEL_CHAR_WIDTH_PX;
}

// `bounds.minX`/`bounds.maxX` are the plot's own left/right edges
// (plotArea.x / plotArea.x + plotArea.width). A month mark's anchor (the
// midpoint of its x1/x2 span) can never itself sit outside [minX, maxX],
// since x1/x2 are always in-domain plotted points (DateGroupingOverlay's own
// bounds guard already filters anything else out before this runs) - so
// switching textAnchor to "start" (left overflow) or "end" (right overflow)
// always fully resolves the respective case, the same way
// yearLabelPlacement.ts's flip to "end" always fully resolves its
// right-edge case.
export function computeMonthLabelPlacements(
  marks: RawMonthLabelMark[],
  bounds: PlotBoundsX,
): PlacedMonthLabelMark[] {
  return marks.map((mark) => {
    const x = (mark.x1 + mark.x2) / 2;
    const width = estimateMonthLabelWidth(mark.label);
    const overflowsLeft = x - width / 2 < bounds.minX;
    const overflowsRight = x + width / 2 > bounds.maxX;
    const textAnchor: "start" | "middle" | "end" = overflowsLeft
      ? "start"
      : overflowsRight
        ? "end"
        : "middle";
    return { key: mark.key, x, label: mark.label, textAnchor };
  });
}
