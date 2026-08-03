import { useState } from "react";
import type { PerWorkSeries } from "../queries/useStatsForUser";
import {
  clampWindow,
  filterPointsInWindow,
  shouldShowRangeSlider,
  unionCapturedOnDates,
  type YearWindow,
} from "../lib/comparisonSelection";
import { assignStyleSlot, releaseStyleSlot } from "../lib/seriesStyles";
import { WorkPicker } from "./WorkPicker";
import { DateRangeSlider } from "./DateRangeSlider";
import { MultiSeriesTrendChart, type SeriesDatum } from "./charts/MultiSeriesTrendChart";

export interface WorkComparisonSectionProps {
  perWorkSeries: PerWorkSeries[];
  earliestPostYear: number | null;
}

function yearOf(capturedOn: string): number {
  return Number(capturedOn.slice(0, 4));
}

// REPLACES PerWorkTrends (Q1: replace, not coexist). Owns the two pieces of
// ephemeral, view-local UI state the plan's "State management" section
// calls for - `selectedWorkIds` (order = add order, drives the stable style
// assignment) and `range` (null = full range / slider hidden) - as plain
// useState, not Zustand. Composes WorkPicker + DateRangeSlider + two
// MultiSeriesTrendChart instances (hits, kudos) over the same derived
// selection.
export function WorkComparisonSection({
  perWorkSeries,
  earliestPostYear,
}: WorkComparisonSectionProps) {
  const [selectedWorkIds, setSelectedWorkIds] = useState<number[]>(() =>
    perWorkSeries[0] ? [perWorkSeries[0].ao3WorkId] : [],
  );
  const [styleAssignment, setStyleAssignment] = useState<Map<number, number>>(() =>
    perWorkSeries[0] ? assignStyleSlot(new Map(), perWorkSeries[0].ao3WorkId) : new Map(),
  );
  const [range, setRange] = useState<YearWindow | null>(null);

  if (perWorkSeries.length === 0) return null;

  // Diffs the new selection against the current style-assignment map so
  // each work's (shape, dash, color) triple stays stable across other
  // works being toggled - the lowest-free-index-on-add / release-on-remove
  // contract lives in seriesStyles.ts; this just keeps the map in sync with
  // whatever WorkPicker reports as the new selection.
  function handleSelectionChange(nextSelectedWorkIds: number[]) {
    setSelectedWorkIds(nextSelectedWorkIds);
    setStyleAssignment((previous) => {
      let next = previous;
      for (const workId of previous.keys()) {
        if (!nextSelectedWorkIds.includes(workId)) next = releaseStyleSlot(next, workId);
      }
      for (const workId of nextSelectedWorkIds) {
        if (!next.has(workId)) next = assignStyleSlot(next, workId);
      }
      return next;
    });
  }

  // Selection order (not perWorkSeries order) drives both the legend/table
  // column order and the style assignment lookup above.
  const orderedSelectedWorks = selectedWorkIds
    .map((workId) => perWorkSeries.find((work) => work.ao3WorkId === workId))
    .filter((work): work is PerWorkSeries => work !== undefined);

  const unionDates = unionCapturedOnDates(orderedSelectedWorks);
  const showSlider = shouldShowRangeSlider(unionDates);

  // Q5's boundary-crossing corner case: once the selection drops back to
  // <= 2 union points, the slider unmounts (DateRangeSlider's own gate) AND
  // the window resets to full - no stale filter left applied invisibly.
  if (!showSlider && range !== null) {
    setRange(null);
  }

  const currentYear = new Date().getFullYear();
  const earliestUnionYear = unionDates.length > 0 ? yearOf(unionDates[0]) : currentYear;
  const domainStart = Math.min(earliestPostYear ?? earliestUnionYear, currentYear);
  const domain: YearWindow = { start: domainStart, end: currentYear };

  // Range state invariants (plan's Error states): re-clamp `range` against
  // the *live* `domain` at derivation time, not just against the
  // then-current domain back when `handleRangeChange` set it. A selection
  // change can shift the domain (e.g. swapping to a work with a disjoint
  // date range) while staying above the >2 gate, so the gate-drop reset
  // below never fires for it - `range` alone can't be trusted raw here. If
  // the stored window no longer overlaps the domain at all, treat it as
  // fully stale and fall back to the full domain rather than collapsing it
  // to a degenerate single-point clamp; otherwise preserve the overlapping
  // portion of the user's chosen window.
  const effectiveRange: YearWindow | null =
    range === null || range.end < domain.start || range.start > domain.end
      ? null
      : clampWindow(range, domain);

  const sliderValue: [number, number] = effectiveRange
    ? [effectiveRange.start, effectiveRange.end]
    : [domain.start, domain.end];

  function handleRangeChange(nextValue: [number, number]) {
    setRange(clampWindow({ start: nextValue[0], end: nextValue[1] }, domain));
  }

  function buildSeries(metric: "hits" | "kudos"): SeriesDatum[] {
    return orderedSelectedWorks.map((work) => {
      const points = effectiveRange
        ? filterPointsInWindow(work.points, effectiveRange)
        : work.points;
      return {
        workId: work.ao3WorkId,
        title: work.title,
        styleIndex: styleAssignment.get(work.ao3WorkId) ?? 0,
        points: points.map((point) => ({ capturedOn: point.capturedOn, value: point[metric] })),
      };
    });
  }

  const summaryMessage =
    selectedWorkIds.length > 0
      ? `Comparing ${selectedWorkIds.length} work${selectedWorkIds.length === 1 ? "" : "s"}, ` +
        `${yearOf(unionDates[0] ?? `${currentYear}-01-01`)} to ` +
        `${yearOf(unionDates[unionDates.length - 1] ?? `${currentYear}-01-01`)}.`
      : "";

  return (
    <div className="mt-10 flex flex-col gap-6">
      <h2 className="font-display text-xl font-semibold text-ink">Compare works</h2>

      <WorkPicker
        perWorkSeries={perWorkSeries}
        selectedWorkIds={selectedWorkIds}
        onChange={handleSelectionChange}
        extraStatusMessage={summaryMessage}
      />

      <DateRangeSlider
        min={domain.start}
        max={domain.end}
        value={sliderValue}
        onChange={handleRangeChange}
        unionPointCount={unionDates.length}
      />

      <div className="flex flex-col gap-8">
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={buildSeries("hits")} />
        <MultiSeriesTrendChart title="Kudos" valueLabel="Kudos" series={buildSeries("kudos")} />
      </div>
    </div>
  );
}
