import { describe, expect, it } from "vitest";
import { normalizeTableModel } from "./tableOrientation";
import type { SyncedTableModel } from "./syncedTableModel";

// Testing task 3 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.1, §3 item 2): tableOrientation.ts does not exist yet -
// every test below fails at the import, a genuine red for this whole file.
//
// Per §2.1's prose ("Normalizes a SyncedTableModel ... into an
// orientation-agnostic pair of axes"), the normalize step itself does NOT
// take an Orientation - it always produces the same dateAxis/seriesAxis/
// valueAt triple regardless of how the caller later chooses to render rows
// vs columns. This is deliberate: a11y semantics (scope="row" vs
// scope="col") are decided by SyncedDataTable.tsx from the `orientation`
// prop at RENDER time, not baked into this pure model - see that
// component's own orientation.test.tsx. `normalizeTableModel` is this
// Testing stage's own name for the function the plan's prose describes but
// doesn't literally name - Implementation must match it, or flag back if
// wrong (same convention as syncedTableModel.test.ts's header comment).

const SINGLE_SERIES_MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false },
    { dateKey: "2026-01-04", label: "2026-01-04", isLeadIn: false },
    { dateKey: "2014-01-01", label: "Before 2014 (estimated baseline)", isLeadIn: true },
  ],
  rows: [{ seriesKey: "value", title: "Hits", cells: [100, 140, 0], comparablePoints: [] }],
  unitLabel: "Hits",
};

const MULTI_SERIES_MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2026-01-01", label: "2026-01-01", isLeadIn: false },
    { dateKey: "2026-01-08", label: "2026-01-08", isLeadIn: false },
  ],
  rows: [
    {
      seriesKey: "work-1",
      title: "Work A",
      identityDescription: "slate-blue circle marker",
      colorHex: "#727F8C",
      shape: "circle",
      cells: [10, 20],
      comparablePoints: [],
    },
    {
      seriesKey: "work-2",
      title: "Work B",
      identityDescription: "teal square marker",
      colorHex: "#4F7074",
      shape: "square",
      cells: ["—", 5],
      comparablePoints: [],
    },
  ],
  unitLabel: "Hits",
};

describe("normalizeTableModel: dateAxis", () => {
  it("carries one dateAxis entry per column, preserving dateKey/label/isLeadIn", () => {
    const normalized = normalizeTableModel(SINGLE_SERIES_MODEL);

    expect(normalized.dateAxis).toEqual([
      { dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false },
      { dateKey: "2026-01-04", label: "2026-01-04", isLeadIn: false },
      { dateKey: "2014-01-01", label: "Before 2014 (estimated baseline)", isLeadIn: true },
    ]);
  });

  it("preserves column order exactly as given (never re-sorted)", () => {
    const normalized = normalizeTableModel(MULTI_SERIES_MODEL);

    expect(normalized.dateAxis.map((entry) => entry.dateKey)).toEqual(["2026-01-01", "2026-01-08"]);
  });
});

describe("normalizeTableModel: seriesAxis", () => {
  it("carries one seriesAxis entry per row for the multi-series shape, with identity/color/shape", () => {
    const normalized = normalizeTableModel(MULTI_SERIES_MODEL);

    expect(normalized.seriesAxis).toEqual([
      {
        seriesKey: "work-1",
        title: "Work A",
        identityDescription: "slate-blue circle marker",
        colorHex: "#727F8C",
        shape: "circle",
      },
      {
        seriesKey: "work-2",
        title: "Work B",
        identityDescription: "teal square marker",
        colorHex: "#4F7074",
        shape: "square",
      },
    ]);
  });

  it("carries exactly one seriesAxis entry for the single-series (N=1 degenerate) shape, with no identity/color/shape", () => {
    const normalized = normalizeTableModel(SINGLE_SERIES_MODEL);

    expect(normalized.seriesAxis).toHaveLength(1);
    expect(normalized.seriesAxis[0]).toMatchObject({ seriesKey: "value", title: "Hits" });
    expect(normalized.seriesAxis[0].identityDescription).toBeUndefined();
  });
});

describe("normalizeTableModel: valueAt", () => {
  it("looks up a cell by (seriesKey, dateKey), independent of grid position", () => {
    const normalized = normalizeTableModel(MULTI_SERIES_MODEL);

    expect(normalized.valueAt("work-1", "2026-01-01")).toBe(10);
    expect(normalized.valueAt("work-1", "2026-01-08")).toBe(20);
    expect(normalized.valueAt("work-2", "2026-01-08")).toBe(5);
  });

  it("preserves the sparse '—' placeholder value unchanged", () => {
    const normalized = normalizeTableModel(MULTI_SERIES_MODEL);

    expect(normalized.valueAt("work-2", "2026-01-01")).toBe("—");
  });

  it("resolves correctly for the single-series shape", () => {
    const normalized = normalizeTableModel(SINGLE_SERIES_MODEL);

    expect(normalized.valueAt("value", "2026-01-03")).toBe(100);
    expect(normalized.valueAt("value", "2014-01-01")).toBe(0);
  });
});

describe("normalizeTableModel: robustness", () => {
  it("does not throw and returns empty axes for an empty model", () => {
    const empty: SyncedTableModel = { columns: [], rows: [], unitLabel: "Hits" };

    expect(() => normalizeTableModel(empty)).not.toThrow();
    const normalized = normalizeTableModel(empty);
    expect(normalized.dateAxis).toEqual([]);
    expect(normalized.seriesAxis).toEqual([]);
  });
});
