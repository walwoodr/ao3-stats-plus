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
import { renderMarkerShape } from "../../lib/markerShapes";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";
import { ComparisonLegend } from "./ComparisonLegend";
import type { TrendPoint } from "./TrendChart";

export interface SeriesDatum {
  workId: number;
  title: string;
  styleIndex: number;
  points: TrendPoint[];
}

export interface MultiSeriesTrendChartProps {
  title: string;
  valueLabel: string;
  series: SeriesDatum[];
}

type ChartRow = { capturedOn: string } & Record<string, string | number | null>;

function workKey(workId: number): string {
  return `work-${workId}`;
}

// The chart's shared date axis is the UNION of every selected work's
// capturedOn dates - a work with no point at a given date contributes null
// (a chart gap, connectNulls={false}) rather than a fabricated zero, per
// the plan's "MultiSeriesTrendChart internals" section.
function buildChartData(series: SeriesDatum[]): ChartRow[] {
  const unionDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.capturedOn)))].sort();

  return unionDates.map((capturedOn) => {
    const row: ChartRow = { capturedOn };
    series.forEach((s) => {
      const point = s.points.find((p) => p.capturedOn === capturedOn);
      row[workKey(s.workId)] = point ? point.value : null;
    });
    return row;
  });
}

// The N-series sibling of TrendChart (which stays single/lead-series only -
// see the plan's "New vs. extended" section). Reuses the same accessibility
// skeleton (figure role=img, aria-hidden Recharts block, sr-only per-point
// markers, sr-only wide data table) plus a visible legend mapping each
// work's title to its (shape, dash, color) glyph in words - color is a
// redundant reinforcement channel (decision A), never the sole
// differentiator; identity for AT users is always the work's title text.
export function MultiSeriesTrendChart({ title, valueLabel, series }: MultiSeriesTrendChartProps) {
  const headingId = useId();
  const colors = useChartColors();

  if (series.length === 0) {
    return (
      <div className="w-full rounded-lg border border-ink/12 bg-card p-6 transition-colors duration-200 hover:border-ink/24">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        <p className="mt-4 text-sm text-ink-soft">Select at least one work to compare.</p>
      </div>
    );
  }

  const chartData = buildChartData(series);
  let markerCounter = 0;

  return (
    <figure
      role="img"
      aria-labelledby={headingId}
      className="w-full rounded-lg border border-ink/12 bg-card p-6 transition-colors duration-200 hover:border-ink/24"
    >
      <h3 id={headingId} className="font-display text-base font-semibold text-ink">
        {title}
      </h3>

      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.inkSoft} strokeOpacity={0.2} />
            <XAxis
              dataKey="capturedOn"
              type="category"
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
            {series.map((s) => {
              const slot = SERIES_STYLE_SLOTS[s.styleIndex];
              const color = colors.series[s.styleIndex];
              const key = workKey(s.workId);
              return (
                <Line
                  key={s.workId}
                  type="linear"
                  dataKey={key}
                  name={s.title}
                  connectNulls={false}
                  isAnimationActive={false}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={slot.dash ?? undefined}
                  dot={(dotProps: {
                    cx?: number;
                    cy?: number;
                    payload?: ChartRow;
                    index?: number;
                  }) => {
                    const { cx, cy, payload, index } = dotProps;
                    const value = payload ? payload[key] : null;
                    if (value == null || cx == null || cy == null) {
                      return <g key={`${key}-dot-${index}`} />;
                    }
                    return (
                      <g key={`${key}-dot-${index}`}>
                        {renderMarkerShape(slot.shape, { cx, cy, size: 4, color })}
                      </g>
                    );
                  }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ComparisonLegend entries={series} seriesColors={colors.series} />

      <div className="sr-only">
        {series.flatMap((s) =>
          s.points.map((point) => (
            <span
              key={`${s.workId}-${point.capturedOn}`}
              data-testid={`multi-series-point-marker-${markerCounter++}`}
            >
              {`${s.title} — ${point.capturedOn}: ${point.value} ${valueLabel}`}
            </span>
          )),
        )}
      </div>

      <table aria-label={title} className="sr-only">
        <thead>
          <tr>
            <th>Date</th>
            {series.map((s) => (
              <th key={s.workId}>{s.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.capturedOn}>
              <td>{row.capturedOn}</td>
              {series.map((s) => {
                const value = row[workKey(s.workId)];
                return <td key={s.workId}>{value == null ? "—" : value}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
