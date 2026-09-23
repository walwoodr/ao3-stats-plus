import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Maintenance item 4 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): the sticky row-header column could leave a visible seam at
// the table's left edge during horizontal scroll (background not reliably
// opaque all the way to the container's edge - a known class of rendering
// artifact with `position: sticky` cells inside a `border-collapse` table).
// Fixed defensively: the scroll container itself carries an explicit
// bg-card (not relying on inherited/ambient background from an ancestor),
// and every sticky cell gets a light right-edge box-shadow, which both
// signals "more scrollable content" AND papers over any hairline gap at the
// sticky/non-sticky boundary.
const MODEL: SyncedTableModel = {
  columns: [{ dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false }],
  rows: [{ seriesKey: "work-1", title: "Work A", cells: [10] }],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: sticky column full-bleed background + scroll shadow (Maintenance item 4)", () => {
  it("gives the scroll container an explicit opaque background, not just an inherited one", () => {
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
    expect(scrollRegion.className).toMatch(/bg-card/);
  });

  it("gives every sticky cell (corner header + row headers) a right-edge scroll shadow", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const stickyCells = table.querySelectorAll(".sticky.left-0");
    expect(stickyCells.length).toBeGreaterThan(0);
    stickyCells.forEach((cell) => {
      expect(cell.className).toMatch(/shadow-\[/);
    });
  });

  it("still renders the row-header's own bg-card so the sticky cell stays opaque", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const rowHeader = screen.getByRole("rowheader");
    expect(rowHeader.className).toMatch(/bg-card/);
  });
});
