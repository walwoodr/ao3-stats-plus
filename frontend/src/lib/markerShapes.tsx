import type { MarkerShapeName } from "./seriesStyles";

// Pure SVG-path renderers for the 10 marker shapes (docs/plans/usds-
// dataviz-color-scheme.md's slot table - 6 original filled shapes plus 4
// new ones: triangle-down, cross, circle-hollow, square-hollow) - used
// identically by MultiSeriesTrendChart's custom line dots (embedded
// directly in Recharts' own <svg> canvas, so they render bare primitives,
// not a wrapping <svg>) and by ComparisonLegend's small standalone glyphs
// (wrapped in their own <svg viewBox>) - kept in one place so the two never
// drift apart.
interface ShapeGeometryProps {
  cx: number;
  cy: number;
  size: number;
  color: string;
}

function starPoints(cx: number, cy: number, outerRadius: number, innerRadius: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    // Alternate outer/inner radius every point, starting straight up
    // (-90deg) so the star reads the same way a typical star glyph does.
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return points.join(" ");
}

// Hollow markers (circle-hollow, square-hollow) draw only an outline, so
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
      return (
        <polygon
          points={`${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`}
          fill={color}
        />
      );
    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
          fill={color}
        />
      );
    case "plus": {
      const armWidth = size * 0.6;
      return (
        <g>
          <rect
            x={cx - armWidth / 2}
            y={cy - size}
            width={armWidth}
            height={size * 2}
            fill={color}
          />
          <rect
            x={cx - size}
            y={cy - armWidth / 2}
            width={size * 2}
            height={armWidth}
            fill={color}
          />
        </g>
      );
    }
    case "star":
      return <polygon points={starPoints(cx, cy, size, size * 0.4)} fill={color} />;
    case "triangle-down":
      return (
        <polygon
          points={`${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`}
          fill={color}
        />
      );
    case "cross": {
      // Plus rotated 45deg: two diagonal rects through the center, drawn as
      // rotated <g>s of the same "arm" rect used by "plus" so the geometry
      // stays genuinely distinct (not a copy) while reusing the same visual
      // weight.
      const armWidth = size * 0.6;
      return (
        <g transform={`rotate(45 ${cx} ${cy})`}>
          <rect
            x={cx - armWidth / 2}
            y={cy - size}
            width={armWidth}
            height={size * 2}
            fill={color}
          />
          <rect
            x={cx - size}
            y={cy - armWidth / 2}
            width={size * 2}
            height={armWidth}
            fill={color}
          />
        </g>
      );
    }
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

export interface MarkerGlyphProps {
  shape: MarkerShapeName;
  color: string;
  size?: number;
}

// A small standalone icon version of a marker shape, for use in
// ComparisonLegend - `aria-hidden` since the legend's real accessible name
// is the worded style description text next to it, not the glyph itself.
export function MarkerGlyph({ shape, color, size = 5 }: MarkerGlyphProps) {
  const viewport = size * 2 + 2;
  const center = viewport / 2;
  return (
    <svg
      width={viewport}
      height={viewport}
      viewBox={`0 0 ${viewport} ${viewport}`}
      aria-hidden="true"
      className="inline-block shrink-0"
    >
      {renderMarkerShape(shape, { cx: center, cy: center, size, color })}
    </svg>
  );
}
