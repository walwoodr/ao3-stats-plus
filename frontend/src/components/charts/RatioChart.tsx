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
  xValue: number;
  isLeadIn: boolean;
}

// leadIn's year-only label - never the raw ISO capturedOn - so the
// synthetic point can't be mistaken for a real snapshot date.
function leadInLabel(leadIn: RatioChartLeadIn): string {
  const year = leadIn.capturedOn.slice(0, 4);
  return `Before ${year} (estimated baseline)`;
}

// Plots the kudos-to-hits ratio over time. The divide-by-zero guard itself
// is a backend concern (a zero-hits snapshot arrives with ratio already
// computed as 0) - this component just has to render that zero explicitly
// rather than treating it as missing data, plus the same irregular-gap/
// single-point/accessible-table/non-color-only guarantees as TrendChart.
// The title/description are visible text, not just aria attributes, so a
// sighted dashboard user can tell what the chart represents at a glance.
export function RatioChart({ title, description, points, leadIn }: RatioChartProps) {
  const headingId = useId();
  const descriptionId = useId();
  // See TrendChart's identical comment: Recharts needs literal color
  // values, not CSS custom properties, so these are resolved reactively via
  // useChartColors rather than left to the surrounding Tailwind classes.
  const colors = useChartColors();

  // X positions are explicit integers rather than left to Recharts' string-
  // categorical axis: real points sit at 1, 2, 3, ... (always one unit
  // apart, regardless of real calendar distance) and the lead-in sits at 0 -
  // exactly one unit before the first real point, the same distance as
  // between any two consecutive real points. See TrendChart's identical
  // comment for the full rationale.
  const chartData: RatioChartRow[] = leadIn
    ? [
        {
          capturedOn: leadIn.capturedOn,
          ratio: null,
          lead: leadIn.ratio,
          xValue: 0,
          isLeadIn: true,
        },
        ...points.map((point, index) => ({
          capturedOn: point.capturedOn,
          ratio: point.ratio,
          lead: index === 0 ? point.ratio : null,
          xValue: index + 1,
          isLeadIn: false,
        })),
      ]
    : points.map((point, index) => ({
        capturedOn: point.capturedOn,
        ratio: point.ratio,
        lead: null,
        xValue: index,
        isLeadIn: false,
      }));

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
              dataKey="ratio"
              name="Kudos-to-hits ratio"
              connectNulls={false}
              isAnimationActive={false}
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
                  <circle key={`ratio-dot-${index}`} cx={cx} cy={cy} r={3.5} fill={colors.ink} />
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
          <span data-testid="ratio-point-marker-lead">
            {`${leadInLabel(leadIn)}: ${leadIn.ratio} kudos-to-hits ratio`}
          </span>
        )}
        {points.map((point, index) => (
          <span key={point.capturedOn} data-testid={`ratio-point-marker-${index}`}>
            {`${point.capturedOn}: ${point.ratio} kudos-to-hits ratio`}
          </span>
        ))}
      </div>

      <table aria-label={title} className="sr-only">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ratio</th>
          </tr>
        </thead>
        <tbody>
          {leadIn && (
            <tr>
              <td>{leadInLabel(leadIn)}</td>
              <td>{leadIn.ratio}</td>
            </tr>
          )}
          {points.map((point) => (
            <tr key={point.capturedOn}>
              <td>{point.capturedOn}</td>
              <td>{point.ratio}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
