import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "../../lib/useChartColors";

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

// leadIn's year-only label ("Before 2014 (estimated baseline)") - never the
// raw ISO capturedOn - so the synthetic point can't be mistaken for a real
// snapshot date anywhere it's surfaced (table row, marker aria-label).
function leadInLabel(leadIn: TrendChartLeadIn): string {
  const year = leadIn.capturedOn.slice(0, 4);
  return `Before ${year} (estimated baseline)`;
}

// Plots one numeric series against real (irregularly spaced) capture dates.
// The visual Recharts chart is aria-hidden - the actual accessible
// representation is the data table below it (one row per snapshot, never
// fabricating rows for the gap between sparse captures) plus a screen-
// reader-only per-point marker with its own aria-label, so the trend isn't
// color-only. The markers are sr-only rather than visible dots - as plain
// same-shaped, same-size circles they didn't convey any real information a
// sighted user couldn't already get from the chart itself, just visual
// clutter. The title and optional description are rendered as real, visible
// text (not just aria attributes) so a sighted user looking at the
// dashboard can tell what each chart represents without relying on a
// screen reader.
export function TrendChart({ title, description, valueLabel, points, leadIn }: TrendChartProps) {
  const headingId = useId();
  const descriptionId = useId();
  // Recharts renders to SVG with literal fill/stroke color props, not CSS
  // custom properties resolved at paint time, so the chart's own colors are
  // resolved here (reactively, following prefers-color-scheme) rather than
  // via the Tailwind classes the surrounding chrome uses - see
  // src/lib/useChartColors.ts and MASTER.md's Chart Guidance section.
  const colors = useChartColors();

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
  const formatTooltipLabel = (xValue: React.ReactNode): string => {
    const row = chartData.find((r) => r.xValue === xValue);
    if (!row) return "";
    return row.isLeadIn && leadIn ? leadInLabel(leadIn) : row.capturedOn;
  };

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

  return (
    <figure
      role="img"
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

      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.inkSoft} strokeOpacity={0.2} />
            <XAxis
              dataKey="xValue"
              type="number"
              domain={[chartData[0].xValue, chartData[chartData.length - 1].xValue]}
              ticks={chartData.map((row) => row.xValue)}
              tickFormatter={formatTick}
              tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
            <YAxis tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <Tooltip
              labelFormatter={formatTooltipLabel}
              contentStyle={{
                fontFamily: "var(--font-mono)",
                backgroundColor: colors.card,
                border: `1px solid ${colors.inkSoft}`,
                borderRadius: 6,
              }}
              labelStyle={{ color: colors.inkSoft }}
              itemStyle={{ color: colors.ink }}
            />
            <Line
              type="linear"
              dataKey="value"
              name={valueLabel}
              connectNulls={false}
              isAnimationActive={false}
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
                    <circle key={`lead-dot-${index}`} cx={cx} cy={cy} r={4} fill={colors.accent} />
                  );
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="sr-only">
        {leadIn && (
          <span data-testid="trend-point-marker-lead">
            {`${leadInLabel(leadIn)}: ${leadIn.value} ${valueLabel}`}
          </span>
        )}
        {points.map((point, index) => (
          <span key={point.capturedOn} data-testid={`trend-point-marker-${index}`}>
            {`${point.capturedOn}: ${point.value} ${valueLabel}`}
          </span>
        ))}
      </div>

      <table aria-label={title} className="sr-only">
        <thead>
          <tr>
            <th>Date</th>
            <th>{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {leadIn && (
            <tr>
              <td>{leadInLabel(leadIn)}</td>
              <td>{leadIn.value}</td>
            </tr>
          )}
          {points.map((point) => (
            <tr key={point.capturedOn}>
              <td>{point.capturedOn}</td>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
