import { describe, expect, it } from "vitest";
import {
  formatMonthIndex,
  fromMonthIndex,
  monthIndexOf,
  toMonthIndex,
  yearBoundaryMarks,
} from "./monthIndex";

// New shared util (docs/plans/date-range-slider-month-granularity.md §3, D1):
// pure month-index encoding (`year * 12 + (month - 1)`) shared by
// comparisonSelection.ts, DateRangeSlider.tsx, and WorkComparisonSection.tsx.
// Dependency-free and unit-testable without rendering - this file is the
// ONLY test coverage for the raw arithmetic; every other test file that
// touches month indices trusts this module's own correctness rather than
// re-deriving it.
describe("toMonthIndex", () => {
  it("encodes January as year * 12 (month offset 0)", () => {
    expect(toMonthIndex(2026, 1)).toBe(2026 * 12);
  });

  it("encodes December as year * 12 + 11", () => {
    expect(toMonthIndex(2026, 12)).toBe(2026 * 12 + 11);
  });

  it("is monotonic across a year boundary (Dec of year N < Jan of year N+1)", () => {
    expect(toMonthIndex(2025, 12)).toBeLessThan(toMonthIndex(2026, 1));
  });

  it("increases by exactly 1 per month step", () => {
    expect(toMonthIndex(2026, 6) - toMonthIndex(2026, 5)).toBe(1);
  });
});

describe("fromMonthIndex", () => {
  it("round-trips toMonthIndex for January", () => {
    expect(fromMonthIndex(toMonthIndex(2026, 1))).toEqual({ year: 2026, month: 1 });
  });

  it("round-trips toMonthIndex for December", () => {
    expect(fromMonthIndex(toMonthIndex(2026, 12))).toEqual({ year: 2026, month: 12 });
  });

  it("round-trips toMonthIndex for every month of a given year", () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(fromMonthIndex(toMonthIndex(2019, month))).toEqual({ year: 2019, month });
    }
  });
});

describe("monthIndexOf", () => {
  it("parses a full ISO date's YYYY-MM prefix into a month index", () => {
    expect(monthIndexOf("2026-09-15")).toBe(toMonthIndex(2026, 9));
  });

  it("agrees with toMonthIndex for the same year/month", () => {
    expect(monthIndexOf("2020-01-01")).toBe(toMonthIndex(2020, 1));
  });

  it("distinguishes two dates in the same year but different months (the whole point of month granularity)", () => {
    expect(monthIndexOf("2026-01-15")).not.toBe(monthIndexOf("2026-03-01"));
  });

  it("returns NaN for a malformed date string, rather than throwing", () => {
    expect(() => monthIndexOf("not-a-date")).not.toThrow();
    expect(Number.isNaN(monthIndexOf("not-a-date"))).toBe(true);
  });

  it("returns NaN for an empty string, rather than throwing", () => {
    expect(Number.isNaN(monthIndexOf(""))).toBe(true);
  });
});

describe("formatMonthIndex", () => {
  it("formats the short style as 'Mon YYYY'", () => {
    expect(formatMonthIndex(toMonthIndex(2026, 9), "short")).toBe("Sep 2026");
  });

  it("formats the long style as 'Month YYYY'", () => {
    expect(formatMonthIndex(toMonthIndex(2026, 9), "long")).toBe("September 2026");
  });

  it("defaults to the short style when no style is given", () => {
    expect(formatMonthIndex(toMonthIndex(2026, 9))).toBe("Sep 2026");
  });

  it("formats January correctly (month offset 0, an off-by-one risk)", () => {
    expect(formatMonthIndex(toMonthIndex(2024, 1), "short")).toBe("Jan 2024");
  });

  it("formats December correctly (month offset 11)", () => {
    expect(formatMonthIndex(toMonthIndex(2024, 12), "short")).toBe("Dec 2024");
  });

  it("degrades to String(idx) for a NaN index, rather than throwing", () => {
    expect(() => formatMonthIndex(NaN, "short")).not.toThrow();
    expect(formatMonthIndex(NaN, "short")).toBe(String(NaN));
  });

  it("degrades to String(idx) for a wildly out-of-range/invalid index, rather than throwing", () => {
    const invalid = Number.MAX_SAFE_INTEGER;
    expect(() => formatMonthIndex(invalid, "short")).not.toThrow();
  });
});

describe("yearBoundaryMarks", () => {
  it("places a mark at each January index within a single-year span", () => {
    const marks = yearBoundaryMarks(toMonthIndex(2026, 1), toMonthIndex(2026, 12));

    expect(marks).toEqual([{ value: toMonthIndex(2026, 1) }]);
  });

  it("places one mark per January across a multi-year span", () => {
    const marks = yearBoundaryMarks(toMonthIndex(2020, 1), toMonthIndex(2023, 12));

    expect(marks.map((m) => m.value)).toEqual([
      toMonthIndex(2020, 1),
      toMonthIndex(2021, 1),
      toMonthIndex(2022, 1),
      toMonthIndex(2023, 1),
    ]);
  });

  it("includes a January mark even when the span starts mid-year (nearest January at/after min)", () => {
    const marks = yearBoundaryMarks(toMonthIndex(2020, 6), toMonthIndex(2021, 6));

    expect(marks.map((m) => m.value)).toEqual([toMonthIndex(2021, 1)]);
  });

  it("returns an empty array for a degenerate span with no January inside it", () => {
    const marks = yearBoundaryMarks(toMonthIndex(2020, 6), toMonthIndex(2020, 11));

    expect(marks).toEqual([]);
  });

  it("returns an empty array for a single-month span that isn't itself January", () => {
    const marks = yearBoundaryMarks(toMonthIndex(2020, 6), toMonthIndex(2020, 6));

    expect(marks).toEqual([]);
  });

  it("returns exactly one mark for a single-month span that IS January", () => {
    const marks = yearBoundaryMarks(toMonthIndex(2020, 1), toMonthIndex(2020, 1));

    expect(marks).toEqual([{ value: toMonthIndex(2020, 1) }]);
  });

  it("never throws for a min greater than max (degenerate/inverted input)", () => {
    expect(() => yearBoundaryMarks(toMonthIndex(2026, 1), toMonthIndex(2020, 1))).not.toThrow();
  });
});
