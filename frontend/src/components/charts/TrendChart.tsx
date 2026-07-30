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
// fabricating rows for the gap between sparse captures) plus a per-point
// marker with its own aria-label, so the trend isn't color-only. The title
// and optional description are rendered as real, visible text (not just
// aria attributes) so a sighted user looking at the dashboard can tell
// what each chart represents without relying on a screen reader.
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
  const chartData: TrendChartRow[] = leadIn
    ? [
        { capturedOn: leadIn.capturedOn, value: null, lead: leadIn.value },
        ...points.map((point, index) => ({
          capturedOn: point.capturedOn,
          value: point.value,
          lead: index === 0 ? point.value : null,
        })),
      ]
    : points.map((point) => ({ capturedOn: point.capturedOn, value: point.value, lead: null }));

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
              dataKey="capturedOn"
              tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
            <YAxis tick={{ fill: colors.inkSoft, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <Tooltip
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
              type="monotone"
              dataKey="value"
              name={valueLabel}
              connectNulls={false}
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
                type="monotone"
                dataKey="lead"
                name={`${valueLabel} (estimated baseline)`}
                connectNulls
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
                  if (payload?.capturedOn !== leadIn.capturedOn || cx == null || cy == null) {
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

        <div className="mt-2 flex flex-wrap gap-2">
          {leadIn && (
            <span
              data-testid="trend-point-marker-lead"
              aria-label={`${leadInLabel(leadIn)}: ${leadIn.value} ${valueLabel}`}
              className="inline-block h-[9px] w-[9px] rounded-full"
              style={{ backgroundColor: colors.accent }}
            />
          )}
          {points.map((point, index) => (
            <span
              key={point.capturedOn}
              data-testid={`trend-point-marker-${index}`}
              aria-label={`${point.capturedOn}: ${point.value} ${valueLabel}`}
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: colors.ink }}
            />
          ))}
        </div>
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
