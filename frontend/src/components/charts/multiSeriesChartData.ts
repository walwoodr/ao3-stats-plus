import { leadInEpoch, toEpoch } from "../../lib/chartTimeAxis";
import type { TrendPoint } from "./TrendChart";

// Extraction task (chart-table-polish-batch.md §4.1's own file-length risk
// flag: "MultiSeriesTrendChart.tsx is already at 478 of its 500-line .tsx
// budget"): buildChartData and its supporting types/helpers are pulled out
// of MultiSeriesTrendChart.tsx into this standalone, React-free module, the
// same way multiSeriesDots.tsx already extracted the dot renderers - no
// behavior change. MultiSeriesTrendChart.tsx re-exports everything here so
// existing external imports (WorkComparisonSection.tsx, this batch's own
// test files) keep working unchanged.

// Per-work zero-basis dates (docs/plans/per-work-zero-basis-dates.md):
// value is always 0, so only the synthetic date and an accessible label are
// carried - WorkComparisonSection computes both (own publishedOn, or the
// earliestPostYear fallback) and gates presence entirely; this component
// just renders whatever leadIn it's handed.
export interface SeriesLeadIn {
  capturedOn: string;
  label: string;
  // Maintenance item 3 (post-ship bug batch, 2026-09-23): true only for a
  // work's own accurate publish-date lead-in. Optional/chart-side-unused -
  // it only changes syncedTableModel.ts's buildMultiSeriesTableModel table
  // rendering (column header wording, "Published (N)" cell placeholder);
  // this chart component's own buildChartData/tick-label rendering is
  // unaffected and keeps reading `label` as before.
  isPublishDate?: boolean;
}

export interface SeriesDatum {
  workId: number;
  title: string;
  styleIndex: number;
  points: TrendPoint[];
  leadIn?: SeriesLeadIn;
}

export type ChartRow = { capturedOn: string; xEpoch: number } & Record<
  string,
  string | number | null
>;

export interface BuildChartDataResult {
  rows: ChartRow[];
  // capturedOn -> label, for slots that are some work's zero-basis and are
  // NOT any work's real capture date (a fallback slot that coincides with
  // another work's real capture prefers the raw ISO date instead - see the
  // plan's corner cases).
  zeroBasisLabels: Map<string, string>;
}

export function workKey(workId: number): string {
  return `work-${workId}`;
}

export function leadKey(workId: number): string {
  return `lead-${workId}`;
}

// The chart's shared date axis is the UNION of every selected work's
// capturedOn dates AND every selected work's injected zero-basis (leadIn)
// date - a work with no point at a given date contributes null (a chart
// gap, connectNulls={false}) rather than a fabricated zero, per the plan's
// "MultiSeriesTrendChart internals" section. Exported (mirroring
// comparisonSelection.ts's convention of exporting pure helpers) so it's
// directly unit-testable.
export function buildChartData(series: SeriesDatum[]): BuildChartDataResult {
  const realDates = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => realDates.add(p.capturedOn)));

  const unionDates = new Set(realDates);
  series.forEach((s) => {
    if (s.leadIn) unionDates.add(s.leadIn.capturedOn);
  });
  const sortedDates = [...unionDates].sort();

  // Only a slot that's exclusively a zero-basis anchor (never a real
  // capture date for ANY selected work) gets the word-label treatment - a
  // shared slot that happens to double as another work's real point keeps
  // the precise ISO date instead.
  const zeroBasisLabels = new Map<string, string>();
  // Item 4 point 2's two lead-in placement paths (§3 item 4): tracked per
  // zero-basis-only date, alongside zeroBasisLabels above, so buildChartData
  // knows which xEpoch path to use for that slot below.
  const isPublishDateAt = new Map<string, boolean>();
  series.forEach((s) => {
    if (s.leadIn && !realDates.has(s.leadIn.capturedOn)) {
      zeroBasisLabels.set(s.leadIn.capturedOn, s.leadIn.label);
      isPublishDateAt.set(s.leadIn.capturedOn, Boolean(s.leadIn.isPublishDate));
    }
  });

  // The bounded synthetic offset (chartTimeAxis.leadInEpoch) for an
  // ESTIMATED-BASELINE lead-in slot is computed once, relative to the
  // chart's OVERALL real-capture cadence (every selected work's real
  // points combined) - not any single work's own cadence - since the
  // shared x-axis spans every series together.
  const sortedRealEpochs = [...realDates].map(toEpoch).sort((a, b) => a - b);
  const firstRealEpoch: number | undefined = sortedRealEpochs[0];

  // Multiple DIFFERENT works can each carry their own distinct
  // estimated-baseline dateKey (e.g. "Before 2018" vs "Before 2020" -
  // different fallback years, so different literal capturedOn/dateKey
  // slots, NOT collapsed by the union-dates Set above). A naive
  // leadInEpoch(firstRealEpoch, ...) call ignores which slot it's for, so
  // every one of them would land on the IDENTICAL computed epoch -
  // visually overlapping dots and duplicate React keys (a real rendering
  // bug, not just cosmetic). Each distinct estimated-baseline dateKey
  // instead gets its own step further back, ordered so the one closest to
  // the real data (latest literal date) sits nearest firstRealEpoch and
  // earlier ones stack progressively further behind it - preserving their
  // relative chronological order while staying a bounded, clustered
  // synthetic offset (never real calendar-distance apart).
  const estimatedBaselineEpochAt = new Map<string, number>();
  if (firstRealEpoch !== undefined) {
    const nearestOffset = leadInEpoch(firstRealEpoch, { realEpochs: sortedRealEpochs });
    const stepMs = firstRealEpoch - nearestOffset;
    const distinctEstimatedBaselineDateKeys = [...zeroBasisLabels.keys()]
      .filter((dateKey) => !isPublishDateAt.get(dateKey))
      .sort()
      .reverse(); // latest (closest to real data) first.
    distinctEstimatedBaselineDateKeys.forEach((dateKey, index) => {
      estimatedBaselineEpochAt.set(dateKey, nearestOffset - index * stepMs);
    });
  }

  function xEpochFor(capturedOn: string): number {
    if (realDates.has(capturedOn)) return toEpoch(capturedOn);
    // A PUBLISH-DATE lead-in is a real date (the work really was published
    // then) - placed at its own true epoch, never a bounded offset.
    if (isPublishDateAt.get(capturedOn)) return toEpoch(capturedOn);
    // The account-level ESTIMATED-BASELINE lead-in: bounded offset before
    // the chart's first real point. Degenerate fallback (no real points at
    // all, so there's nothing to be "before") uses the literal epoch - not
    // exercised by any current caller, but keeps this total.
    return estimatedBaselineEpochAt.get(capturedOn) ?? toEpoch(capturedOn);
  }

  const rows: ChartRow[] = sortedDates.map((capturedOn) => {
    const row: ChartRow = { capturedOn, xEpoch: xEpochFor(capturedOn) };
    series.forEach((s) => {
      const point = s.points.find((p) => p.capturedOn === capturedOn);
      row[workKey(s.workId)] = point ? point.value : null;

      if (!s.leadIn) return;
      // A lead-* key is only ever set within THIS work's own axis (its
      // leadIn slot plus its own real point slots) - a slot that belongs
      // only to some other work leaves the key entirely absent, so it
      // never masquerades as "this work has data here" for anyone reading
      // the row directly (see buildChartData.test.ts's "never carries a
      // value on another work's slot" case).
      const ownDates = new Set([s.leadIn.capturedOn, ...s.points.map((p) => p.capturedOn)]);
      if (!ownDates.has(capturedOn)) return;

      const key = leadKey(s.workId);
      if (capturedOn === s.leadIn.capturedOn) {
        row[key] = 0;
      } else if (s.points[0] && capturedOn === s.points[0].capturedOn) {
        // Closes the dashed segment: the lead line's only other non-null
        // value is the first real point's own value, so exactly one
        // segment draws between the two (the same two-non-null-points
        // trick TrendChart's aggregate lead-in uses).
        row[key] = s.points[0].value;
      } else {
        row[key] = null;
      }
    });
    return row;
  });

  return { rows, zeroBasisLabels };
}

// A series' value at a given row, for the table->chart overlay: its own
// real point if present, else its own leadIn's fixed 0 fallback, else null
// (this series has no data at this date - the overlay must skip it, plan
// §6's sparse-cell rule).
export function seriesValueAt(row: ChartRow, workId: number): number | null {
  const mainValue = row[workKey(workId)];
  if (typeof mainValue === "number") return mainValue;
  const leadValue = row[leadKey(workId)];
  if (typeof leadValue === "number") return leadValue;
  return null;
}
