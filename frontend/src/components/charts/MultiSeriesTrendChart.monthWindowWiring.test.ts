import { describe, expect, it } from "vitest";
import { buildChartData, type SeriesDatum } from "./MultiSeriesTrendChart";
import { filterPointsInWindow } from "../../lib/comparisonSelection";
import { MAX_REAL_AXIS_TICKS, selectDisplayedTicks, toEpoch } from "../../lib/chartTimeAxis";
import type { PerWorkPoint } from "../../queries/useStatsForUser";

// Testing task T6 (docs/plans/date-range-slider-month-granularity.md D3):
// regression guard proving the filter-only integration claim - narrowing a
// work's points via the month-index-aware `filterPointsInWindow` changes
// ONLY which real points reach `buildChartData`/`selectDisplayedTicks`, with
// NO change needed to chartTimeAxis.ts (`selectDisplayedTicks`,
// `MAX_REAL_AXIS_TICKS`) or the tick-selection algorithm itself - the
// round-5 tick-machinery fix stays untouched. This is a genuine end-to-end
// wiring check across comparisonSelection.ts -> MultiSeriesTrendChart's
// buildChartData -> chartTimeAxis's selectDisplayedTicks, independent of any
// single module's own unit tests.
function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function point(capturedOn: string, value: number): PerWorkPoint {
  return { capturedOn, hits: value, kudos: value, comments: 0, bookmarks: 0, subscriptions: 0 };
}

function seriesFrom(points: PerWorkPoint[]): SeriesDatum {
  return {
    workId: 1,
    title: "Work One",
    styleIndex: 0,
    points: points.map((p) => ({ capturedOn: p.capturedOn, value: p.hits })),
  };
}

describe("month-index filtering is transparent to buildChartData/selectDisplayedTicks (D3 guard)", () => {
  it("only the month-index-filtered real points reach buildChartData's rows - no leakage from outside the window", () => {
    const allPoints = [
      point("2019-06-01", 1),
      point("2020-01-15", 2),
      point("2020-06-01", 3),
      point("2021-01-01", 4),
    ];

    const windowed = filterPointsInWindow(allPoints, { start: mi(2020, 1), end: mi(2020, 12) });
    const { rows } = buildChartData([seriesFrom(windowed)]);

    expect(rows.map((r) => r.capturedOn)).toEqual(["2020-01-15", "2020-06-01"]);
  });

  it("selectDisplayedTicks reflects exactly the filtered real epochs, with no residual influence from out-of-window points", () => {
    const allPoints = [
      point("2019-06-01", 1),
      point("2020-01-15", 2),
      point("2020-06-01", 3),
      point("2021-01-01", 4),
    ];

    const windowed = filterPointsInWindow(allPoints, { start: mi(2020, 1), end: mi(2020, 12) });
    const { rows } = buildChartData([seriesFrom(windowed)]);
    const ticks = selectDisplayedTicks(rows.map((r) => ({ xEpoch: r.xEpoch, isLeadIn: false })));

    expect(ticks).toEqual([toEpoch("2020-01-15"), toEpoch("2020-06-01")]);
    expect(ticks).not.toContain(toEpoch("2019-06-01"));
    expect(ticks).not.toContain(toEpoch("2021-01-01"));
  });

  // Regression fence: the round-5 MAX_REAL_AXIS_TICKS sampling cap must
  // still apply identically to a month-index-narrowed set as it does to an
  // unfiltered one - proving chartTimeAxis.ts itself needed zero changes,
  // only its INPUT (the already-filtered point set) changed.
  it("still caps ticks at MAX_REAL_AXIS_TICKS for a dense >6-point month-filtered window", () => {
    const densePoints = Array.from({ length: 12 }, (_, i) =>
      point(`2020-${String(i + 1).padStart(2, "0")}-01`, i + 1),
    );

    const windowed = filterPointsInWindow(densePoints, { start: mi(2020, 1), end: mi(2020, 12) });
    expect(windowed).toHaveLength(12);

    const { rows } = buildChartData([seriesFrom(windowed)]);
    const ticks = selectDisplayedTicks(rows.map((r) => ({ xEpoch: r.xEpoch, isLeadIn: false })));

    expect(ticks.length).toBeLessThanOrEqual(MAX_REAL_AXIS_TICKS);
    // Edges are always kept exact (chartTimeAxis.ts's own documented rule).
    expect(ticks[0]).toBe(toEpoch("2020-01-01"));
    expect(ticks[ticks.length - 1]).toBe(toEpoch("2020-12-01"));
  });

  it("an empty result from filtering (window excludes every point) degrades to an empty tick set, not a throw", () => {
    const allPoints = [point("2019-06-01", 1), point("2019-07-01", 2)];

    const windowed = filterPointsInWindow(allPoints, { start: mi(2025, 1), end: mi(2025, 12) });
    expect(windowed).toEqual([]);

    const { rows } = buildChartData([seriesFrom(windowed)]);
    expect(() =>
      selectDisplayedTicks(rows.map((r) => ({ xEpoch: r.xEpoch, isLeadIn: false }))),
    ).not.toThrow();
    expect(selectDisplayedTicks(rows.map((r) => ({ xEpoch: r.xEpoch, isLeadIn: false })))).toEqual(
      [],
    );
  });
});
