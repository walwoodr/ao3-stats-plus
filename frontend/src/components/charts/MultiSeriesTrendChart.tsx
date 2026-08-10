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
import { renderMarkerShape } from "../../lib/markerPaths";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";
import { ComparisonLegend } from "./ComparisonLegend";
import type { TrendPoint } from "./TrendChart";

// Per-work zero-basis dates (docs/plans/per-work-zero-basis-dates.md):
// value is always 0, so only the synthetic date and an accessible label are
// carried - WorkComparisonSection computes both (own publishedOn, or the
// earliestPostYear fallback) and gates presence entirely; this component
// just renders whatever leadIn it's handed.
export interface SeriesLeadIn {
  capturedOn: string;
  label: string;
}

export interface SeriesDatum {
  workId: number;
  title: string;
  styleIndex: number;
  points: TrendPoint[];
  leadIn?: SeriesLeadIn;
}

export interface MultiSeriesTrendChartProps {
  title: string;
  valueLabel: string;
  series: SeriesDatum[];
}

type ChartRow = { capturedOn: string } & Record<string, string | number | null>;

export interface BuildChartDataResult {
  rows: ChartRow[];
  // capturedOn -> label, for slots that are some work's zero-basis and are
  // NOT any work's real capture date (a fallback slot that coincides with
  // another work's real capture prefers the raw ISO date instead - see the
  // plan's corner cases).
  zeroBasisLabels: Map<string, string>;
}

function workKey(workId: number): string {
  return `work-${workId}`;
}

function leadKey(workId: number): string {
  return `lead-${workId}`;
}

// The worded (shape, color) description for a series' style slot - lives
// only in the sr-only accessible table's column headers now (see the
// component doc comment above for why it moved out of the visible legend).
function describeStyle(styleIndex: number): string {
  const slot = SERIES_STYLE_SLOTS[styleIndex];
  return `${slot.colorRole} ${slot.shape} marker`;
}

// The chart's shared date axis is the UNION of every selected work's
// capturedOn dates AND every selected work's injected zero-basis (leadIn)
// date - a work with no point at a given date contributes null (a chart
// gap, connectNulls={false}) rather than a fabricated zero, per the plan's
// "MultiSeriesTrendChart internals" section. Exported (mirroring
// comparisonSelection.ts's convention of exporting pure helpers) so it's
// directly unit-testable.
export function buildChartData(series: SeriesDatum[]): BuildChartDataResult {
  const realDates = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => realDates.add(p.capturedOn)));

  const unionDates = new Set(realDates);
  series.forEach((s) => {
    if (s.leadIn) unionDates.add(s.leadIn.capturedOn);
  });
  const sortedDates = [...unionDates].sort();

  // Only a slot that's exclusively a zero-basis anchor (never a real
  // capture date for ANY selected work) gets the word-label treatment - a
  // shared slot that happens to double as another work's real point keeps
  // the precise ISO date instead.
  const zeroBasisLabels = new Map<string, string>();
  series.forEach((s) => {
    if (s.leadIn && !realDates.has(s.leadIn.capturedOn)) {
      zeroBasisLabels.set(s.leadIn.capturedOn, s.leadIn.label);
    }
  });

  const rows: ChartRow[] = sortedDates.map((capturedOn) => {
    const row: ChartRow = { capturedOn };
    series.forEach((s) => {
      const point = s.points.find((p) => p.capturedOn === capturedOn);
      row[workKey(s.workId)] = point ? point.value : null;

      if (!s.leadIn) return;
      // A lead-* key is only ever set within THIS work's own axis (its
      // leadIn slot plus its own real point slots) - a slot that belongs
      // only to some other work leaves the key entirely absent, so it
      // never masquerades as "this work has data here" for anyone reading
      // the row directly (see buildChartData.test.ts's "never carries a
      // value on another work's slot" case).
      const ownDates = new Set([s.leadIn.capturedOn, ...s.points.map((p) => p.capturedOn)]);
      if (!ownDates.has(capturedOn)) return;

      const key = leadKey(s.workId);
      if (capturedOn === s.leadIn.capturedOn) {
        row[key] = 0;
      } else if (s.points[0] && capturedOn === s.points[0].capturedOn) {
        // Closes the dashed segment: the lead line's only other non-null
        // value is the first real point's own value, so exactly one
        // segment draws between the two (the same two-non-null-points
        // trick TrendChart's aggregate lead-in uses).
        row[key] = s.points[0].value;
      } else {
        row[key] = null;
      }
    });
    return row;
  });

  return { rows, zeroBasisLabels };
}

// zeroBasis-only fallback rows share one label per shared slot; distinct
// accurate-publish leadIns each get their own.
function cellValue(row: ChartRow, workId: number): string | number {
  const mainValue = row[workKey(workId)];
  if (mainValue !== null) return mainValue;
  const leadValue = row[leadKey(workId)];
  if (leadValue !== null && leadValue !== undefined) return leadValue;
  return "—";
}

// The N-series sibling of TrendChart (which stays single/lead-series only -
// see the plan's "New vs. extended" section). Reuses the same accessibility
// skeleton (figure role=img, aria-hidden Recharts block, sr-only per-point
// markers, sr-only wide data table) plus a visible legend mapping each
// work's title to its (shape, color) glyph - per
// docs/plans/usds-dataviz-color-scheme.md, shape alone is now the
// guaranteed non-color channel (dash was dropped as a per-series
// differentiator; series lines are solid) and color is redundant
// reinforcement only, never the sole differentiator. The worded style
// description ("slate-blue circle marker") was removed from the VISIBLE
// legend per direct user instruction (2026-08-09 TECH_DEBT.md), but stays
// available to screen-reader users via the sr-only table's column headers
// below (`describeStyle`) - that's the accessible surface MASTER.md's
// Multi-Series Comparison Charts section documents as carrying this mapping.
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

  const { rows: chartData, zeroBasisLabels } = buildChartData(series);
  const tickFormatter = (capturedOn: string): string =>
    zeroBasisLabels.get(capturedOn) ?? capturedOn;
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
              tickFormatter={tickFormatter}
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
            {series.map((s) => {
              if (!s.leadIn) return null;
              const leadIn = s.leadIn;
              const key = leadKey(s.workId);
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  name={`${s.title} (before first capture)`}
                  connectNulls
                  isAnimationActive={false}
                  strokeDasharray="4 4"
                  stroke={colors.inkSoft}
                  strokeWidth={1.5}
                  dot={(dotProps: {
                    cx?: number;
                    cy?: number;
                    payload?: ChartRow;
                    index?: number;
                  }) => {
                    const { cx, cy, payload, index } = dotProps;
                    // Only the zero-basis slot itself gets a dot - the
                    // first-real slot this line also carries (to close the
                    // dashed segment) already has its own dot from the
                    // main "work-*" line above, in the work's own color.
                    if (payload?.capturedOn !== leadIn.capturedOn || cx == null || cy == null) {
                      return <g key={`${key}-dot-${index}`} />;
                    }
                    return (
                      <circle
                        key={`${key}-dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={colors.inkSoft}
                      />
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
        {series.flatMap((s) => [
          ...(s.leadIn
            ? [
                <span
                  key={`${s.workId}-leadin`}
                  data-testid={`multi-series-point-marker-${markerCounter++}`}
                >
                  {`${s.title} — ${s.leadIn.label}: 0 ${valueLabel}`}
                </span>,
              ]
            : []),
          ...s.points.map((point) => (
            <span
              key={`${s.workId}-${point.capturedOn}`}
              data-testid={`multi-series-point-marker-${markerCounter++}`}
            >
              {`${s.title} — ${point.capturedOn}: ${point.value} ${valueLabel}`}
            </span>
          )),
        ])}
      </div>

      <table aria-label={title} className="sr-only">
        <thead>
          <tr>
            <th>Date</th>
            {series.map((s) => (
              <th key={s.workId}>
                {s.title} — {describeStyle(s.styleIndex)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.capturedOn}>
              <td>{zeroBasisLabels.get(row.capturedOn) ?? row.capturedOn}</td>
              {series.map((s) => (
                <td key={s.workId}>{cellValue(row, s.workId)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
