import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Maintenance item 2 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): the sticky row-header column had no width cap, so a long
// work title could push the table wide before horizontal scroll even
// started. Row headers must cap width, ellipsis-truncate visually, and
// carry a native `title` attribute with the FULL text for a hover tooltip
// - while the underlying DOM text content stays untruncated (CSS-only
// truncation), so screen-reader/non-hover users still get the full title.
const LONG_TITLE =
  "A Truly Excessive and Overwrought Work Title That Goes On and On and On Beyond Any Reasonable Column Width";

const MODEL: SyncedTableModel = {
  columns: [{ dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false }],
  rows: [{ seriesKey: "work-1", title: LONG_TITLE, cells: [10] }],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: row-header truncation (Maintenance item 2)", () => {
  it("caps the row-header column's width and visually truncates with an ellipsis", () => {
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
    expect(rowHeader.className).toMatch(/max-w-\[150px\]/);
    expect(rowHeader.innerHTML).toMatch(/truncate/);
  });

  it("carries a native title attribute with the full untruncated text for a hover tooltip", () => {
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
    const titledElement = rowHeader.querySelector("[title]") ?? rowHeader;
    expect(titledElement.getAttribute("title")).toBe(LONG_TITLE);
  });

  it("keeps the full title text in the DOM (CSS-only truncation, not a truncated string) for non-hover/AT users", () => {
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
    expect(rowHeader.textContent).toContain(LONG_TITLE);
  });
});
