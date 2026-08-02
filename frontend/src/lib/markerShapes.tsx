import type { MarkerShapeName } from "./seriesStyles";

// Pure SVG-path renderers for the six marker shapes (Q3's shape channel) -
// used identically by MultiSeriesTrendChart's custom line dots (embedded
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
