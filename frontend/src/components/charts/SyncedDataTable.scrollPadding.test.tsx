import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Maintenance (2026-10-13, item 4): the scrollable region
// (`aria-label="<title> data table, scrollable"`) carried `px-4` (padding
// on BOTH sides), stacking an unwanted extra left inset on top of this
// nested data-table box's own left edge - no other element in this
// component relies on that specific left gap (the table's own cells, e.g.
// the sticky row-header column, carry their own independent padding/
// shadow treatment regardless of the scroll container's padding). Fixed to
// `padding-left: 0` on this exact element per direct instruction, keeping
// the existing right/bottom padding (`pr-4`/`pb-4`) - the `<summary>`
// toggle label above it is a deliberately separate element, left
// unchanged, so it no longer visually aligns with the table's first
// column; noted as the accepted tradeoff of this explicit fix.
const MODEL: SyncedTableModel = {
  columns: [{ dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false }],
  rows: [{ seriesKey: "work-1", title: "Work A", cells: [10], comparablePoints: [] }],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: scroll region has no left padding (Maintenance item 4)", () => {
  it("the scrollable region (`<title> data table, scrollable`) has padding-left: 0", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    // jsdom applies no real stylesheet in this test environment (no
    // Tailwind CSS is actually loaded), so the className itself - not
    // getComputedStyle - is the only reliable signal here: neither the
    // combined `px-4` utility nor any standalone `pl-*` utility may be
    // present, since either would apply non-zero left padding.
    const scrollRegion = screen.getByRole("region", { name: /hits data table, scrollable/i });
    expect(scrollRegion.className).not.toMatch(/\bpx-4\b/);
    expect(scrollRegion.className).not.toMatch(/\bpl-\d/);
  });

  it("keeps the existing right and bottom padding - only the left side changes", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const scrollRegion = screen.getByRole("region", { name: /hits data table, scrollable/i });
    expect(scrollRegion.className).toMatch(/\bpr-4\b/);
    expect(scrollRegion.className).toMatch(/\bpb-4\b/);
  });
});
