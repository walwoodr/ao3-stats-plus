import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { MouseHandlerDataParam } from "recharts";
import { useChartColors } from "../../lib/useChartColors";
import { formatNumber } from "../../lib/formatNumber";
import { buildRatioTableModel } from "../../lib/syncedTableModel";
import {
  computeYDomain,
  estimateYAxisWidth,
  formatDateTick,
  formatLeadInTick,
  leadInEpoch,
  toEpoch,
} from "../../lib/chartTimeAxis";
import { elapsedLabel as computeElapsedLabel } from "../../lib/pointComparison";
import type { Orientation } from "../../lib/tableOrientation";
import { SyncedDataTable } from "./SyncedDataTable";
import { ChartDisclosure } from "./ChartDisclosure";
import { PinnedComparisonBar } from "./PinnedComparisonBar";
import { ActivePointOverlay, type ActivePoint } from "./ActivePointOverlay";
import { createEdgeSafeXAxisTick } from "./EdgeSafeXAxisTick";

export interface RatioPoint {
  capturedOn: string;
  ratio: number;
}

// The caller (DashboardPage) is responsible for always passing ratio: 0 -
// this is the fixed "no kudos yet" synthetic baseline, matching TrendChart's
// hits/kudos leadIn convention of starting from zero, never derived from
// real hits/kudos. RatioChart itself just renders whatever ratio it's
// given, same as TrendChart does for its leadIn value.
export interface RatioChartLeadIn {
  capturedOn: string;
  ratio: number;
}

export interface RatioChartProps {
  title: string;
  description?: string;
  points: RatioPoint[];
  leadIn?: RatioChartLeadIn;
}

interface RatioChartRow {
  capturedOn: string;
  ratio: number | null;
  lead: number | null;
  xEpoch: number;
  isLeadIn: boolean;
}

// Plots the kudos-to-hits ratio over real elapsed time (item 4/D7). The
// divide-by-zero guard itself is a backend concern (a zero-hits snapshot
// arrives with ratio already computed as 0) - this component just has to
// render that zero explicitly rather than treating it as missing data, plus
// the same irregular-gap/single-point/accessible-table/non-color-only
// guarantees as TrendChart. D6: the ratio's delta is colored by the SAME
// up=green/down=red rule as any other metric, no metric-aware exception -
// SyncedDataTable's shared delta-chip rendering already applies this
// uniformly, so nothing ratio-specific is needed here. The title/
// description are visible text, not just aria attributes, so a sighted
// dashboard user can tell what the chart represents at a glance. See
// TrendChart's identical top-of-file comment for the full chart<->table
// sync rationale (docs/plans/chart-synced-data-table.md) - this component
// mirrors that structure exactly for its single ratio series.
export function RatioChart({ title, description, points, leadIn }: RatioChartProps) {
  const headingId = useId();
  const descriptionId = useId();
  // See TrendChart's identical comment: Recharts needs literal color
  // values, not CSS custom properties, so these are resolved reactively via
  // useChartColors rather than left to the surrounding Tailwind classes.
  const colors = useChartColors();
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const [pinnedDateKey, setPinnedDateKey] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation>("datesAsColumns");

  // Item 4 point 2's two lead-in placement paths - see TrendChart's
  // identical comment for the full rationale.
  const realEpochs = points.map((point) => toEpoch(point.capturedOn));
  const firstRealEpoch = realEpochs[0];
  const leadInX = leadIn ? leadInEpoch(firstRealEpoch, { realEpochs }) : undefined;

  const chartData: RatioChartRow[] = leadIn
    ? [
        {
          capturedOn: leadIn.capturedOn,
          ratio: null,
          lead: leadIn.ratio,
          xEpoch: leadInX as number,
          isLeadIn: true,
        },
        ...points.map((point, index) => ({
          capturedOn: point.capturedOn,
          ratio: point.ratio,
          lead: index === 0 ? point.ratio : null,
          xEpoch: realEpochs[index],
          isLeadIn: false,
        })),
      ]
    : points.map((point, index) => ({
        capturedOn: point.capturedOn,
        ratio: point.ratio,
        lead: null,
        xEpoch: realEpochs[index],
        isLeadIn: false,
      }));

  const formatTick = (xEpoch: number): string => {
    const row = chartData.find((r) => r.xEpoch === xEpoch);
    if (!row) return "";
    return row.isLeadIn ? formatLeadInTick(xEpoch) : formatDateTick(xEpoch);
  };

  // Chart -> table sync (§2.3): mirrors TrendChart's numeric-xEpoch
  // resolveDateKey exactly.
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

  // Table -> chart sync (§2.3): mirrors TrendChart's activePoints/
  // pinnedPoints resolution.
  function rowFor(dateKey: string | null): RatioChartRow | undefined {
    return dateKey ? chartData.find((r) => r.capturedOn === dateKey) : undefined;
  }
  const activeRow = rowFor(activeDateKey);
  const activePoints: ActivePoint[] = activeRow
    ? [{ x: activeRow.xEpoch, y: (activeRow.isLeadIn ? activeRow.lead : activeRow.ratio) ?? 0 }]
    : [];
  const pinnedRow = rowFor(pinnedDateKey);
  const pinnedPoints: ActivePoint[] = pinnedRow
    ? [{ x: pinnedRow.xEpoch, y: (pinnedRow.isLeadIn ? pinnedRow.lead : pinnedRow.ratio) ?? 0 }]
    : [];

  // See TrendChart's identical guard: no current caller mounts this with
  // empty points and no leadIn, but the numeric XAxis domain below would
  // otherwise throw reading chartData[0]/chartData[chartData.length - 1]
  // on an empty array.
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

  const tableModel = buildRatioTableModel({ points, leadIn });

  // Item 1/D1's padded y-domain: values INCLUDE the lead-in's literal 0
  // when present, per D1 (chartTimeAxis.test.ts).
  const yValues = leadIn ? [0, ...points.map((point) => point.ratio)] : points.map((p) => p.ratio);
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
            <ResponsiveContainer width="100%" height={240}>
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
                  ticks={chartData.map((row) => row.xEpoch)}
                  tickFormatter={formatTick}
                  tick={createEdgeSafeXAxisTick({ fill: colors.inkSoft, formatTick })}
                />
                <YAxis
                  domain={yDomain}
                  width={estimateYAxisWidth(yDomain[1])}
                  tickFormatter={formatNumber}
                  tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                <Line
                  type="linear"
                  dataKey="ratio"
                  name="Kudos-to-hits ratio"
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={false}
                  stroke={colors.ink}
                  strokeWidth={2}
                  dot={(dotProps: {
                    cx?: number;
                    cy?: number;
                    payload?: RatioChartRow;
                    index?: number;
                  }) => {
                    const { cx, cy, payload, index } = dotProps;
                    // Null on the synthetic leadIn row for this series - skip it so
                    // only real points get a dot here (the leadIn's own dot is drawn
                    // by the "lead" line below, in accent, not ink).
                    if (payload?.ratio == null || cx == null || cy == null) {
                      return <g key={`ratio-dot-${index}`} />;
                    }
                    return (
                      <circle
                        key={`ratio-dot-${index}`}
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
                    name="Kudos-to-hits ratio (estimated baseline)"
                    connectNulls
                    isAnimationActive={false}
                    activeDot={false}
                    strokeDasharray="4 4"
                    stroke={colors.inkSoft}
                    strokeWidth={1.5}
                    dot={(dotProps: {
                      cx?: number;
                      cy?: number;
                      payload?: RatioChartRow;
                      index?: number;
                    }) => {
                      const { cx, cy, payload, index } = dotProps;
                      // This series also carries the first real point's value (to
                      // close the dashed segment) - only draw a dot for the
                      // synthetic row itself, the "ratio" line's dot already
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
