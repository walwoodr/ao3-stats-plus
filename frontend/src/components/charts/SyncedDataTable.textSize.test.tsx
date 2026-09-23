import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Maintenance item 7 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): the table's text was pinned at text-xs (12px), smaller than
// anything MASTER.md's documented type scale actually names (its scale
// starts at text-sm/14px for captions/labels, design-system/ao3-stats-plus/
// MASTER.md's Typography section) - bump both header and data cells up one
// step to text-sm, ~1.2x the prior size and the nearest existing scale step.
const MODEL: SyncedTableModel = {
  columns: [{ dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false }],
  rows: [{ seriesKey: "value", title: "Hits", cells: [100] }],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: text size bumped to text-sm (Maintenance item 7)", () => {
  it("renders column headers at text-sm, not text-xs", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-03" });
    expect(columnHeader.className).toMatch(/text-sm/);
    expect(columnHeader.className).not.toMatch(/text-xs/);
  });

  it("renders data cells at text-sm, not text-xs", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const dataCell = screen.getByText("100").closest("td");
    expect(dataCell?.className).toMatch(/text-sm/);
    expect(dataCell?.className ?? "").not.toMatch(/text-xs/);
  });

  it("renders the row-header (series title) at text-sm, not text-xs", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const rowHeader = screen.getByRole("rowheader");
    expect(rowHeader.className).toMatch(/text-sm/);
    expect(rowHeader.className).not.toMatch(/text-xs/);
  });
});
