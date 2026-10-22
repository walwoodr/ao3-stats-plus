import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import * as syncedDataTableHeader from "./SyncedDataTableHeader";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Regression test (TECH_DEBT.md, 2026-09-27 entry: "flattenDateAxisRows runs
// fresh on every render, once per date row"). Under datesAsRows, SyncedDataTable
// previously instantiated DateAxisRowCells once per date row, and each
// instantiation re-flattened the WHOLE hierarchy itself just to read its own
// one row - O(N) work repeated N times, O(N^2) total for N date rows.
// flattenDateAxisRows is now hoisted/called once per render in
// SyncedDataTable.tsx and the result passed to every row instance.
function noop() {}

const THREE_DATE_ROW_MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2026-01-01", label: "2026-01-01", isLeadIn: false },
    { dateKey: "2026-01-08", label: "2026-01-08", isLeadIn: false },
    { dateKey: "2026-01-15", label: "2026-01-15", isLeadIn: false },
  ],
  rows: [
    {
      seriesKey: "work-1",
      title: "Work A",
      cells: [10, 20, 30],
      comparablePoints: [
        { dateKey: "2026-01-01", value: 10 },
        { dateKey: "2026-01-08", value: 20 },
        { dateKey: "2026-01-15", value: 30 },
      ],
    },
  ],
  unitLabel: "Hits",
};

describe("SyncedDataTable: flattenDateAxisRows memoization under datesAsRows (regression, TECH_DEBT.md 2026-09-27)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls flattenDateAxisRows exactly once per render, not once per date row", () => {
    const flattenSpy = vi.spyOn(syncedDataTableHeader, "flattenDateAxisRows");

    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={THREE_DATE_ROW_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        orientation="datesAsRows"
        onOrientationChange={noop}
      />,
    );

    // 3 date rows would previously mean 3 calls (one per DateAxisRowCells
    // instantiation) - this component's single render now calls it once.
    expect(flattenSpy).toHaveBeenCalledTimes(1);
  });
});
