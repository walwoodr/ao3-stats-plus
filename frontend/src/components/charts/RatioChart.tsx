import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface RatioPoint {
  capturedOn: string;
  ratio: number;
}

export interface RatioChartProps {
  title: string;
  points: RatioPoint[];
}

// Plots the kudos-to-hits ratio over time. The divide-by-zero guard itself
// is a backend concern (a zero-hits snapshot arrives with ratio already
// computed as 0) - this component just has to render that zero explicitly
// rather than treating it as missing data, plus the same irregular-gap/
// single-point/accessible-table/non-color-only guarantees as TrendChart.
export function RatioChart({ title, points }: RatioChartProps) {
  return (
    <figure role="img" aria-label={title} className="w-full">
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="capturedOn" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="ratio" name="Kudos-to-hits ratio" dot={false} />
          </LineChart>
        </ResponsiveContainer>

        <div className="mt-2 flex flex-wrap gap-2">
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
