import type { MarkerShapeName } from "./seriesStyles";
import { renderMarkerShape } from "./markerPaths";

export interface MarkerGlyphProps {
  shape: MarkerShapeName;
  color: string;
  size?: number;
}

// A small standalone icon version of a marker shape, for use in
// ComparisonLegend - `aria-hidden` since the legend's real accessible name
// is the worded style description text next to it, not the glyph itself.
// The shape-rendering geometry itself lives in markerPaths.ts (TECH_DEBT.md,
// 2026-08-03) so this file exports only this one component, clearing the
// `react-refresh/only-export-components` warning colocating it with the
// non-component `renderMarkerShape` helper used to trip.
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
