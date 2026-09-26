import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { MouseHandlerDataParam } from "recharts";
import { useChartColors } from "../../lib/useChartColors";
import { formatNumber } from "../../lib/formatNumber";
import { buildTrendTableModel } from "../../lib/syncedTableModel";
import {
  computeYDomain,
  estimateYAxisWidth,
  formatDayTick,
  leadInEpoch,
  selectDisplayedTicks,
  toEpoch,
} from "../../lib/chartTimeAxis";
import { elapsedLabel as computeElapsedLabel } from "../../lib/pointComparison";
import type { Orientation } from "../../lib/tableOrientation";
import { SyncedDataTable } from "./SyncedDataTable";
import { ChartDisclosure } from "./ChartDisclosure";
import { PinnedComparisonBar } from "./PinnedComparisonBar";
import { ActivePointOverlay, type ActivePoint } from "./ActivePointOverlay";
import { DateGroupingOverlay } from "./DateGroupingOverlay";
import { createLeadInXAxisTick } from "./LeadInXAxisTick";
import {
  CHART_CONTAINER_HEIGHT,
  DAY_TICK_MARGIN,
  X_AXIS_BAND_HEIGHT,
} from "./dateGroupingChartLayout";

export interface TrendPoint {
  capturedOn: string;
  value: number;
}

export interface TrendChartLeadIn {
  capturedOn: string;
  value: number;
}

export interface TrendChartProps {
  title: string;
  description?: string;
  valueLabel: string;
  points: TrendPoint[];
  leadIn?: TrendChartLeadIn;
}

interface TrendChartRow {
  capturedOn: string;
  value: number | null;
  lead: number | null;
  xEpoch: number;
  isLeadIn: boolean;
}

// Plots one numeric series against real (irregularly spaced) capture dates -
// item 4/D7's true chronological x-axis (chart-axis-comparison-and-table-
// orientation-batch.md §3 item 4), reversing the prior "not to real-time
// scale" convention. The visual Recharts chart is aria-hidden - the actual
// accessible representation is the visible, transposed SyncedDataTable below
// it (docs/plans/chart-synced-data-table.md), rendered as a SIBLING of the
// role=img figure (not nested inside it - role=img descendants are
// generally hidden from assistive tech). Hovering/focusing the chart
// highlights the matching table column (chart->table sync); hovering/
// focusing a table column header draws a guide line + ring at the matching
// chart point (table->chart sync, via ActivePointOverlay). The title and
// optional description are rendered as real, visible text (not just aria
// attributes) so a sighted user looking at the dashboard can tell what each
// chart represents without relying on a screen reader.
export function TrendChart({ title, description, valueLabel, points, leadIn }: TrendChartProps) {
  const headingId = useId();
  const descriptionId = useId();
  // Recharts renders to SVG with literal fill/stroke color props, not CSS
  // custom properties resolved at paint time, so the chart's own colors are
  // resolved here (reactively, following prefers-color-scheme) rather than
  // via the Tailwind classes the surrounding chrome uses - see
  // src/lib/useChartColors.ts and MASTER.md's Chart Guidance section.
  const colors = useChartColors();
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const [pinnedDateKey, setPinnedDateKey] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation>("datesAsColumns");

  // Item 4 point 2's two lead-in placement paths (§3 item 4): a real point
  // sits at its true epoch; the account-level estimated-baseline lead-in
  // sits at a bounded synthetic offset (chartTimeAxis.leadInEpoch) before
  // the first real point, never its own (often many-years-distant) literal
  // date - see chartTimeAxis.test.ts for the median-gap-clamp math.
  const realEpochs = points.map((point) => toEpoch(point.capturedOn));
  const firstRealEpoch = realEpochs[0];
  const leadInX = leadIn ? leadInEpoch(firstRealEpoch, { realEpochs }) : undefined;

  const chartData: TrendChartRow[] = leadIn
    ? [
        {
          capturedOn: leadIn.capturedOn,
          value: null,
          lead: leadIn.value,
          xEpoch: leadInX as number,
          isLeadIn: true,
        },
        ...points.map((point, index) => ({
          capturedOn: point.capturedOn,
          value: point.value,
          lead: index === 0 ? point.value : null,
          xEpoch: realEpochs[index],
          isLeadIn: false,
        })),
      ]
    : points.map((point, index) => ({
        capturedOn: point.capturedOn,
        value: point.value,
        lead: null,
        xEpoch: realEpochs[index],
        isLeadIn: false,
      }));

  function isLeadInTick(xEpoch: number): boolean {
    return chartData.find((r) => r.xEpoch === xEpoch)?.isLeadIn ?? false;
  }

  // Only a real point's tick gets text at all - the lead-in slot renders a
  // marker instead (see LeadInXAxisTick.tsx), so this never needs to format
  // a lead-in's date. D1: bare day-of-month, not the full ISO date - month/
  // year context now lives in DateGroupingOverlay's own span/rule labels.
  const formatTick = (xEpoch: number): string => formatDayTick(xEpoch);

  // Passed to <XAxis tickFormatter>, NOT to the custom tick renderer's own
  // `formatTick` above - this is the string Recharts' internal tick-overlap-
  // avoidance filtering measures for collision purposes (see
  // LeadInXAxisTick.tsx's top-of-file comment). Returning "" for the
  // lead-in's slot makes Recharts treat it as zero-width, which is what
  // structurally prevents it from re-triggering the same filtering bug.
  const axisTickFormatter = (xEpoch: number): string =>
    isLeadInTick(xEpoch) ? "" : formatTick(xEpoch);

  // Chart -> table sync (§2.3): TrendChart's XAxis is the numeric xEpoch, so
  // state.activeLabel is that epoch, not the capturedOn dateKey directly -
  // resolve it via chartData.
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

  // Table -> chart sync (§2.3): resolve the active date's chart-space point
  // for the overlay. The leadIn row's own value lives on "lead" (its "value"
  // is null), so fall back to that.
  function rowFor(dateKey: string | null): TrendChartRow | undefined {
    return dateKey ? chartData.find((r) => r.capturedOn === dateKey) : undefined;
  }
  const activeRow = rowFor(activeDateKey);
  const activePoints: ActivePoint[] = activeRow
    ? [{ x: activeRow.xEpoch, y: (activeRow.isLeadIn ? activeRow.lead : activeRow.value) ?? 0 }]
    : [];
  const pinnedRow = rowFor(pinnedDateKey);
  const pinnedPoints: ActivePoint[] = pinnedRow
    ? [{ x: pinnedRow.xEpoch, y: (pinnedRow.isLeadIn ? pinnedRow.lead : pinnedRow.value) ?? 0 }]
    : [];

  // No current caller mounts this with empty points and no leadIn - Recharts'
  // numeric XAxis domain reads chartData[0]/chartData[chartData.length - 1],
  // which would otherwise throw on an empty array - but the component is
  // reusable, so it degrades to a plain message instead of a chart region.
  if (chartData.length === 0) {
    return (
      <div
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full rounded-lg border border-ink/12 bg-card p-6 transition-colors duration-200 hover:border-ink/24"
      >
        <h3 id={headingId} className="font-display text-base font-semibold text-ink">
          {title}
        </h3>
        {description && (
          <p id={descriptionId} className="mt-1 text-sm text-ink-soft">
            {description}
          </p>
        )}
        <p className="mt-4 text-sm text-ink-soft">No data yet.</p>
      </div>
    );
  }

  const tableModel = buildTrendTableModel({ valueLabel, points, leadIn });

  // Item 1/D1's padded y-domain: values INCLUDE the lead-in's literal 0 when
  // present, per D1's deliberate "safe default" (chartTimeAxis.test.ts).
  const yValues = leadIn ? [0, ...points.map((point) => point.value)] : points.map((p) => p.value);
  const { domain: yDomain, broken: brokenYAxis } = computeYDomain(yValues, {
    hasLeadIn: Boolean(leadIn),
  });

  const pinnedLabel = pinnedRow
    ? (tableModel.columns.find((c) => c.dateKey === pinnedRow.capturedOn)?.label ??
      pinnedRow.capturedOn)
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
      {description && (
        <p id={descriptionId} className="mt-1 text-sm text-ink-soft">
          {description}
        </p>
      )}

      <ChartDisclosure>
        <figure
          role="img"
          aria-labelledby={headingId}
          aria-describedby={description ? descriptionId : undefined}
        >
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
                  domain={[chartData[0].xEpoch, chartData[chartData.length - 1].xEpoch]}
                  ticks={selectDisplayedTicks(chartData)}
                  // interval={0}: bypasses Recharts' own tick-selection/
                  // filtering entirely (verified against the installed
                  // recharts@3.10.0 source - see chartTimeAxis.ts's
                  // selectDisplayedTicks comment) - every value this
                  // component curates into `ticks` above renders, no more,
                  // no less. height/tickMargin bumped (dateGroupingChartLayout)
                  // to reserve the month/year band below the day ticks - the
                  // plot rect itself is unchanged (see that module's comment).
                  interval={0}
                  height={X_AXIS_BAND_HEIGHT}
                  tickMargin={DAY_TICK_MARGIN}
                  tickFormatter={axisTickFormatter}
                  tick={createLeadInXAxisTick({
                    fill: colors.inkSoft,
                    formatTick,
                    isLeadInTick,
                    markerColor: colors.accent,
                  })}
                />
                <YAxis
                  domain={yDomain}
                  width={estimateYAxisWidth(yDomain[1])}
                  tickFormatter={formatNumber}
                  tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  name={valueLabel}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={false}
                  stroke={colors.ink}
                  strokeWidth={2}
                  dot={(dotProps: {
                    cx?: number;
                    cy?: number;
                    payload?: TrendChartRow;
                    index?: number;
                  }) => {
                    const { cx, cy, payload, index } = dotProps;
                    // Null on the synthetic leadIn row for this series - skip it so
                    // only real points get a dot here (the leadIn's own dot is drawn
                    // by the "lead" line below, in accent, not ink).
                    if (payload?.value == null || cx == null || cy == null) {
                      return <g key={`value-dot-${index}`} />;
                    }
                    return (
                      <circle
                        key={`value-dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={colors.ink}
                      />
                    );
                  }}
                />
                {leadIn && (
                  <Line
                    type="linear"
                    dataKey="lead"
                    name={`${valueLabel} (estimated baseline)`}
                    connectNulls
                    isAnimationActive={false}
                    activeDot={false}
                    strokeDasharray="4 4"
                    stroke={colors.inkSoft}
                    strokeWidth={1.5}
                    dot={(dotProps: {
                      cx?: number;
                      cy?: number;
                      payload?: TrendChartRow;
                      index?: number;
                    }) => {
                      const { cx, cy, payload, index } = dotProps;
                      // This series also carries the first real point's value (to
                      // close the dashed segment) - only draw a dot for the
                      // synthetic row itself, the "value" line's dot already
                      // covers the first real point, in ink rather than accent.
                      if (!payload?.isLeadIn || cx == null || cy == null) {
                        return <g key={`lead-dot-${index}`} />;
                      }
                      return (
                        <circle
                          key={`lead-dot-${index}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={colors.accent}
                        />
                      );
                    }}
                  />
                )}
                {/* Rendered BEFORE ActivePointOverlay (plan §5.4) so the
                    decorative month/year marks sit beneath the active/pinned
                    guide lines, not on top of them. */}
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

      {pinnedLabel && (
        <PinnedComparisonBar
          pinnedLabel={pinnedLabel}
          elapsedLabel={elapsedLabelText}
          onClear={() => setPinnedDateKey(null)}
        />
      )}

      <SyncedDataTable
        title={title}
        rowHeaderLabel="Metric"
        model={tableModel}
        activeDateKey={activeDateKey}
        onActiveDateKeyChange={setActiveDateKey}
        orientation={orientation}
        onOrientationChange={setOrientation}
        pinnedDateKey={pinnedDateKey}
        onPinnedDateKeyChange={togglePinnedDateKey}
      />
    </div>
  );
}
