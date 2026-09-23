import { usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import { useChartColors } from "../../lib/useChartColors";

export interface ActivePoint {
  x: number | string;
  y: number;
}

export interface ActivePointOverlayProps {
  activePoints: ActivePoint[];
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
export function ActivePointOverlay({ activePoints }: ActivePointOverlayProps) {
  const colors = useChartColors();
  const plotArea = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();

  if (!plotArea || !xScale || !yScale || activePoints.length === 0) return null;

  const resolvedPoints = activePoints
    .map((point) => ({ x: xScale(point.x), y: yScale(point.y) }))
    .filter((point): point is { x: number; y: number } => point.x != null && point.y != null);

  if (resolvedPoints.length === 0) return null;

  const guideLineX = resolvedPoints[0].x;

  return (
    <g aria-hidden="true">
      <line
        data-testid="active-point-guide-line"
        x1={guideLineX}
        x2={guideLineX}
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
    </g>
  );
}
