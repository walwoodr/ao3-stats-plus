import { usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import { useChartColors } from "../../lib/useChartColors";

export interface ActivePoint {
  x: number | string;
  y: number;
}

export interface ActivePointOverlayProps {
  activePoints: ActivePoint[];
  // Item 3 (§2.2): point A, drawn as a SECOND, visually distinct overlay -
  // solid/filled ring+line vs the hover's translucent/hollow ring+line.
  // Optional, defaulting to nothing pinned, so every pre-existing call site
  // keeps compiling/rendering unmodified.
  pinnedPoints?: ActivePoint[];
  // Item 1/D2: draws the non-zero-origin break glyph at the y-baseline when
  // true. Optional, defaulting to false (no glyph).
  brokenYAxis?: boolean;
}

// Rendered as a child INSIDE each chart's <LineChart> (plan §2.3): reads the
// table->chart sync's resolved active-date points via Recharts' public scale
// hooks (useXAxisScale/useYAxisScale/usePlotArea, all since 3.8/3.1) and
// draws D-B's guide line + ringed markers. Purely additive SVG driven by our
// own React state - it never touches Recharts' internal tooltip/active-index
// state, so it can't fight it. Each caller resolves its own xValue/
// capturedOn -> per-series-value mapping and skips any series with no value
// at the active date (plan §6's sparse-cell rule), so this component itself
// stays chart-shape-agnostic.
export function ActivePointOverlay({
  activePoints,
  pinnedPoints = [],
  brokenYAxis = false,
}: ActivePointOverlayProps) {
  const colors = useChartColors();
  const plotArea = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();

  if (!plotArea || !xScale || !yScale) return null;

  const resolvedPoints = activePoints
    .map((point) => ({ x: xScale(point.x), y: yScale(point.y) }))
    .filter((point): point is { x: number; y: number } => point.x != null && point.y != null);

  const resolvedPinnedPoints = pinnedPoints
    .map((point) => ({ x: xScale(point.x), y: yScale(point.y) }))
    .filter((point): point is { x: number; y: number } => point.x != null && point.y != null);

  const hasActive = resolvedPoints.length > 0;
  const hasPinned = resolvedPinnedPoints.length > 0;

  if (!hasActive && !hasPinned && !brokenYAxis) return null;

  return (
    <g aria-hidden="true">
      {hasActive && (
        <>
          <line
            data-testid="active-point-guide-line"
            x1={resolvedPoints[0].x}
            x2={resolvedPoints[0].x}
            y1={plotArea.y}
            y2={plotArea.y + plotArea.height}
            stroke={colors.accent}
            strokeOpacity={0.4}
          />
          {resolvedPoints.map((point, index) => (
            <circle
              key={index}
              data-testid="active-point-ring"
              cx={point.x}
              cy={point.y}
              r={8}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2}
            />
          ))}
        </>
      )}
      {hasPinned && (
        <>
          <line
            data-testid="pinned-point-guide-line"
            x1={resolvedPinnedPoints[0].x}
            x2={resolvedPinnedPoints[0].x}
            y1={plotArea.y}
            y2={plotArea.y + plotArea.height}
            stroke={colors.accent}
            strokeOpacity={1}
          />
          {resolvedPinnedPoints.map((point, index) => (
            <circle
              key={index}
              data-testid="pinned-point-ring"
              cx={point.x}
              cy={point.y}
              r={8}
              fill={colors.accent}
              stroke={colors.accent}
              strokeWidth={2}
            />
          ))}
        </>
      )}
      {brokenYAxis && (
        <YAxisBreakGlyph x={plotArea.x} y={plotArea.y + plotArea.height} color={colors.inkSoft} />
      )}
    </g>
  );
}

// D2's "real broken-axis glyph, not a label": two short parallel 30deg
// slashes centered on the y-baseline, just inside the plot area's left edge
// (the conventional "//" zigzag cue). Purely visual - the chart is
// aria-hidden and the accessible table always carries true values, so there
// is no risk of misleading a screen-reader user.
function YAxisBreakGlyph({ x, y, color }: { x: number; y: number; color: string }) {
  const halfHeight = 5;
  const halfWidth = 3;
  const gap = 4;
  return (
    <g data-testid="y-axis-break-glyph" stroke={color} strokeWidth={1.5}>
      <line
        x1={x - gap / 2 - halfWidth}
        y1={y + halfHeight}
        x2={x - gap / 2 + halfWidth}
        y2={y - halfHeight}
      />
      <line
        x1={x + gap / 2 - halfWidth}
        y1={y + halfHeight}
        x2={x + gap / 2 + halfWidth}
        y2={y - halfHeight}
      />
    </g>
  );
}
