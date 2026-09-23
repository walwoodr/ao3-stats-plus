import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { MouseHandlerDataParam } from "recharts";
import { useChartColors } from "../../lib/useChartColors";
import { buildTrendTableModel } from "../../lib/syncedTableModel";
import { SyncedDataTable } from "./SyncedDataTable";
import { ActivePointOverlay, type ActivePoint } from "./ActivePointOverlay";

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
  xValue: number;
  isLeadIn: boolean;
}

// Plots one numeric series against real (irregularly spaced) capture dates.
// The visual Recharts chart is aria-hidden - the actual accessible
// representation is the visible, transposed SyncedDataTable below it
// (docs/plans/chart-synced-data-table.md), rendered as a SIBLING of the
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

  // The dashed "lead" series only carries a value on the synthetic row and
  // the first real row (so it draws exactly one segment connecting them);
  // the solid "value" series never carries the synthetic row's value, so it
  // never draws a solid segment where the dashed one belongs.
  //
  // X positions are explicit integers rather than left to Recharts' string-
  // categorical axis: real points sit at 1, 2, 3, ... (always one unit
  // apart, regardless of real calendar distance - the deliberate "not to
  // real-time scale" behavior from Task 1's plan) and the lead-in sits at 0,
  // i.e. exactly one unit before the first real point - the same distance
  // as between any two consecutive real points.
  const chartData: TrendChartRow[] = leadIn
    ? [
        {
          capturedOn: leadIn.capturedOn,
          value: null,
          lead: leadIn.value,
          xValue: 0,
          isLeadIn: true,
        },
        ...points.map((point, index) => ({
          capturedOn: point.capturedOn,
          value: point.value,
          lead: index === 0 ? point.value : null,
          xValue: index + 1,
          isLeadIn: false,
        })),
      ]
    : points.map((point, index) => ({
        capturedOn: point.capturedOn,
        value: point.value,
        lead: null,
        xValue: index,
        isLeadIn: false,
      }));

  // The lead-in's axis tick is deliberately coarser (year-only) than a real
  // point's - it's an estimated baseline, not an actual capture date, so
  // showing a fabricated "January 1st" would overstate its precision.
  const formatTick = (xValue: number): string => {
    const row = chartData.find((r) => r.xValue === xValue);
    if (!row) return "";
    return row.isLeadIn ? row.capturedOn.slice(0, 4) : row.capturedOn;
  };

  // Chart -> table sync (§2.3): TrendChart's XAxis is the numeric xValue, so
  // state.activeLabel is the xValue integer, not the capturedOn dateKey
  // directly - resolve it via chartData.
  function resolveDateKey(state: MouseHandlerDataParam): string | null {
    const activeLabel = state.activeLabel;
    if (activeLabel == null) return null;
    const row = chartData.find((r) => r.xValue === activeLabel);
    return row ? row.capturedOn : null;
  }

  // Table -> chart sync (§2.3): resolve the active date's chart-space point
  // for the overlay. The leadIn row's own value lives on "lead" (its "value"
  // is null), so fall back to that.
  const activeRow = activeDateKey
    ? chartData.find((r) => r.capturedOn === activeDateKey)
    : undefined;
  const activePoints: ActivePoint[] = activeRow
    ? [{ x: activeRow.xValue, y: (activeRow.isLeadIn ? activeRow.lead : activeRow.value) ?? 0 }]
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
            >
              <CartesianGrid strokeDasharray="3 3" stroke={colors.inkSoft} strokeOpacity={0.2} />
              <XAxis
                dataKey="xValue"
                type="number"
                domain={[chartData[0].xValue, chartData[chartData.length - 1].xValue]}
                ticks={chartData.map((row) => row.xValue)}
                tickFormatter={formatTick}
                tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }}
              />
              <YAxis
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
                    <circle key={`value-dot-${index}`} cx={cx} cy={cy} r={3.5} fill={colors.ink} />
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
              <ActivePointOverlay activePoints={activePoints} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <SyncedDataTable
        title={title}
        rowHeaderLabel="Metric"
        model={tableModel}
        activeDateKey={activeDateKey}
        onActiveDateKeyChange={setActiveDateKey}
      />
    </div>
  );
}
