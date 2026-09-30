// Pure month-index encoding, dependency-free (docs/plans/date-range-slider-
// month-granularity.md, D1). Shared by comparisonSelection.ts,
// DateRangeSlider.tsx, and WorkComparisonSection.tsx so the date-range
// slider can step by month instead of by whole year. The encoding is
// `year * 12 + (month - 1)` - monotonic "months since year 0", so MUI
// Slider's `step={1}` maps to exactly one month and the value is trivially
// invertible via fromMonthIndex.

export function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(idx: number): { year: number; month: number } {
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return { year, month };
}

// Parses a `YYYY-MM` prefix out of an ISO date string. Returns NaN (never
// throws) for a malformed/empty input - callers (filterPointsInWindow) rely
// on NaN comparisons being false to exclude the point, matching today's
// degradation behavior for a bad capturedOn value.
export function monthIndexOf(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return toMonthIndex(year, month);
}

const SHORT_MONTHS = [
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

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Degrades to String(idx) for a NaN/invalid index rather than throwing,
// matching chartTimeAxis.ts's defense-in-depth precedent for unparseable
// dates (plan §5 "Error states").
export function formatMonthIndex(idx: number, style: "short" | "long" = "short"): string {
  const { year, month } = fromMonthIndex(idx);
  const names = style === "long" ? LONG_MONTHS : SHORT_MONTHS;
  const name = names[month - 1];
  if (!Number.isFinite(idx) || !name) return String(idx);
  return `${name} ${year}`;
}

// A mark at each January index within [min, max] inclusive, for MUI's
// `marks` prop - unlabeled, giving year-boundary orientation without the
// visual density of a per-month mark (plan §3, D1).
export function yearBoundaryMarks(min: number, max: number): { value: number }[] {
  if (min > max) return [];
  const marks: { value: number }[] = [];
  const startYear = fromMonthIndex(min).year;
  const endYear = fromMonthIndex(max).year;
  for (let year = startYear; year <= endYear; year += 1) {
    const january = toMonthIndex(year, 1);
    if (january >= min && january <= max) {
      marks.push({ value: january });
    }
  }
  return marks;
}
