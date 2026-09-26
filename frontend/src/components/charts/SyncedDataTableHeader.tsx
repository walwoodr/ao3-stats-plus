import { buildDateHierarchy, type DayEntry, type YearGroup } from "../../lib/dateHierarchy";
import type { DateAxisEntry, Orientation, SeriesAxisEntry } from "../../lib/tableOrientation";
import {
  DateHeaderCell,
  HEADER_CELL_BASE,
  SeriesHeaderCell,
  STICKY_COLUMN_SHADOW,
} from "./SyncedDataTableCells";

// The 3-tier (Year -> Month -> Day) date-axis header, driven by the shared
// dateHierarchy.ts model (docs/plans/date-hierarchy-grouping.md §4). Split
// from SyncedDataTable.tsx per that plan's Testing-stage-established
// component contract: this file owns BOTH orientations' <thead>-only
// top-header row(s); SyncedDataTable.tsx stays the orchestrator (sync/pin/
// scroll wiring, <tbody> rows). `DateAxisRowCells` (below) is the sibling
// piece for datesAsRows' per-row leading Year?/Month?/Day <th> trio.
const GROUP_CELL_BASE =
  "whitespace-nowrap px-3 py-1 text-center font-mono text-sm text-ink-soft border-b border-ink/12";

export interface SyncedDataTableHeaderProps {
  rowHeaderLabel: string;
  dateAxis: DateAxisEntry[];
  seriesAxis: SeriesAxisEntry[];
  orientation: Orientation;
  activeDateKey: string | null;
  pinnedDateKey: string | null;
  onPinnedDateKeyChange?: (dateKey: string | null) => void;
  notifyActiveDateKeyChange: (dateKey: string | null) => void;
  togglePin: (dateKey: string) => void;
}

const CORNER_CLASS = `${HEADER_CELL_BASE} sticky left-0 z-10 bg-card text-ink-soft ${STICKY_COLUMN_SHADOW}`;

export function SyncedDataTableHeader({
  rowHeaderLabel,
  dateAxis,
  seriesAxis,
  orientation,
  activeDateKey,
  pinnedDateKey,
  onPinnedDateKeyChange,
  notifyActiveDateKeyChange,
  togglePin,
}: SyncedDataTableHeaderProps) {
  const hierarchy = buildDateHierarchy(dateAxis);

  // datesAsRows: the date axis moves to three leading tbody columns
  // (DateAxisRowCells below); the single thead row carries only the corner
  // + series column headers (§4).
  if (orientation === "datesAsRows") {
    return (
      <thead>
        <tr>
          <th scope="col" colSpan={3} className={CORNER_CLASS}>
            <span className="sr-only">{rowHeaderLabel}</span>
          </th>
          {seriesAxis.map((entry) => (
            <SeriesHeaderCell key={entry.seriesKey} entry={entry} as="columnheader" />
          ))}
        </tr>
      </thead>
    );
  }

  const monthGroups = hierarchy.flatMap((year) => year.months);
  const dayEntries = monthGroups.flatMap((month) => month.days);

  return (
    <thead>
      <tr>
        <th scope="col" rowSpan={3} className={CORNER_CLASS}>
          <span className="sr-only">{rowHeaderLabel}</span>
        </th>
        {hierarchy.map((year) => (
          <th key={year.year} scope="colgroup" colSpan={year.span} className={GROUP_CELL_BASE}>
            {year.year}
          </th>
        ))}
      </tr>
      <tr>
        {monthGroups.map((month) => (
          <th
            key={`${month.year}-${month.month}`}
            scope="colgroup"
            colSpan={month.span}
            className={GROUP_CELL_BASE}
          >
            {month.monthAbbrev}
          </th>
        ))}
      </tr>
      <tr>
        {dayEntries.map((day) => (
          <DateHeaderCell
            key={day.dateKey}
            entry={day.entry}
            as="columnheader"
            displayLabel={day.day}
            activeDateKey={activeDateKey}
            pinnedDateKey={pinnedDateKey}
            onPinnedDateKeyChange={onPinnedDateKeyChange}
            notifyActiveDateKeyChange={notifyActiveDateKeyChange}
            togglePin={togglePin}
          />
        ))}
      </tr>
    </thead>
  );
}

interface DateAxisRow {
  day: DayEntry;
  year: string;
  isFirstOfYear: boolean;
  yearRowSpan: number;
  monthAbbrev: string;
  isFirstOfMonth: boolean;
  monthRowSpan: number;
}

// Flattens the hierarchy into one row per DAY (datesAsRows' tbody grain),
// each tagged with whether it's the first row of its year/month group (the
// only row that actually emits that tier's <th>, per standard HTML rowSpan
// pivoting - §4) and that group's total rowSpan (year = every day under it
// across all its months; month = its own day count).
function flattenDateAxisRows(hierarchy: YearGroup[]): DateAxisRow[] {
  const rows: DateAxisRow[] = [];
  hierarchy.forEach((year) => {
    const yearRowSpan = year.months.reduce((sum, month) => sum + month.days.length, 0);
    year.months.forEach((month, monthIndex) => {
      month.days.forEach((day, dayIndex) => {
        rows.push({
          day,
          year: year.year,
          isFirstOfYear: monthIndex === 0 && dayIndex === 0,
          yearRowSpan,
          monthAbbrev: month.monthAbbrev,
          isFirstOfMonth: dayIndex === 0,
          monthRowSpan: month.days.length,
        });
      });
    });
  });
  return rows;
}

export interface DateAxisRowCellsProps {
  hierarchy: YearGroup[];
  rowIndex: number;
  activeDateKey: string | null;
  pinnedDateKey: string | null;
  onPinnedDateKeyChange?: (dateKey: string | null) => void;
  notifyActiveDateKeyChange: (dateKey: string | null) => void;
  togglePin: (dateKey: string) => void;
}

// datesAsRows' per-tbody-row leading date-tier cells: Year?/Month?/Day, only
// the day cell (scope=row) is ALWAYS present - year/month are non-sticky
// plain <th scope=rowgroup> (§4/§9 risk 4's documented triple-sticky-offset
// fallback: the day column alone stays sticky via DateHeaderCell's existing
// STICKY_HEADER_BASE, which carries the sync/pin behavior that must stay
// visible while scrolling; year/month scroll with the body, a deliberate,
// lower-risk choice over fragile cumulative sticky-left offsets).
export function DateAxisRowCells({
  hierarchy,
  rowIndex,
  activeDateKey,
  pinnedDateKey,
  onPinnedDateKeyChange,
  notifyActiveDateKeyChange,
  togglePin,
}: DateAxisRowCellsProps) {
  const rows = flattenDateAxisRows(hierarchy);
  const row = rows[rowIndex];
  if (!row) return null;

  return (
    <>
      {row.isFirstOfYear && (
        <th scope="rowgroup" rowSpan={row.yearRowSpan} className={GROUP_CELL_BASE}>
          {row.year}
        </th>
      )}
      {row.isFirstOfMonth && (
        <th scope="rowgroup" rowSpan={row.monthRowSpan} className={GROUP_CELL_BASE}>
          {row.monthAbbrev}
        </th>
      )}
      <DateHeaderCell
        entry={row.day.entry}
        as="rowheader"
        displayLabel={row.day.day}
        activeDateKey={activeDateKey}
        pinnedDateKey={pinnedDateKey}
        onPinnedDateKeyChange={onPinnedDateKeyChange}
        notifyActiveDateKeyChange={notifyActiveDateKeyChange}
        togglePin={togglePin}
      />
    </>
  );
}
