import { renderMarkerShape } from "../../lib/markerPaths";
import type { MarkerShapeName } from "../../lib/seriesStyles";

// Extraction task I4 (docs/plans/date-hierarchy-grouping.md §2.2/§10):
// MultiSeriesTrendChart.tsx sat at the exact 500-line .tsx budget ceiling,
// with zero headroom for this feature's overlay wiring - the two inline
// `dot={(dotProps) => ...}` render callbacks (one per <Line>, main series +
// lead-in) are pulled out here as small factory functions, freeing space in
// the parent with NO behavior change (same shapes/colors/skip conditions as
// before extraction).

// Structurally matches MultiSeriesTrendChart's own `ChartRow` shape
// (`{ capturedOn: string; xEpoch: number } & Record<string, ...>`) without
// importing that type directly, so this module has no dependency back on
// its caller.
interface DotPayload {
  capturedOn: string;
  [key: string]: string | number | null;
}

interface DotRenderProps {
  cx?: number;
  cy?: number;
  payload?: DotPayload;
  index?: number;
}

// A work's main series dot: its own (shape, color) glyph at every real point
// it has a value for; skipped (an empty <g>, not a visible mark) at any slot
// where this series has no value (a chart gap) - unchanged from the
// pre-extraction inline callback.
export function createSeriesDot(params: {
  dataKey: string;
  shape: MarkerShapeName;
  color: string;
}) {
  const { dataKey, shape, color } = params;
  return function seriesDot(dotProps: DotRenderProps) {
    const { cx, cy, payload, index } = dotProps;
    const value = payload ? payload[dataKey] : null;
    if (value == null || cx == null || cy == null) {
      return <g key={`${dataKey}-dot-${index}`} />;
    }
    return (
      <g key={`${dataKey}-dot-${index}`}>{renderMarkerShape(shape, { cx, cy, size: 4, color })}</g>
    );
  };
}

// A work's estimated-baseline lead-in dot: only the zero-basis slot itself
// gets a dot (in inkSoft, not the work's own color) - the first-real slot
// this same "lead-*" line also carries (to close the dashed segment)
// already has its own dot from the main series line above.
export function createLeadInDot(params: {
  dataKey: string;
  leadInCapturedOn: string;
  color: string;
}) {
  const { dataKey, leadInCapturedOn, color } = params;
  return function leadInDot(dotProps: DotRenderProps) {
    const { cx, cy, payload, index } = dotProps;
    if (payload?.capturedOn !== leadInCapturedOn || cx == null || cy == null) {
      return <g key={`${dataKey}-dot-${index}`} />;
    }
    return <circle key={`${dataKey}-dot-${index}`} cx={cx} cy={cy} r={4} fill={color} />;
  };
}
