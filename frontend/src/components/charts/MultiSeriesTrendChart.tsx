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
  selectDisplayedTicks,
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
import {
  buildChartData,
  seriesValueAt,
  workKey,
  leadKey,
  type ChartRow,
  type SeriesDatum,
} from "./multiSeriesChartData";

// buildChartData/SeriesDatum/SeriesLeadIn/etc. now live in
// multiSeriesChartData.ts (a file-length extraction, see that file's own
// top-of-file comment) - re-exported here so every existing external
// import of them from this module (WorkComparisonSection.tsx, this batch's
// own test files) keeps working unchanged.
export { buildChartData };
export type {
  SeriesLeadIn,
  SeriesDatum,
  ChartRow,
  BuildChartDataResult,
} from "./multiSeriesChartData";

export interface MultiSeriesTrendChartProps {
  title: string;
  valueLabel: string;
  series: SeriesDatum[];
  // D-A: forwarded to SyncedDataTable - the By-Work Bookmarks call site
  // (up to 10 stacked charts) passes false so those tables default closed.
  defaultOpen?: boolean;
  // Chart-table-polish-batch item 4, OD-2a = Option B (docs/plans/chart-
  // table-polish-batch.md §4 item 4): the selected date-range window's
  // START, as an epoch - becomes the XAxis domain's LEFT bound when
  // present, clipping a baseline earlier than the window off the left edge
  // (its dot/axis-tick don't render; the in-window portion of its dashed
  // line still does). The RIGHT bound always stays the existing
  // data-derived maximum. Absent (the aggregate TrendChart/RatioChart have
  // no window, and WorkComparisonSection omits it when the window can't be
  // formed) falls back to today's `[Math.min(...xEpoch), Math.max(...xEpoch)]`
  // framing, unchanged.
  windowStartEpoch?: number;
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
  windowStartEpoch,
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
  // Item 4/OD-2a (Option B): windowStartEpoch, when present, becomes the
  // LEFT domain bound instead of the data-derived minimum - see this
  // component's own windowStartEpoch prop doc above.
  const domainMin = windowStartEpoch ?? Math.min(...chartData.map((row) => row.xEpoch));
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
                  // EXTERNAL-UNVERIFIED-turned-VERIFIED (see
                  // MultiSeriesTrendChart.windowClipping.test.tsx's header
                  // comment): recharts@3.10.0 silently auto-expands an
                  // explicit numeric domain back to fit every data point
                  // unless allowDataOverflow is set - without this, a
                  // windowStartEpoch narrower than the data's own minimum
                  // would be a silent no-op (the plan's own prose
                  // undersells this; confirmed directly against the
                  // installed package, not just inferred from docs).
                  // Points left of the domain are NOT removed from the DOM
                  // even with this set - they're only clipped visually via
                  // an SVG clipPath - which is what makes the baseline's
                  // dashed line still draw its in-window segment while its
                  // own dot/axis-tick fall outside the visible clip.
                  allowDataOverflow
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
