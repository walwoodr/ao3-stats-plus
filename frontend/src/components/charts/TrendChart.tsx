import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  capturedOn: string;
  value: number;
}

export interface TrendChartProps {
  title: string;
  valueLabel: string;
  points: TrendPoint[];
}

// Plots one numeric series against real (irregularly spaced) capture dates.
// The visual Recharts chart is aria-hidden - the actual accessible
// representation is the data table below it (one row per snapshot, never
// fabricating rows for the gap between sparse captures) plus a per-point
// marker with its own aria-label, so the trend isn't color-only.
export function TrendChart({ title, valueLabel, points }: TrendChartProps) {
  return (
    <figure role="img" aria-label={title} className="w-full">
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={points}>
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
