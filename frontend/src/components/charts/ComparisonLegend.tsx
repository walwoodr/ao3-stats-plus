import { MarkerGlyph } from "../../lib/markerShapes";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";

export interface ComparisonLegendEntry {
  workId: number;
  title: string;
  styleIndex: number;
}

export interface ComparisonLegendProps {
  entries: ComparisonLegendEntry[];
  seriesColors: readonly string[];
}

// Visible legend mapping each work's title to its (shape, dash, color)
// glyph AND a worded style description ("solid wine line, circle marker") -
// per decision A, shape+dash is the accessibility-guaranteed non-color
// channel, so the legend spells it out in words rather than relying on
// sighted-only glyph recognition. Each entry's text lives in its own <span>
// (its only direct text-node child) so it's uniquely findable by
// screen.getByText without also matching the wrapping <li>.
export function ComparisonLegend({ entries, seriesColors }: ComparisonLegendProps) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
      {entries.map((entry) => {
        const slot = SERIES_STYLE_SLOTS[entry.styleIndex];
        const color = seriesColors[entry.styleIndex];
        return (
          <li key={entry.workId} className="flex items-center gap-2 text-sm text-ink-soft">
            <MarkerGlyph shape={slot.shape} color={color} />
            <span>
              {entry.title} — {slot.dashLabel} {slot.colorRole} line, {slot.shape} marker
            </span>
          </li>
        );
      })}
    </ul>
  );
}
