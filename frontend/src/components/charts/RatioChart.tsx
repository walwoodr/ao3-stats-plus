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

export interface RatioPoint {
  capturedOn: string;
  ratio: number;
}

// The caller (DashboardPage) is responsible for always passing ratio: 1 -
// this is the fixed 1-kudos-per-1-hit synthetic baseline, never 0 and never
// derived from real hits/kudos. RatioChart itself just renders whatever
// ratio it's given, same as TrendChart does for its leadIn value.
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

  const chartData: RatioChartRow[] = leadIn
    ? [
        { capturedOn: leadIn.capturedOn, ratio: null, lead: leadIn.ratio },
        ...points.map((point, index) => ({
          capturedOn: point.capturedOn,
          ratio: point.ratio,
          lead: index === 0 ? point.ratio : null,
        })),
      ]
    : points.map((point) => ({ capturedOn: point.capturedOn, ratio: point.ratio, lead: null }));

  return (
    <figure
      role="img"
      aria-labelledby={headingId}
      aria-describedby={description ? descriptionId : undefined}
      className="w-full"
    >
      <h3 id={headingId} className="text-base font-semibold text-slate-900">
        {title}
      </h3>
      {description && (
        <p id={descriptionId} className="mt-1 text-sm text-slate-600">
          {description}
        </p>
      )}

      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="capturedOn" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="ratio"
              name="Kudos-to-hits ratio"
              dot={false}
              connectNulls={false}
            />
            {leadIn && (
              <Line
                type="monotone"
                dataKey="lead"
                name="Kudos-to-hits ratio (estimated baseline)"
                dot={false}
                connectNulls
                strokeDasharray="4 4"
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        <div className="mt-2 flex flex-wrap gap-2">
          {leadIn && (
            <span
              data-testid="ratio-point-marker-lead"
              aria-label={`${leadInLabel(leadIn)}: ${leadIn.ratio} kudos-to-hits ratio`}
              className="inline-block h-2 w-2 rotate-45 bg-slate-400"
            />
          )}
          {points.map((point, index) => (
            <span
              key={point.capturedOn}
              data-testid={`ratio-point-marker-${index}`}
              aria-label={`${point.capturedOn}: ${point.ratio} kudos-to-hits ratio`}
              className="inline-block h-2 w-2 rounded-full bg-slate-700"
            />
          ))}
        </div>
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
