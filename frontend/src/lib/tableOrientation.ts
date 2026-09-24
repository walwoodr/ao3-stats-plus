// Item 2 pure logic - docs/plans/chart-axis-comparison-and-table-
// orientation-batch.md §2.1/§3 item 2. Normalizes a SyncedTableModel (always
// built as columns=dates/rows=series by the existing builders, UNCHANGED)
// into an orientation-agnostic pair of axes. Deliberately does NOT take an
// Orientation itself - a11y semantics (scope="row" vs scope="col") are
// decided by SyncedDataTable.tsx at render time from its own `orientation`
// prop, not baked in here, so both orientations stay correct off one shared
// model.
import type { SyncedTableModel, SyncedTableColumn, SyncedTableRow } from "./syncedTableModel";
import type { MarkerShapeName } from "./seriesStyles";

export type Orientation = "datesAsColumns" | "datesAsRows";

export type DateAxisEntry = SyncedTableColumn;

export interface SeriesAxisEntry {
  seriesKey: string;
  title: string;
  identityDescription?: string;
  colorHex?: string;
  shape?: MarkerShapeName;
}

export interface NormalizedTableModel {
  dateAxis: DateAxisEntry[];
  seriesAxis: SeriesAxisEntry[];
  valueAt: (seriesKey: string, dateKey: string) => number | string | undefined;
}

function toSeriesAxisEntry(row: SyncedTableRow): SeriesAxisEntry {
  return {
    seriesKey: row.seriesKey,
    title: row.title,
    identityDescription: row.identityDescription,
    colorHex: row.colorHex,
    shape: row.shape,
  };
}

export function normalizeTableModel(model: SyncedTableModel): NormalizedTableModel {
  const dateAxis: DateAxisEntry[] = model.columns;
  const seriesAxis: SeriesAxisEntry[] = model.rows.map(toSeriesAxisEntry);

  function valueAt(seriesKey: string, dateKey: string): number | string | undefined {
    const row = model.rows.find((r) => r.seriesKey === seriesKey);
    if (!row) return undefined;
    const columnIndex = model.columns.findIndex((c) => c.dateKey === dateKey);
    if (columnIndex === -1) return undefined;
    return row.cells[columnIndex];
  }

  return { dateAxis, seriesAxis, valueAt };
}
