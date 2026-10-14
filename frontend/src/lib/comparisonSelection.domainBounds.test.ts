import { describe, expect, it } from "vitest";
import {
  earliestZeroBasisMonthIndex,
  emptyLeadInGap,
  windowEntirelyInsideGap,
  type MonthWindow,
} from "./comparisonSelection";
import type { PerWorkPoint, PerWorkSeries } from "../queries/useStatsForUser";

// Split out of comparisonSelection.test.ts (CODE_STANDARDS.md's 400-line
// `.ts` budget) - same per-concern split convention this project already
// uses for its component test files (WorkComparisonSection.leadIn.test.tsx,
// .caption.test.tsx, etc.). Covers the Maintenance (2026-10-13, item 1) /
// ROADMAP.md "v2 candidates" (confirmed 2026-08-03, amended 2026-08-04)
// domain-bounds pure helpers - see WorkComparisonSection.domainBounds.
// test.tsx for the integration-level (rendered-component) coverage of the
// same fix.
function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function points(...dates: string[]): PerWorkPoint[] {
  return dates.map((capturedOn, index) => ({
    capturedOn,
    hits: index * 10,
    kudos: index,
    comments: 0,
    bookmarks: 0,
    subscriptions: 0,
  }));
}

function work(ao3WorkId: number, capturedOnDates: string[] = []): PerWorkSeries {
  return {
    ao3WorkId,
    title: `Work ${ao3WorkId}`,
    fandoms: "",
    points: points(...capturedOnDates),
    bookmarks: [],
  };
}

// The date-range slider's drag-bounds floor must derive from the CURRENTLY
// SELECTED works' own zero-basis dates, not the account-wide
// earliestPostYear alone - see WorkComparisonSection.tsx's `domain`
// derivation for the integration. `zeroBasisDateOf` is a caller-supplied
// callback so this pure reduction doesn't duplicate WorkComparisonSection's
// own publishedOn-or-earliestPostYear-fallback rule.
describe("earliestZeroBasisMonthIndex", () => {
  it("returns null when no work is selected", () => {
    expect(earliestZeroBasisMonthIndex([], () => "2020-01-01")).toBeNull();
  });

  it("returns null when every selected work resolves to no zero-basis", () => {
    const works = [work(1), work(2)];
    expect(earliestZeroBasisMonthIndex(works, () => null)).toBeNull();
  });

  it("returns the earliest zero-basis month index across selected works", () => {
    const works = [work(1), work(2), work(3)];
    const dates: Record<number, string> = {
      1: "2026-03-01",
      2: "2025-11-01",
      3: "2026-06-01",
    };
    expect(earliestZeroBasisMonthIndex(works, (w) => dates[w.ao3WorkId])).toBe(mi(2025, 11));
  });

  it("ignores works whose zero-basis callback returns null, rather than letting them win the min", () => {
    const works = [work(1), work(2)];
    const dates: Record<number, string | null> = { 1: null, 2: "2026-01-01" };
    expect(earliestZeroBasisMonthIndex(works, (w) => dates[w.ao3WorkId])).toBe(mi(2026, 1));
  });

  it("excludes a malformed zero-basis date (NaN month index) rather than letting it win the min", () => {
    const works = [work(1), work(2)];
    const dates: Record<number, string> = { 1: "not-a-date", 2: "2026-01-01" };
    expect(earliestZeroBasisMonthIndex(works, (w) => dates[w.ao3WorkId])).toBe(mi(2026, 1));
  });
});

// ROADMAP.md "v2 candidates" amendment, 2026-08-04: a window chosen
// entirely inside the gap between every selected work's own lead-in period
// and its first real data would show nothing but flat interpolated lead-in
// lines - no real data to compare.
describe("emptyLeadInGap", () => {
  it("returns null when no selected work has a zero-basis date", () => {
    const works = [work(1, ["2026-01-01"])];
    expect(emptyLeadInGap(works, () => null)).toBeNull();
  });

  it("returns null when no selected work has any real data", () => {
    const works = [work(1)];
    expect(emptyLeadInGap(works, () => "2020-01-01")).toBeNull();
  });

  it("returns null when real data already overlaps the lead-in period (no actual gap)", () => {
    // Published 2020-01, first real data 2020-02 - adjacent, no whole month
    // of real daylight between them.
    const works = [work(1, ["2020-02-01"])];
    expect(emptyLeadInGap(works, () => "2020-01-01")).toBeNull();
  });

  it("returns null when a selected work's own real data starts before another's publish date", () => {
    // Work One already has real data from 2015 on, well before Work Two's
    // 2019 publish date - every selected work does NOT lack data across
    // [2015, 2019], so there's no universal empty gap for the selection.
    const works = [work(1, ["2015-01-01"]), work(2, ["2025-01-01"])];
    const dates: Record<number, string> = { 1: "2010-01-01", 2: "2019-03-01" };
    expect(emptyLeadInGap(works, (w) => dates[w.ao3WorkId])).toBeNull();
  });

  it("returns the gap between the latest zero-basis date and the earliest real date across the selection", () => {
    // Both works' own real data starts AFTER the later (Work Two's)
    // publish date, so every selected work genuinely lacks real data
    // across [2019-03, 2019-07) - a universal gap.
    const works = [work(1, ["2019-07-01"]), work(2, ["2019-09-01"])];
    const dates: Record<number, string> = { 1: "2010-01-01", 2: "2019-03-01" };

    expect(emptyLeadInGap(works, (w) => dates[w.ao3WorkId])).toEqual({
      start: mi(2019, 3),
      end: mi(2019, 7),
    });
  });

  it("requires at least one whole month strictly between the bounds (adjacent months are not a gap)", () => {
    const works = [work(1, ["2020-02-01"])];
    expect(emptyLeadInGap(works, () => "2020-01-01")).toBeNull();

    const worksWithOneMonthGap = [work(1, ["2020-03-01"])];
    expect(emptyLeadInGap(worksWithOneMonthGap, () => "2020-01-01")).toEqual({
      start: mi(2020, 1),
      end: mi(2020, 3),
    });
  });
});

describe("windowEntirelyInsideGap", () => {
  const gap: MonthWindow = { start: mi(2019, 3), end: mi(2019, 9) };

  it("is false when there is no gap at all", () => {
    expect(windowEntirelyInsideGap({ start: mi(2019, 4), end: mi(2019, 5) }, null)).toBe(false);
  });

  it("is true for a window strictly inside the gap", () => {
    expect(windowEntirelyInsideGap({ start: mi(2019, 4), end: mi(2019, 8) }, gap)).toBe(true);
  });

  it("is false for a window that straddles the gap's start edge (still shows real data on one side)", () => {
    expect(windowEntirelyInsideGap({ start: mi(2019, 1), end: mi(2019, 6) }, gap)).toBe(false);
  });

  it("is false for a window that straddles the gap's end edge", () => {
    expect(windowEntirelyInsideGap({ start: mi(2019, 5), end: mi(2019, 12) }, gap)).toBe(false);
  });

  it("is false for a window exactly matching the gap's own bounds (edges are inclusive, not inside)", () => {
    expect(windowEntirelyInsideGap(gap, gap)).toBe(false);
  });
});
