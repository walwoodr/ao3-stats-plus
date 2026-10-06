import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { MouseHandlerDataParam } from "recharts";
import { useChartColors } from "../../lib/useChartColors";
import { formatNumber } from "../../lib/formatNumber";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";
import { buildMultiSeriesTableModel } from "../../lib/syncedTableModel";
import {
  computeYDomain,
  DAY_TICK_SUPPRESSION_THRESHOLD,
  estimateYAxisWidth,
  formatDayTick,
  leadInEpoch,
  selectDisplayedTicks,
  toEpoch,
} from "../../lib/chartTimeAxis";
import { elapsedLabel as computeElapsedLabel } from "../../lib/pointComparison";
import type { Orientation } from "../../lib/tableOrientation";
import { ComparisonLegend } from "./ComparisonLegend";
import { SyncedDataTable } from "./SyncedDataTable";
import { ChartDisclosure } from "./ChartDisclosure";
import { PinnedComparisonBar } from "./PinnedComparisonBar";
import { ActivePointOverlay, type ActivePoint } from "./ActivePointOverlay";
import { DateGroupingOverlay } from "./DateGroupingOverlay";
import { createLeadInXAxisTick } from "./LeadInXAxisTick";
import { createLeadInDot, createSeriesDot } from "./multiSeriesDots";
import {
  CHART_CONTAINER_HEIGHT,
  DAY_TICK_MARGIN,
  X_AXIS_BAND_HEIGHT,
} from "./dateGroupingChartLayout";
import type { TrendPoint } from "./TrendChart";

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

export interface MultiSeriesTrendChartProps {
  title: string;
  valueLabel: string;
  series: SeriesDatum[];
  // D-A: forwarded to SyncedDataTable - the By-Work Bookmarks call site
  // (up to 10 stacked charts) passes false so those tables default closed.
  defaultOpen?: boolean;
}

type ChartRow = { capturedOn: string; xEpoch: number } & Record<string, string | number | null>;

export interface BuildChartDataResult {
  rows: ChartRow[];
  // capturedOn -> label, for slots that are some work's zero-basis and are
  // NOT any work's real capture date (a fallback slot that coincides with
  // another work's real capture prefers the raw ISO date instead - see the
  // plan's corner cases).
  zeroBasisLabels: Map<string, string>;
}

function workKey(workId: number): string {
  return `work-${workId}`;
}

function leadKey(workId: number): string {
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
function seriesValueAt(row: ChartRow, workId: number): number | null {
  const mainValue = row[workKey(workId)];
  if (typeof mainValue === "number") return mainValue;
  const leadValue = row[leadKey(workId)];
  if (typeof leadValue === "number") return leadValue;
  return null;
}

// The N-series sibling of TrendChart (which stays single/lead-series only -
// see the plan's "New vs. extended" section). Reuses the same accessibility
// skeleton (figure role=img, aria-hidden Recharts block, visible transposed
// SyncedDataTable sibling) plus a visible legend mapping each work's title
// to its (shape, color) glyph - per docs/plans/usds-dataviz-color-scheme.md,
// shape alone is now the guaranteed non-color channel (dash was dropped as
// a per-series differentiator; series lines are solid) and color is
// redundant reinforcement only, never the sole differentiator. The worded
// style description ("slate-blue circle marker") was removed from the
// VISIBLE legend per direct user instruction (2026-08-09 TECH_DEBT.md), but
// stays available to screen-reader users via each row of the visible
// SyncedDataTable (its identityDescription, D5) - the accessible surface
// MASTER.md's Multi-Series Comparison Charts section documents as carrying
// this mapping. See TrendChart's top-of-file comment for the full
// chart<->table sync rationale (docs/plans/chart-synced-data-table.md).
export function MultiSeriesTrendChart({
  title,
  valueLabel,
  series,
  defaultOpen,
}: MultiSeriesTrendChartProps) {
  const headingId = useId();
  const colors = useChartColors();
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const [pinnedDateKey, setPinnedDateKey] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation>("datesAsColumns");

  if (series.length === 0) {
    return (
      <div className="w-full rounded-lg border border-ink/12 bg-card p-6 transition-colors duration-200 hover:border-ink/24">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        <p className="mt-4 text-sm text-ink-soft">Select at least one work to compare.</p>
      </div>
    );
  }

  const { rows: chartData, zeroBasisLabels } = buildChartData(series);

  function isLeadInTick(xEpoch: number): boolean {
    const row = chartData.find((r) => r.xEpoch === xEpoch);
    return row ? zeroBasisLabels.has(row.capturedOn) : false;
  }

  // Only a real capture date's tick gets text at all - a zero-basis-only
  // slot renders nothing (see LeadInXAxisTick.tsx), so this never needs to
  // consult zeroBasisLabels for its own rendering. D1: bare day-of-month,
  // not the full ISO date - month/year context now lives in
  // DateGroupingOverlay's own span/rule labels. Item 5 (chart-table-polish-
  // batch.md §4 item 5): pointCount here is the count of distinct REAL
  // capture dates in the union (every chartData row minus the zero-basis-
  // only slots), not any single series' own count - above
  // DAY_TICK_SUPPRESSION_THRESHOLD of those, every day-number tick is
  // suppressed too.
  const pointCount = chartData.length - zeroBasisLabels.size;
  const tickFormatter = (xEpoch: number): string =>
    pointCount > DAY_TICK_SUPPRESSION_THRESHOLD ? "" : formatDayTick(xEpoch);

  // Passed to <XAxis tickFormatter>, NOT to the custom tick renderer's own
  // `tickFormatter` above - see LeadInXAxisTick.tsx's top-of-file comment
  // for why this must return "" for every zero-basis-only slot (a lead-in
  // may not sit at the domain's leftmost position here, unlike TrendChart/
  // RatioChart's single lead-in - a chart comparing several works can have
  // multiple distinct estimated-baseline dates, see buildChartData's
  // distinctEstimatedBaselineDateKeys handling - so every one of them, not
  // just "the leftmost tick," must be zeroed out here).
  const axisTickFormatter = (xEpoch: number): string =>
    isLeadInTick(xEpoch) ? "" : tickFormatter(xEpoch);
  const domainMin = Math.min(...chartData.map((row) => row.xEpoch));
  // Curated once here (not inline in the JSX below) so the interval={0}
  // comment next to <XAxis ticks=...> can stay short - see
  // chartTimeAxis.ts's selectDisplayedTicks for the full rationale.
  const displayedTicks = selectDisplayedTicks(
    chartData.map((row) => ({ xEpoch: row.xEpoch, isLeadIn: isLeadInTick(row.xEpoch) })),
  );

  // Chart -> table sync (§2.3): item 4 switches the XAxis from categorical
  // capturedOn to numeric xEpoch, so state.activeLabel is now that epoch -
  // resolve it via chartData, mirroring TrendChart/RatioChart's path.
  function resolveDateKey(state: MouseHandlerDataParam): string | null {
    const activeLabel = state.activeLabel;
    if (activeLabel == null) return null;
    const row = chartData.find((r) => r.xEpoch === activeLabel);
    return row ? row.capturedOn : null;
  }

  function togglePinnedDateKey(dateKey: string | null) {
    if (dateKey === null) {
      setPinnedDateKey(null);
      return;
    }
    setPinnedDateKey((previous) => (previous === dateKey ? null : dateKey));
  }

  // Table -> chart sync (§2.3): every series with a resolvable value at the
  // active date gets a ring (plan §6's sparse-cell skip rule).
  function rowFor(dateKey: string | null): ChartRow | undefined {
    return dateKey ? chartData.find((r) => r.capturedOn === dateKey) : undefined;
  }
  const activeRow = rowFor(activeDateKey);
  const activePoints: ActivePoint[] = activeRow
    ? series
        .map((s): ActivePoint | null => {
          const value = seriesValueAt(activeRow, s.workId);
          return value == null ? null : { x: activeRow.xEpoch, y: value };
        })
        .filter((point): point is ActivePoint => point != null)
    : [];
  const pinnedRow = rowFor(pinnedDateKey);
  const pinnedPoints: ActivePoint[] = pinnedRow
    ? series
        .map((s): ActivePoint | null => {
          const value = seriesValueAt(pinnedRow, s.workId);
          return value == null ? null : { x: pinnedRow.xEpoch, y: value };
        })
        .filter((point): point is ActivePoint => point != null)
    : [];

  const tableModel = buildMultiSeriesTableModel({
    valueLabel,
    series,
    seriesColors: colors.series,
  });

  // Item 1/D1's padded y-domain: values across every series, INCLUDING each
  // lead-in's literal 0 when present (D1, chartTimeAxis.test.ts).
  const yValues: number[] = [];
  series.forEach((s) => {
    s.points.forEach((point) => yValues.push(point.value));
    if (s.leadIn) yValues.push(0);
  });
  const { domain: yDomain, broken: brokenYAxis } = computeYDomain(yValues, {
    hasLeadIn: series.some((s) => Boolean(s.leadIn)),
  });

  const pinnedLabel = pinnedRow
    ? (zeroBasisLabels.get(pinnedRow.capturedOn) ?? pinnedRow.capturedOn)
    : null;
  const activeRowForElapsed =
    activeRow && activeRow.capturedOn !== pinnedRow?.capturedOn ? activeRow : undefined;
  const elapsedLabelText =
    pinnedRow && activeRowForElapsed
      ? computeElapsedLabel(pinnedRow.xEpoch, activeRowForElapsed.xEpoch)
      : null;

  return (
    <div className="w-full rounded-lg border border-ink/12 bg-card p-6 transition-colors duration-200 hover:border-ink/24">
      <h3 id={headingId} className="font-display text-base font-semibold text-ink">
        {title}
      </h3>

      <ChartDisclosure>
        <figure role="img" aria-labelledby={headingId}>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={CHART_CONTAINER_HEIGHT}>
              <LineChart
                data={chartData}
                accessibilityLayer={false}
                onMouseMove={(state) => setActiveDateKey(resolveDateKey(state))}
                onMouseLeave={() => setActiveDateKey(null)}
                onClick={(state) => {
                  const dateKey = resolveDateKey(state);
                  if (dateKey) togglePinnedDateKey(dateKey);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={colors.inkSoft} strokeOpacity={0.2} />
                <XAxis
                  dataKey="xEpoch"
                  type="number"
                  scale="time"
                  domain={[domainMin, Math.max(...chartData.map((row) => row.xEpoch))]}
                  ticks={displayedTicks}
                  // interval={0}: bypasses Recharts' own tick filtering
                  // entirely - see chartTimeAxis.ts's selectDisplayedTicks.
                  // height/tickMargin bumped (dateGroupingChartLayout) to
                  // reserve the month/year band - the plot rect itself is
                  // unchanged.
                  interval={0}
                  height={X_AXIS_BAND_HEIGHT}
                  tickMargin={DAY_TICK_MARGIN}
                  tickFormatter={axisTickFormatter}
                  tick={createLeadInXAxisTick({
                    fill: colors.inkSoft,
                    formatTick: tickFormatter,
                    isLeadInTick,
                  })}
                />
                <YAxis
                  domain={yDomain}
                  width={estimateYAxisWidth(yDomain[1])}
                  tickFormatter={formatNumber}
                  tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                {series.map((s) => {
                  const slot = SERIES_STYLE_SLOTS[s.styleIndex];
                  const color = colors.series[s.styleIndex];
                  const key = workKey(s.workId);
                  return (
                    <Line
                      key={s.workId}
                      type="linear"
                      dataKey={key}
                      name={s.title}
                      connectNulls={false}
                      isAnimationActive={false}
                      activeDot={false}
                      stroke={color}
                      strokeWidth={2}
                      dot={createSeriesDot({ dataKey: key, shape: slot.shape, color })}
                    />
                  );
                })}
                {series.map((s) => {
                  if (!s.leadIn) return null;
                  const key = leadKey(s.workId);
                  return (
                    <Line
                      key={key}
                      type="linear"
                      dataKey={key}
                      name={`${s.title} (before first capture)`}
                      connectNulls
                      isAnimationActive={false}
                      activeDot={false}
                      strokeDasharray="4 4"
                      stroke={colors.inkSoft}
                      strokeWidth={1.5}
                      dot={createLeadInDot({
                        dataKey: key,
                        leadInCapturedOn: s.leadIn.capturedOn,
                        color: colors.inkSoft,
                      })}
                    />
                  );
                })}
                {/* Rendered BEFORE ActivePointOverlay (plan §5.4) - see
                    TrendChart's identical comment. */}
                <DateGroupingOverlay rows={chartData} />
                <ActivePointOverlay
                  activePoints={activePoints}
                  pinnedPoints={pinnedPoints}
                  brokenYAxis={brokenYAxis}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </ChartDisclosure>

      <ComparisonLegend entries={series} seriesColors={colors.series} />

      {pinnedLabel && (
        <PinnedComparisonBar
          pinnedLabel={pinnedLabel}
          elapsedLabel={elapsedLabelText}
          onClear={() => setPinnedDateKey(null)}
        />
      )}

      <SyncedDataTable
        title={title}
        rowHeaderLabel="Work"
        model={tableModel}
        activeDateKey={activeDateKey}
        onActiveDateKeyChange={setActiveDateKey}
        defaultOpen={defaultOpen}
        orientation={orientation}
        onOrientationChange={setOrientation}
        pinnedDateKey={pinnedDateKey}
        onPinnedDateKeyChange={togglePinnedDateKey}
      />
    </div>
  );
}
