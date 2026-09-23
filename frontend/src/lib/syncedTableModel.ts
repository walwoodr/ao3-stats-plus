import type { MarkerShapeName } from "./seriesStyles";
import { SERIES_STYLE_SLOTS } from "./seriesStyles";

// Pure, chart-agnostic builders that convert each chart's own props shape
// into the shared, transposed SyncedTableModel (columns = time points, rows
// = series/metrics) that SyncedDataTable.tsx renders (plan §5.2, T1/T2).
// These own their own local parameter types rather than importing the
// TrendChart/RatioChart/MultiSeriesTrendChart prop types directly - the
// three chart components import FROM this module, so importing back from
// them would create a circular dependency.

export interface SyncedTableColumn {
  dateKey: string;
  label: string;
  isLeadIn: boolean;
}

export interface SyncedTableRow {
  seriesKey: string;
  title: string;
  identityDescription?: string;
  colorHex?: string;
  shape?: MarkerShapeName;
  cells: (number | string)[];
}

export interface SyncedTableModel {
  columns: SyncedTableColumn[];
  rows: SyncedTableRow[];
  unitLabel: string;
}

// Shared wording for a synthetic lead-in/zero-basis column - never the raw
// ISO date, matching the removed tooltip's formatTooltipLabel wording (plan
// Risk #3).
function estimatedBaselineLabel(capturedOn: string): string {
  const year = capturedOn.slice(0, 4);
  return `Before ${year} (estimated baseline)`;
}

export interface TrendModelPoint {
  capturedOn: string;
  value: number;
}

export interface TrendModelLeadIn {
  capturedOn: string;
  value: number;
}

export interface BuildTrendTableModelParams {
  valueLabel: string;
  points: TrendModelPoint[];
  leadIn?: TrendModelLeadIn;
}

// TrendChart's single-numeric-series shape: exactly one row, no identity
// description/glyph (single-series is the degenerate N=1 case, plan §5.3).
export function buildTrendTableModel({
  valueLabel,
  points,
  leadIn,
}: BuildTrendTableModelParams): SyncedTableModel {
  const columns: SyncedTableColumn[] = leadIn
    ? [
        {
          dateKey: leadIn.capturedOn,
          label: estimatedBaselineLabel(leadIn.capturedOn),
          isLeadIn: true,
        },
        ...points.map((point) => ({
          dateKey: point.capturedOn,
          label: point.capturedOn,
          isLeadIn: false,
        })),
      ]
    : points.map((point) => ({
        dateKey: point.capturedOn,
        label: point.capturedOn,
        isLeadIn: false,
      }));

  const cells: number[] = leadIn
    ? [0, ...points.map((point) => point.value)]
    : points.map((point) => point.value);

  return {
    columns,
    rows: [{ seriesKey: "value", title: valueLabel, cells }],
    unitLabel: valueLabel,
  };
}

export interface RatioModelPoint {
  capturedOn: string;
  ratio: number;
}

export interface RatioModelLeadIn {
  capturedOn: string;
  ratio: number;
}

export interface BuildRatioTableModelParams {
  points: RatioModelPoint[];
  leadIn?: RatioModelLeadIn;
}

const RATIO_UNIT_LABEL = "Kudos-to-hits ratio";

// RatioChart's single-ratio-series shape - mirrors buildTrendTableModel but
// with a fixed unit label (RatioChart never takes a valueLabel prop) and an
// explicit-zero cell rather than a blank one for a zero ratio.
export function buildRatioTableModel({
  points,
  leadIn,
}: BuildRatioTableModelParams): SyncedTableModel {
  const columns: SyncedTableColumn[] = leadIn
    ? [
        {
          dateKey: leadIn.capturedOn,
          label: estimatedBaselineLabel(leadIn.capturedOn),
          isLeadIn: true,
        },
        ...points.map((point) => ({
          dateKey: point.capturedOn,
          label: point.capturedOn,
          isLeadIn: false,
        })),
      ]
    : points.map((point) => ({
        dateKey: point.capturedOn,
        label: point.capturedOn,
        isLeadIn: false,
      }));

  const cells: number[] = leadIn
    ? [0, ...points.map((point) => point.ratio)]
    : points.map((point) => point.ratio);

  return {
    columns,
    rows: [{ seriesKey: "ratio", title: RATIO_UNIT_LABEL, cells }],
    unitLabel: RATIO_UNIT_LABEL,
  };
}

export interface MultiSeriesModelLeadIn {
  capturedOn: string;
  label: string;
  // Maintenance item 3 (post-ship bug batch, 2026-09-23): true only for a
  // work's own accurate publish-date lead-in (WorkComparisonSection's
  // zeroBasisDateFor picked the real publishedOn, not the earliestPostYear
  // fallback). Distinguishes it from the account-level "estimated baseline"
  // lead-in, which keeps the prior word-label column header + plain-0 cell
  // behavior - see multiSeriesCellValue and the column-label loop below.
  // Optional (defaults to the baseline/false treatment) so callers that
  // never build a publish-date lead-in (TrendChart/RatioChart's leadIn
  // shapes are separate types entirely; MultiSeriesTrendChart's own
  // baseline-only fixtures) don't need to know this field exists.
  isPublishDate?: boolean;
}

export interface MultiSeriesModelPoint {
  capturedOn: string;
  value: number;
}

export interface MultiSeriesModelSeries {
  workId: number;
  title: string;
  styleIndex: number;
  points: MultiSeriesModelPoint[];
  leadIn?: MultiSeriesModelLeadIn;
}

export interface BuildMultiSeriesTableModelParams {
  valueLabel: string;
  series: MultiSeriesModelSeries[];
  seriesColors: readonly string[];
}

// The worded (shape, color) identity description that now lives in the
// visible table's row headers (D5) - format pinned to match
// MultiSeriesTrendChart's own describeStyle wording exactly.
function identityDescription(styleIndex: number): string {
  const slot = SERIES_STYLE_SLOTS[styleIndex];
  return `${slot.colorRole} ${slot.shape} marker`;
}

// A series' value at a given union date: its own real point if present,
// else its own leadIn's fixed 0 if the date IS that series' own leadIn slot,
// else "—" (sparse/missing - this series has no data at this date). A
// PUBLISH-DATE leadIn (Maintenance item 3) instead renders the worded
// "Published (N)" placeholder - N is any real value actually captured on
// that exact date (0 otherwise) - taking priority over the plain-real-point
// branch so the wording always applies on the work's own publish-date
// column, even on the rare day a real snapshot lands there too.
function multiSeriesCellValue(series: MultiSeriesModelSeries, dateKey: string): number | string {
  const point = series.points.find((p) => p.capturedOn === dateKey);
  if (series.leadIn && series.leadIn.capturedOn === dateKey && series.leadIn.isPublishDate) {
    return `Published (${point ? point.value : 0})`;
  }
  if (point) return point.value;
  if (series.leadIn && series.leadIn.capturedOn === dateKey) return 0;
  return "—";
}

// MultiSeriesTrendChart's N-series shape - mirrors buildChartData's union-
// date/zero-basis-label logic (MultiSeriesTrendChart.tsx) independently
// (deliberately not imported, per this file's top-of-file circular-
// dependency note), so behavior stays identical: sparse cells become "—", a
// lead-in-only column takes its zero-basis label, a shared slot that
// coincides with a real capture keeps the raw ISO date.
export function buildMultiSeriesTableModel({
  valueLabel,
  series,
  seriesColors,
}: BuildMultiSeriesTableModelParams): SyncedTableModel {
  const realDates = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => realDates.add(p.capturedOn)));

  const unionDates = new Set(realDates);
  series.forEach((s) => {
    if (s.leadIn) unionDates.add(s.leadIn.capturedOn);
  });
  const sortedDates = [...unionDates].sort();

  // Only a slot that's exclusively a zero-basis anchor (never a real
  // capture date for ANY selected series) gets the word-label treatment -
  // and, per Maintenance item 3, never a PUBLISH-DATE leadIn (isPublishDate)
  // at all: that column header always shows just the raw date, formatted
  // like every other date column, regardless of whether it coincides with a
  // real capture. Only the account-level "estimated baseline" leadIn keeps
  // the word-label collapsing behavior.
  const zeroBasisLabels = new Map<string, string>();
  series.forEach((s) => {
    if (s.leadIn && !s.leadIn.isPublishDate && !realDates.has(s.leadIn.capturedOn)) {
      zeroBasisLabels.set(s.leadIn.capturedOn, s.leadIn.label);
    }
  });

  const columns: SyncedTableColumn[] = sortedDates.map((dateKey) => {
    const zeroBasisLabel = zeroBasisLabels.get(dateKey);
    return {
      dateKey,
      label: zeroBasisLabel ?? dateKey,
      isLeadIn: zeroBasisLabel !== undefined,
    };
  });

  const rows: SyncedTableRow[] = series.map((s) => {
    const slot = SERIES_STYLE_SLOTS[s.styleIndex];
    return {
      seriesKey: `work-${s.workId}`,
      title: s.title,
      identityDescription: identityDescription(s.styleIndex),
      colorHex: seriesColors[s.styleIndex],
      shape: slot.shape,
      cells: sortedDates.map((dateKey) => multiSeriesCellValue(s, dateKey)),
    };
  });

  return { columns, rows, unitLabel: valueLabel };
}
