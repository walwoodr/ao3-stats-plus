import { describe, expect, it } from "vitest";
import {
  buildTrendTableModel,
  buildRatioTableModel,
  buildMultiSeriesTableModel,
} from "./syncedTableModel";
import { SERIES_STYLE_SLOTS } from "./seriesStyles";
import { LIGHT_COLOR_TOKENS } from "./colorTokens";

// Testing tasks T1/T2 (docs/plans/chart-synced-data-table.md §10, §5.2):
// syncedTableModel.ts is the pure, chart-agnostic builder layer that
// converts each chart's own props shape into the shared transposed
// SyncedTableModel (columns = time points, rows = series/metrics) that
// SyncedDataTable.tsx renders. None of these three builders exist yet - the
// whole module is new - so every test below fails at the import with
// "does not provide an export named ..." (a genuine red: the interfaces
// below are this Testing stage's own translation of the plan's §5.2
// TypeScript skeleton into concrete, callable builder signatures, one per
// chart shape, matching the plan's "Three thin builders (one per chart
// shape)" instruction. Implementation must match these signatures, or flag
// back if they turn out to be wrong.
//
// dateKey is always the point's real or synthetic capturedOn (§2.2) - every
// column's identity - so these tests pin dateKey alongside label/isLeadIn
// throughout, not just the display label.

const SPARSE_POINTS = [
  { capturedOn: "2026-01-03", value: 100 },
  { capturedOn: "2026-01-04", value: 140 },
  { capturedOn: "2026-02-20", value: 300 },
];

describe("buildTrendTableModel (single-series, TrendChart shape)", () => {
  it("emits exactly one row with no identity description and the given unit label", () => {
    const model = buildTrendTableModel({ valueLabel: "Hits", points: SPARSE_POINTS });

    expect(model.rows).toHaveLength(1);
    expect(model.rows[0].identityDescription).toBeUndefined();
    expect(model.rows[0].colorHex).toBeUndefined();
    expect(model.rows[0].shape).toBeUndefined();
    expect(model.unitLabel).toBe("Hits");
  });

  it("emits one column per point, in order, keyed and labeled by the real capturedOn date", () => {
    const model = buildTrendTableModel({ valueLabel: "Hits", points: SPARSE_POINTS });

    expect(model.columns).toEqual([
      { dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false },
      { dateKey: "2026-01-04", label: "2026-01-04", isLeadIn: false },
      { dateKey: "2026-02-20", label: "2026-02-20", isLeadIn: false },
    ]);
  });

  it("aligns the single row's cells to points, in order", () => {
    const model = buildTrendTableModel({ valueLabel: "Hits", points: SPARSE_POINTS });

    expect(model.rows[0].cells).toEqual([100, 140, 300]);
  });

  it("labels a leadIn column with the estimated-baseline wording, never the raw ISO date, and gives it isLeadIn: true", () => {
    const model = buildTrendTableModel({
      valueLabel: "Hits",
      points: SPARSE_POINTS,
      leadIn: { capturedOn: "2014-01-01", value: 0 },
    });

    expect(model.columns[0]).toEqual({
      dateKey: "2014-01-01",
      label: "Before 2014 (estimated baseline)",
      isLeadIn: true,
    });
    expect(model.columns.some((c) => c.label === "2014-01-01")).toBe(false);
  });

  it("gives the leadIn column a value of exactly 0 in the row's cells, ordered before the real points", () => {
    const model = buildTrendTableModel({
      valueLabel: "Hits",
      points: SPARSE_POINTS,
      leadIn: { capturedOn: "2014-01-01", value: 0 },
    });

    expect(model.rows[0].cells[0]).toBe(0);
    expect(model.rows[0].cells).toHaveLength(SPARSE_POINTS.length + 1);
  });

  it("produces a single column for a single-point history, not an error", () => {
    const model = buildTrendTableModel({ valueLabel: "Hits", points: [SPARSE_POINTS[0]] });

    expect(model.columns).toHaveLength(1);
    expect(model.rows[0].cells).toEqual([100]);
  });
});

describe("buildRatioTableModel (single-series, RatioChart shape)", () => {
  const SPARSE_RATIO_POINTS = [
    { capturedOn: "2026-01-03", ratio: 0.1 },
    { capturedOn: "2026-01-04", ratio: 0.14 },
    { capturedOn: "2026-02-20", ratio: 0 },
  ];

  it("emits exactly one row with no identity description and a fixed 'Kudos-to-hits ratio' unit label", () => {
    const model = buildRatioTableModel({ points: SPARSE_RATIO_POINTS });

    expect(model.rows).toHaveLength(1);
    expect(model.rows[0].identityDescription).toBeUndefined();
    expect(model.unitLabel).toBe("Kudos-to-hits ratio");
  });

  it("emits one column per point, keyed and labeled by capturedOn", () => {
    const model = buildRatioTableModel({ points: SPARSE_RATIO_POINTS });

    expect(model.columns.map((c) => c.dateKey)).toEqual(["2026-01-03", "2026-01-04", "2026-02-20"]);
  });

  it("renders an explicit ratio of 0 rather than a blank/omitted cell", () => {
    const model = buildRatioTableModel({ points: SPARSE_RATIO_POINTS });

    expect(model.rows[0].cells[2]).toBe(0);
  });

  it("labels a leadIn column with the estimated-baseline wording, never the raw ISO date, value 0", () => {
    const model = buildRatioTableModel({
      points: SPARSE_RATIO_POINTS,
      leadIn: { capturedOn: "2014-01-01", ratio: 0 },
    });

    expect(model.columns[0]).toEqual({
      dateKey: "2014-01-01",
      label: "Before 2014 (estimated baseline)",
      isLeadIn: true,
    });
    expect(model.rows[0].cells[0]).toBe(0);
    expect(model.columns.some((c) => c.label === "2014-01-01")).toBe(false);
  });
});

// Row identity wording ("<colorRole> <shape> marker") is derived from the
// real SERIES_STYLE_SLOTS table (not hardcoded here), mirroring
// MultiSeriesTrendChart.test.tsx's existing legendDescription convention -
// this pins the *format*, not seriesStyles.test.ts's ownership of the exact
// per-slot words.
function identityDescription(styleIndex: number): string {
  const slot = SERIES_STYLE_SLOTS[styleIndex];
  return `${slot.colorRole} ${slot.shape} marker`;
}

const WORK_A = {
  workId: 1,
  title: "Work A",
  styleIndex: 0,
  points: [
    { capturedOn: "2026-01-01", value: 10 },
    { capturedOn: "2026-01-08", value: 20 },
  ],
};

const WORK_B = {
  workId: 2,
  title: "Work B",
  styleIndex: 1,
  // No point on 2026-01-01 - ragged history, the sparse-cell corner case.
  points: [{ capturedOn: "2026-01-08", value: 5 }],
};

describe("buildMultiSeriesTableModel (MultiSeriesTrendChart shape)", () => {
  it("emits one row per selected series, each carrying its identity description, color, and shape", () => {
    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [WORK_A, WORK_B],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]).toMatchObject({
      seriesKey: "work-1",
      title: "Work A",
      identityDescription: identityDescription(0),
      colorHex: LIGHT_COLOR_TOKENS.series[0],
      shape: SERIES_STYLE_SLOTS[0].shape,
    });
    expect(model.rows[1]).toMatchObject({
      seriesKey: "work-2",
      title: "Work B",
      identityDescription: identityDescription(1),
      colorHex: LIGHT_COLOR_TOKENS.series[1],
      shape: SERIES_STYLE_SLOTS[1].shape,
    });
  });

  it("builds the union-date column set across all selected works", () => {
    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [WORK_A, WORK_B],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    expect(model.columns.map((c) => c.dateKey)).toEqual(["2026-01-01", "2026-01-08"]);
  });

  it("renders an explicit '—' for a work with no point at a given union date", () => {
    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [WORK_A, WORK_B],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    // Work B has no point at 2026-01-01 (column index 0).
    expect(model.rows[1].cells[0]).toBe("—");
    // Work A has a real value at every column.
    expect(model.rows[0].cells).toEqual([10, 20]);
  });

  it("collapses multiple works' shared zero-basis fallback date onto one labeled column", () => {
    const fallbackA = {
      workId: 3,
      title: "Work C",
      styleIndex: 2,
      points: [{ capturedOn: "2026-01-01", value: 3 }],
      leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
    };
    const fallbackB = {
      workId: 4,
      title: "Work D",
      styleIndex: 3,
      points: [{ capturedOn: "2026-01-01", value: 4 }],
      leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
    };

    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [fallbackA, fallbackB],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    const zeroColumns = model.columns.filter((c) => c.dateKey === "2018-01-01");
    expect(zeroColumns).toHaveLength(1);
    expect(zeroColumns[0]).toMatchObject({
      label: "Before 2018 (estimated baseline)",
      isLeadIn: true,
    });
  });

  // Maintenance item 3 (chart-synced-data-table.md, post-ship bug batch,
  // 2026-09-23): a work's own accurate publish-date leadIn (isPublishDate:
  // true) gets a column header showing just the date - formatted like every
  // other date column, never the word-label wording - and a "Published (N)"
  // placeholder cell (N = 0 when no real value was ever captured on that
  // exact date). This is distinct from the account-level "estimated
  // baseline" fallback leadIn (isPublishDate: false/omitted), which keeps
  // its existing word-label header and plain-0 cell (see the "collapses...
  // shared zero-basis fallback" test above).
  it("labels a publish-date leadIn column with just the raw date (not word-label text)", () => {
    const withOwnLeadIn = {
      workId: 5,
      title: "Work E",
      styleIndex: 4,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01", isPublishDate: true },
    };

    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [withOwnLeadIn],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    expect(model.columns[0]).toEqual({
      dateKey: "2020-01-01",
      label: "2020-01-01",
      isLeadIn: false,
    });
  });

  it("renders a publish-date leadIn cell as 'Published (0)' when no real value was captured on that date", () => {
    const withOwnLeadIn = {
      workId: 5,
      title: "Work E",
      styleIndex: 4,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01", isPublishDate: true },
    };

    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [withOwnLeadIn],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    expect(model.rows[0].cells[0]).toBe("Published (0)");
  });

  it("renders a publish-date leadIn cell as 'Published (N)' when a real snapshot landed on that exact date", () => {
    const withRealCaptureOnPublishDate = {
      workId: 9,
      title: "Work I",
      styleIndex: 0,
      points: [
        { capturedOn: "2020-01-01", value: 42 },
        { capturedOn: "2026-01-01", value: 100 },
      ],
      leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01", isPublishDate: true },
    };

    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [withRealCaptureOnPublishDate],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    const publishColumnIndex = model.columns.findIndex((c) => c.dateKey === "2020-01-01");
    expect(model.rows[0].cells[publishColumnIndex]).toBe("Published (42)");
  });

  it("keeps the estimated-baseline leadIn's plain word-label header and 0 cell unchanged (not the Published wording)", () => {
    const baselineOnly = {
      workId: 10,
      title: "Work J",
      styleIndex: 0,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: {
        capturedOn: "2018-01-01",
        label: "Before 2018 (estimated baseline)",
        isPublishDate: false,
      },
    };

    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [baselineOnly],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    expect(model.columns[0]).toEqual({
      dateKey: "2018-01-01",
      label: "Before 2018 (estimated baseline)",
      isLeadIn: true,
    });
    expect(model.rows[0].cells[0]).toBe(0);
  });

  // Corner case (plan §6): a fallback slot that coincides with another
  // work's real capture date is NOT "zero-basis-only" - the shared column
  // must show the raw ISO date, matching buildChartData's existing
  // zeroBasisLabels exclusion rule (MultiSeriesTrendChart.buildChartData.
  // test.ts), not mislabel a real capture as a baseline.
  it("prefers the raw ISO date over a baseline label when a fallback slot coincides with another work's real capture date", () => {
    const fallbackWork = {
      workId: 6,
      title: "Work F",
      styleIndex: 0,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
    };
    const realPointOnSameSlot = {
      workId: 7,
      title: "Work G",
      styleIndex: 1,
      points: [{ capturedOn: "2018-01-01", value: 99 }],
    };

    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [fallbackWork, realPointOnSameSlot],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    const sharedColumn = model.columns.find((c) => c.dateKey === "2018-01-01");
    expect(sharedColumn).toMatchObject({ label: "2018-01-01", isLeadIn: false });
  });

  it("carries the model's unitLabel through unchanged (e.g. 'Bookmarks' callers)", () => {
    const model = buildMultiSeriesTableModel({
      valueLabel: "Bookmarks",
      series: [WORK_A],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });

    expect(model.unitLabel).toBe("Bookmarks");
  });

  it("does not throw and returns an empty model for zero series", () => {
    expect(() =>
      buildMultiSeriesTableModel({
        valueLabel: "Hits",
        series: [],
        seriesColors: LIGHT_COLOR_TOKENS.series,
      }),
    ).not.toThrow();

    const model = buildMultiSeriesTableModel({
      valueLabel: "Hits",
      series: [],
      seriesColors: LIGHT_COLOR_TOKENS.series,
    });
    expect(model.rows).toEqual([]);
    expect(model.columns).toEqual([]);
  });
});
