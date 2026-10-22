// Shared year->month->day grouping model, driving BOTH the chart overlay
// (DateGroupingOverlay.tsx) and the table header (SyncedDataTableHeader.tsx)
// - docs/plans/date-hierarchy-grouping.md §3. Pure, orientation-agnostic, no
// React/Recharts import.
import type { DateAxisEntry } from "./tableOrientation";

export interface DayEntry {
  dateKey: string;
  day: string;
  entry: DateAxisEntry;
}

export interface MonthGroup {
  year: string;
  month: number;
  monthAbbrev: string;
  days: DayEntry[];
  span: number;
}

export interface YearGroup {
  year: string;
  months: MonthGroup[];
  span: number;
}

const MONTH_ABBREVS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface ParsedDateKey {
  year: string;
  month: number;
  monthAbbrev: string;
  day: string;
}

// A malformed dateKey (non-ISO) is routed to a defensive fallback "group"
// keyed by the raw string itself for every tier - never dropped, never
// thrown, always something recognizable on screen (§7/§8). `month` is NaN
// (there is no real month number to report); this Testing stage's own
// concrete translation of the plan's "fallback group keyed by the raw
// string" prose.
function parseDateKey(dateKey: string): ParsedDateKey {
  const match = ISO_DATE_PATTERN.exec(dateKey);
  if (!match) {
    return { year: dateKey, month: NaN, monthAbbrev: dateKey, day: dateKey };
  }
  const [, year, month, day] = match;
  const monthNumber = Number(month);
  return {
    year,
    month: monthNumber,
    monthAbbrev: MONTH_ABBREVS[monthNumber - 1] ?? dateKey,
    day,
  };
}

// Drops a duplicate dateKey, first occurrence wins (§7) - the same rule
// buildDateHierarchy below applies when building the header's tree.
// Exported (TECH_DEBT.md, 2026-09-27 entry: "duplicate-dateKey header/body
// misalignment") so SyncedDataTable.tsx can apply this SAME rule to the
// `columnSlots`/`rowSlots` its <tbody> renders from, rather than those two
// consumers of `dateAxis` silently diverging on whether a duplicate is
// possible - a single source of truth for the dedup rule, not two
// independent (and so far accidentally-matching-by-luck) ones.
export function dedupeDateAxisEntries(entries: DateAxisEntry[]): DateAxisEntry[] {
  const seenDateKeys = new Set<string>();
  const deduped: DateAxisEntry[] = [];
  for (const entry of entries) {
    if (seenDateKeys.has(entry.dateKey)) continue;
    seenDateKeys.add(entry.dateKey);
    deduped.push(entry);
  }
  return deduped;
}

// Groups `entries` STRICTLY by adjacency in their given order (never
// re-sorts - the date axis is already ascending, and the lead-in is
// deliberately first) into a Year -> Month -> Day tree. Duplicate dateKeys
// dedup to a single DayEntry, first occurrence wins (§7, via
// dedupeDateAxisEntries above). The month tier is NEVER collapsed/omitted,
// even for a single-point year (the plan's explicitly corrected flaw) -
// every date decomposes to all three tiers.
export function buildDateHierarchy(entries: DateAxisEntry[]): YearGroup[] {
  const years: YearGroup[] = [];
  let currentYear: YearGroup | null = null;
  let currentMonth: MonthGroup | null = null;

  for (const entry of dedupeDateAxisEntries(entries)) {
    const parsed = parseDateKey(entry.dateKey);
    const dayEntry: DayEntry = { dateKey: entry.dateKey, day: parsed.day, entry };

    const startsNewYear = !currentYear || currentYear.year !== parsed.year;
    if (startsNewYear) {
      currentYear = { year: parsed.year, months: [], span: 0 };
      years.push(currentYear);
      currentMonth = null;
    }

    const startsNewMonth =
      !currentMonth || currentMonth.year !== parsed.year || currentMonth.month !== parsed.month;
    if (startsNewMonth) {
      currentMonth = {
        year: parsed.year,
        month: parsed.month,
        monthAbbrev: parsed.monthAbbrev,
        days: [],
        span: 0,
      };
      currentYear!.months.push(currentMonth);
      currentYear!.span = currentYear!.months.length;
    }

    currentMonth!.days.push(dayEntry);
    currentMonth!.span = currentMonth!.days.length;
  }

  return years;
}
