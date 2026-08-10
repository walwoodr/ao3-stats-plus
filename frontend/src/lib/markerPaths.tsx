import type { MarkerShapeName } from "./seriesStyles";

// Pure SVG-path renderers for the 10 marker shapes (docs/plans/usds-
// dataviz-color-scheme.md's slot table, corrected same-day 2026-08-04 per
// the user's basic-geometric-shapes-only review - see that plan's addendum)
// - 5 base geometric shapes (circle, square, triangle, diamond,
// triangle-down), each filled and hollow. No plus/star/cross. Split out of
// markerShapes.tsx (TECH_DEBT.md, 2026-08-03) so that file can export only
// the `MarkerGlyph` component, clearing the
// `react-refresh/only-export-components` warning that colocating this
// non-component helper with it used to trip - both the Recharts custom dot
// (MultiSeriesTrendChart.tsx) and the legend glyph (MarkerGlyph, still in
// markerShapes.tsx) call `renderMarkerShape` so the two never drift.
export interface ShapeGeometryProps {
  cx: number;
  cy: number;
  size: number;
  color: string;
}

function diamondPoints(cx: number, cy: number, size: number): string {
  return `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
}

function trianglePoints(cx: number, cy: number, size: number): string {
  return `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`;
}

function triangleDownPoints(cx: number, cy: number, size: number): string {
  return `${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`;
}

// Hollow markers (circle-hollow, square-hollow, diamond-hollow,
// triangle-hollow, triangle-down-hollow) draw only an outline, so
// their stroke width must scale with `size` rather than use a fixed
// constant - otherwise the outline reads as too thin at chart scale
// (size:4) or too thick at legend scale (size:5). A fixed fraction of
// `size` keeps the proportions consistent across both call sites.
function hollowStrokeWidth(size: number): number {
  return size * 0.5;
}

// Renders the shape's raw SVG primitive, positioned at (cx, cy) - suitable
// for embedding directly inside another SVG's coordinate system (a Recharts
// custom `dot` renderer or a legend glyph's own small <svg>).
export function renderMarkerShape(
  shape: MarkerShapeName,
  { cx, cy, size, color }: ShapeGeometryProps,
): React.JSX.Element {
  switch (shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={size} fill={color} />;
    case "square":
      return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} fill={color} />;
    case "triangle":
      return <polygon points={trianglePoints(cx, cy, size)} fill={color} />;
    case "diamond":
      return <polygon points={diamondPoints(cx, cy, size)} fill={color} />;
    case "triangle-down":
      return <polygon points={triangleDownPoints(cx, cy, size)} fill={color} />;
    case "diamond-hollow":
      return (
        <polygon
          points={diamondPoints(cx, cy, size)}
          fill="none"
          stroke={color}
          strokeWidth={hollowStrokeWidth(size)}
        />
      );
    case "triangle-hollow":
      return (
        <polygon
          points={trianglePoints(cx, cy, size)}
          fill="none"
          stroke={color}
          strokeWidth={hollowStrokeWidth(size)}
        />
      );
    case "triangle-down-hollow":
      return (
        <polygon
          points={triangleDownPoints(cx, cy, size)}
          fill="none"
          stroke={color}
          strokeWidth={hollowStrokeWidth(size)}
        />
      );
    case "circle-hollow":
      return (
        <circle
          cx={cx}
          cy={cy}
          r={size}
          fill="none"
          stroke={color}
          strokeWidth={hollowStrokeWidth(size)}
        />
      );
    case "square-hollow":
      return (
        <rect
          x={cx - size}
          y={cy - size}
          width={size * 2}
          height={size * 2}
          fill="none"
          stroke={color}
          strokeWidth={hollowStrokeWidth(size)}
        />
      );
  }
}
