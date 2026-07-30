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
            <Line type="monotone" dataKey="value" name={valueLabel} dot={false} connectNulls={false} />
            {leadIn && (
              <Line
                type="monotone"
                dataKey="lead"
                name={`${valueLabel} (estimated baseline)`}
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
              data-testid="trend-point-marker-lead"
              aria-label={`${leadInLabel(leadIn)}: ${leadIn.value} ${valueLabel}`}
              className="inline-block h-2 w-2 rotate-45 bg-slate-400"
            />
          )}
          {points.map((point, index) => (
            <span
              key={point.capturedOn}
              data-testid={`trend-point-marker-${index}`}
              aria-label={`${point.capturedOn}: ${point.value} ${valueLabel}`}
              className="inline-block h-2 w-2 rounded-full bg-slate-700"
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
