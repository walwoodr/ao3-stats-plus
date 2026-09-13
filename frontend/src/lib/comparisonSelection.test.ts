import { describe, expect, it } from "vitest";
import {
  addWork,
  clampWindow,
  deselectAllInFandom,
  filterPointsInWindow,
  MAX_SELECTED_WORKS,
  removeWork,
  selectAllInFandom,
  shouldShowRangeSlider,
  unionCapturedOnDates,
  type YearWindow,
} from "./comparisonSelection";
import type { PerWorkPoint, PerWorkSeries } from "../queries/useStatsForUser";

// comparisonSelection.ts is the pure logic layer WorkComparisonSection wires
// up to local useState - kept pure and dependency-free so it's unit-testable
// without rendering (per the plan's "State management" section).
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

describe("comparisonSelection: MAX_SELECTED_WORKS", () => {
  it("is exactly 10, per the plan's cap raise (docs/plans/usds-dataviz-color-scheme.md)", () => {
    expect(MAX_SELECTED_WORKS).toBe(10);
  });
});

describe("addWork / removeWork", () => {
  it("adds a work id to an empty selection", () => {
    expect(addWork([], 1)).toEqual([1]);
  });

  it("appends in add-order (order drives stable style assignment)", () => {
    expect(addWork(addWork([], 1), 2)).toEqual([1, 2]);
  });

  it("never double-adds a work already in the selection", () => {
    expect(addWork([1, 2], 1)).toEqual([1, 2]);
  });

  it("refuses to add an 11th work once the 10-work cap is reached", () => {
    const atCap = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    expect(addWork(atCap, 11)).toEqual(atCap);
  });

  it("removes a work id from the selection", () => {
    expect(removeWork([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("is a no-op removing a work id that isn't selected", () => {
    expect(removeWork([1, 2], 99)).toEqual([1, 2]);
  });

  it("removing then re-adding preserves add-order semantics (goes to the end, not its old slot)", () => {
    const afterRemove = removeWork([1, 2, 3], 1);
    expect(addWork(afterRemove, 1)).toEqual([2, 3, 1]);
  });
});

describe("selectAllInFandom", () => {
  it("adds every work in the fandom when there is room and none are already selected", () => {
    const result = selectAllInFandom([], [10, 20, 30]);

    expect(result.selectedIds).toEqual([10, 20, 30]);
    expect(result.addedCount).toBe(3);
    expect(result.requestedCount).toBe(3);
  });

  it("never double-adds works already selected via an overlapping fandom", () => {
    const result = selectAllInFandom([10], [10, 20, 30]);

    expect(result.selectedIds).toEqual([10, 20, 30]);
    expect(result.addedCount).toBe(2);
    expect(result.requestedCount).toBe(3);
  });

  it("truncates additions at the 10-work cap and reports how many were actually added vs requested", () => {
    const result = selectAllInFandom([1, 2, 3, 4, 5, 6, 7, 8, 9], [100, 200, 300]);

    expect(result.selectedIds).toHaveLength(MAX_SELECTED_WORKS);
    expect(result.selectedIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(result.addedCount).toBe(1);
    expect(result.requestedCount).toBe(3);
  });

  it("adds nothing (addedCount 0) when already at the cap, without throwing", () => {
    const atCap = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const result = selectAllInFandom(atCap, [100, 200]);

    expect(result.selectedIds).toEqual(atCap);
    expect(result.addedCount).toBe(0);
    expect(result.requestedCount).toBe(2);
  });

  it("preserves existing selection order and appends new additions after it", () => {
    const result = selectAllInFandom([5, 3], [1, 2]);

    expect(result.selectedIds).toEqual([5, 3, 1, 2]);
  });
});

// New pure helper (docs/plans/work-comparison-picker-redesign.md §0.4/§5,
// requirement 8's "full fandom -> deselect all" half of the fandom-header
// tri-state semantics). Existing addWork/removeWork/selectAllInFandom are
// untouched - this composes removeWork semantics over a fandom's id set.
describe("deselectAllInFandom", () => {
  it("removes exactly the fandom's ids from the selection", () => {
    expect(deselectAllInFandom([1, 2, 3], [1, 2])).toEqual([3]);
  });

  it("preserves the relative order of the ids that remain", () => {
    expect(deselectAllInFandom([5, 1, 2, 3], [1, 3])).toEqual([5, 2]);
  });

  it("is a no-op when none of the fandom's ids are currently selected", () => {
    expect(deselectAllInFandom([1, 2], [99, 100])).toEqual([1, 2]);
  });

  it("never removes an id outside the given fandom's id set (other selections untouched)", () => {
    const result = deselectAllInFandom([1, 2, 3, 4], [2]);

    expect(result).toEqual([1, 3, 4]);
    expect(result).toContain(1);
    expect(result).toContain(4);
  });

  it("returns an empty array when every selected id belongs to the fandom", () => {
    expect(deselectAllInFandom([1, 2], [1, 2])).toEqual([]);
  });

  it("is a no-op on an empty selection", () => {
    expect(deselectAllInFandom([], [1, 2])).toEqual([]);
  });
});

describe("unionCapturedOnDates", () => {
  it("returns an empty array when no works are selected", () => {
    expect(unionCapturedOnDates([])).toEqual([]);
  });

  // Regression fence (docs/plans/per-work-zero-basis-dates.md, Testing
  // task 7 / "Decoupling from the date-range slider"): zero-basis dates are
  // explicitly kept OUT of this union - it must only ever look at each
  // work's `points`, never a `publishedOn` field, so adding that field to
  // PerWorkSeries can't silently widen the slider gate or the domain this
  // function ultimately feeds. Same works, same points, differing only in
  // publishedOn -> identical union.
  it("is unaffected by a work's publishedOn - only real capture dates ever enter the union", () => {
    const withoutPublishDates = unionCapturedOnDates([
      work(1, ["2026-01-01", "2026-01-08"]),
      work(2, ["2026-01-08"]),
    ]);
    const withPublishDates = unionCapturedOnDates([
      { ...work(1, ["2026-01-01", "2026-01-08"]), publishedOn: "2010-01-01" },
      { ...work(2, ["2026-01-08"]), publishedOn: "2005-06-01" },
    ]);

    expect(withPublishDates).toEqual(withoutPublishDates);
    // None of the (much earlier) publishedOn years leak into the union.
    expect(
      withPublishDates.some((date) => date.startsWith("2010") || date.startsWith("2005")),
    ).toBe(false);
  });

  it("returns an empty array for works with no points, without throwing (malformed/empty points corner case)", () => {
    expect(unionCapturedOnDates([work(1, []), work(2, [])])).toEqual([]);
  });

  it("unions capture dates across all selected works", () => {
    const works = [work(1, ["2026-01-01", "2026-01-08"]), work(2, ["2026-01-08", "2026-01-15"])];

    expect(unionCapturedOnDates(works)).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });

  it("dedupes a date shared by multiple works rather than counting it twice", () => {
    const works = [work(1, ["2026-01-08"]), work(2, ["2026-01-08"])];

    expect(unionCapturedOnDates(works)).toHaveLength(1);
  });

  it("returns dates in ascending order regardless of per-work input order", () => {
    const works = [work(1, ["2026-03-01"]), work(2, ["2026-01-01", "2026-02-01"])];

    expect(unionCapturedOnDates(works)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("shouldShowRangeSlider (the >2 union-points gate)", () => {
  it("is false for 0 union dates", () => {
    expect(shouldShowRangeSlider([])).toBe(false);
  });

  it("is false for exactly 2 union dates (boundary - not '>2')", () => {
    expect(shouldShowRangeSlider(["2026-01-01", "2026-01-08"])).toBe(false);
  });

  it("is true for exactly 3 union dates (boundary - '>2' means >= 3)", () => {
    expect(shouldShowRangeSlider(["2026-01-01", "2026-01-08", "2026-01-15"])).toBe(true);
  });

  it("is true for more than 3 union dates", () => {
    expect(shouldShowRangeSlider(["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"])).toBe(
      true,
    );
  });
});

describe("clampWindow", () => {
  const bounds: YearWindow = { start: 2014, end: 2026 };

  it("passes through a window already within bounds with start <= end", () => {
    expect(clampWindow({ start: 2018, end: 2022 }, bounds)).toEqual({ start: 2018, end: 2022 });
  });

  it("clamps a start below the minimum up to the minimum", () => {
    expect(clampWindow({ start: 2000, end: 2020 }, bounds)).toEqual({ start: 2014, end: 2020 });
  });

  it("clamps an end above the maximum down to the maximum", () => {
    expect(clampWindow({ start: 2018, end: 2099 }, bounds)).toEqual({ start: 2018, end: 2026 });
  });

  it("clamps both start and end when both are out of bounds", () => {
    expect(clampWindow({ start: 1990, end: 2099 }, bounds)).toEqual({ start: 2014, end: 2026 });
  });

  it("resolves a crossed-over window (start > end) so start never exceeds end", () => {
    const result = clampWindow({ start: 2022, end: 2018 }, bounds);

    expect(result.start).toBeLessThanOrEqual(result.end);
  });

  it("resolves a crossed-over window by clamping end up to start (no dragging start past end)", () => {
    expect(clampWindow({ start: 2022, end: 2018 }, bounds)).toEqual({ start: 2022, end: 2022 });
  });
});

describe("filterPointsInWindow", () => {
  const pts = points("2018-06-01", "2020-01-01", "2022-12-31", "2026-01-01");

  it("returns only points whose capturedOn year falls within [start, end] inclusive", () => {
    const result = filterPointsInWindow(pts, { start: 2020, end: 2022 });

    expect(result.map((p) => p.capturedOn)).toEqual(["2020-01-01", "2022-12-31"]);
  });

  it("includes points exactly on the window boundary years", () => {
    const result = filterPointsInWindow(pts, { start: 2018, end: 2018 });

    expect(result.map((p) => p.capturedOn)).toEqual(["2018-06-01"]);
  });

  it("returns an empty array when the window excludes every point (work stays selectable, just has no in-window points)", () => {
    const result = filterPointsInWindow(pts, { start: 1990, end: 1995 });

    expect(result).toEqual([]);
  });

  it("returns an empty array, without throwing, for a work with no points", () => {
    expect(filterPointsInWindow([], { start: 2018, end: 2026 })).toEqual([]);
  });

  it("does not mutate the input points array", () => {
    const original = [...pts];
    filterPointsInWindow(pts, { start: 2020, end: 2020 });
    expect(pts).toEqual(original);
  });
});
