import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Maintenance item 6 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): numeric cell values rendered as plain digit strings (e.g.
// "12000") with no thousands separators - add en-US comma grouping via
// toLocaleString() to every numeric cell. Non-numeric cell values (the "—"
// sparse placeholder, "Published (N)" strings) are left exactly as-is.
const MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false },
    { dateKey: "2026-01-04", label: "2026-01-04", isLeadIn: false },
    { dateKey: "2026-01-05", label: "2026-01-05", isLeadIn: false },
  ],
  rows: [{ seriesKey: "value", title: "Hits", cells: [12000, "—", 1234567] }],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: thousands separators on numeric cells (Maintenance item 6)", () => {
  it("renders a numeric cell with en-US comma grouping", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    expect(screen.getByText("12,000")).toBeInTheDocument();
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
    expect(screen.queryByText("12000")).not.toBeInTheDocument();
  });

  it("leaves a non-numeric cell value (the sparse '—' placeholder) unformatted", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
