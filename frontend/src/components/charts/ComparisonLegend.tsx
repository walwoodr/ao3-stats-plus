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

// Visible legend mapping each work's title to its (shape, color) glyph.
// The worded style description ("slate-blue circle marker") that used to sit
// next to the title here was removed per direct user instruction (2026-08-09
// TECH_DEBT.md entry) - it read as clutter once a work is already identified
// by its title. The (shape, color) identity itself is NOT lost for
// screen-reader users: it's still spelled out in words in
// MultiSeriesTrendChart's sr-only accessible data table (each column
// header), which was already the "accessible data table" MASTER.md's Multi-
// Series Comparison Charts section refers to - that surface now carries the
// wording instead of duplicating it here. Each entry's title lives in its
// own <span> (its only direct text-node child) so it's uniquely findable by
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
            <span>{entry.title}</span>
          </li>
        );
      })}
    </ul>
  );
}
