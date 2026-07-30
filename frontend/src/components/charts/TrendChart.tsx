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

export interface TrendChartProps {
  title: string;
  description?: string;
  valueLabel: string;
  points: TrendPoint[];
}

// Plots one numeric series against real (irregularly spaced) capture dates.
// The visual Recharts chart is aria-hidden - the actual accessible
// representation is the data table below it (one row per snapshot, never
// fabricating rows for the gap between sparse captures) plus a per-point
// marker with its own aria-label, so the trend isn't color-only. The title
// and optional description are rendered as real, visible text (not just
// aria attributes) so a sighted user looking at the dashboard can tell
// what each chart represents without relying on a screen reader.
export function TrendChart({ title, description, valueLabel, points }: TrendChartProps) {
  const headingId = useId();
  const descriptionId = useId();

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
          <LineChart data={points} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="capturedOn" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" name={valueLabel} dot={false} />
          </LineChart>
        </ResponsiveContainer>

        <div className="mt-2 flex flex-wrap gap-2">
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
