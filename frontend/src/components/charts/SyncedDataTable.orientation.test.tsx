import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Testing task 5 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.1/§2.2, §3 item 2, §8): SyncedDataTable.tsx must grow an
// `orientation` + `onOrientationChange` pair (both optional, defaulting to
// today's `"datesAsColumns"` behavior so every existing call site/test stays
// valid unmodified - a Testing-stage backward-compatibility choice, since
// the plan doesn't pin these as required props) and render from
// tableOrientation.ts's normalized axes instead of the hardcoded columns=
// dates/rows=series loop. None of this exists yet - every assertion below
// that depends on `orientation="datesAsRows"` or the toggle control fails
// today.
//
// This file complements (does not duplicate) the existing SyncedDataTable.
// test.tsx suite, which already locks down the DEFAULT `datesAsColumns`
// shape - see this file's own comment on that scope decision in the
// Testing-stage report.
const MULTI_SERIES_MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2014-01-01", label: "Before 2014 (estimated baseline)", isLeadIn: true },
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
      cells: [0, 10, 20],
      comparablePoints: [
        { dateKey: "2014-01-01", value: 0 },
        { dateKey: "2026-01-01", value: 10 },
        { dateKey: "2026-01-08", value: 20 },
      ],
    },
    {
      seriesKey: "work-2",
      title: "Work B",
      identityDescription: "teal square marker",
      colorHex: "#4F7074",
      shape: "square",
      cells: ["—", "—", 5],
      comparablePoints: [{ dateKey: "2026-01-08", value: 5 }],
    },
  ],
  unitLabel: "Hits",
};

const SINGLE_SERIES_MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false },
    { dateKey: "2026-01-04", label: "2026-01-04", isLeadIn: false },
  ],
  rows: [
    {
      seriesKey: "value",
      title: "Hits",
      cells: [100, 140],
      comparablePoints: [
        { dateKey: "2026-01-03", value: 100 },
        { dateKey: "2026-01-04", value: 140 },
      ],
    },
  ],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: orientation toggle control (§2.2/§3 item 2)", () => {
  it("renders a control that names the current orientation state when onOrientationChange is provided", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        orientation="datesAsColumns"
        onOrientationChange={noop}
      />,
    );

    // getAllByText (not getByText): the toggle legitimately renders TWO
    // buttons ("Dates across" AND "Dates down") that both independently
    // match this broad OR-regex - getByText's strict single-match
    // semantics would throw on that, even though it's the intended,
    // required two-button design (locked down by TableOrientationToggle.
    // test.tsx's own suite and this same file's next test).
    expect(screen.getAllByText(/across|down|dates/i).length).toBeGreaterThan(0);
  });

  it("calls onOrientationChange with the flipped value when the INACTIVE toggle option is activated", async () => {
    const onOrientationChange = vi.fn();
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        orientation="datesAsColumns"
        onOrientationChange={onOrientationChange}
      />,
    );

    // The embedded toggle is TableOrientationToggle.tsx, whose own locked
    // contract no-ops a click on the ALREADY-active option (the standard
    // segmented-control/toggle-group convention) - so this test targets
    // the currently-INACTIVE "Dates down" button specifically, rather than
    // an arbitrary toggleButtons[0] that could resolve to the active one.
    fireEvent.click(screen.getByRole("button", { name: /dates down/i }));

    expect(onOrientationChange).toHaveBeenCalledWith("datesAsRows");
  });

  it("does not call onOrientationChange when the already-ACTIVE toggle option is clicked again", () => {
    const onOrientationChange = vi.fn();
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        orientation="datesAsColumns"
        onOrientationChange={onOrientationChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dates across/i }));

    expect(onOrientationChange).not.toHaveBeenCalled();
  });

  it("renders no orientation toggle at all when onOrientationChange is omitted (backward compatible)", () => {
    const { container } = render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    expect(container.textContent).not.toMatch(/dates across|dates down/i);
  });
});

describe("SyncedDataTable: datesAsRows orientation - multi-series (§3 item 2)", () => {
  function renderFlipped() {
    return render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        orientation="datesAsRows"
        onOrientationChange={noop}
      />,
    );
  }

  it("renders one row per DATE (rowheader), including the lead-in row, and one column per SERIES (columnheader)", () => {
    renderFlipped();

    const table = screen.getByRole("table", { name: /hits/i });
    const rowHeaders = within(table).getAllByRole("rowheader");
    const columnHeaders = within(table).getAllByRole("columnheader");

    expect(rowHeaders.map((el) => el.textContent)).toEqual([
      expect.stringContaining("Before 2014"),
      expect.stringContaining("2026-01-01"),
      expect.stringContaining("2026-01-08"),
    ]);
    // corner cell + one per series.
    expect(columnHeaders).toHaveLength(3);
  });

  it("moves each series' identity description to its (now column) header", () => {
    renderFlipped();

    const table = screen.getByRole("table", { name: /hits/i });
    const columnHeaders = within(table).getAllByRole("columnheader");
    const headerText = columnHeaders.map((el) => el.textContent ?? "").join(" | ");

    expect(headerText).toContain("Work A");
    expect(headerText).toContain("slate-blue circle marker");
    expect(headerText).toContain("Work B");
    expect(headerText).toContain("teal square marker");
  });

  it("places each value at its transposed (date-row x series-column) position, not just anywhere in the table", () => {
    renderFlipped();

    const table = screen.getByRole("table", { name: /hits/i });
    const rows = within(table).getAllByRole("row");
    // header row, "Before 2014" row, "2026-01-01" row, "2026-01-08" row.
    expect(rows).toHaveLength(4);

    const jan1Cells = within(rows[2]).getAllByRole("cell");
    const jan8Cells = within(rows[3]).getAllByRole("cell");
    // column order is Work A then Work B (series order unchanged by the
    // flip) - Work A=10/Work B="—" on 2026-01-01, Work A=20/Work B=5 on
    // 2026-01-08. This only holds if values are genuinely transposed, not
    // merely present somewhere in the table.
    expect(jan1Cells.map((cell) => cell.textContent)).toEqual(["10", "—"]);
    expect(jan8Cells.map((cell) => cell.textContent)).toEqual(["20", "5"]);
  });

  it("gives DATE rowheaders scope=row and SERIES columnheaders scope=col, matching each header's actual (transposed) content (accessible scope swap, §8)", () => {
    renderFlipped();

    const table = screen.getByRole("table", { name: /hits/i });
    const dateRowHeader = within(table).getByRole("rowheader", { name: /2026-01-08/ });
    expect(dateRowHeader).toHaveAttribute("scope", "row");

    const seriesColumnHeader = within(table).getByRole("columnheader", { name: /work a/i });
    expect(seriesColumnHeader).toHaveAttribute("scope", "col");
  });

  it("applies the active-date tint to every cell in that date's ROW (both series' cells), not a column", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey="2026-01-08"
        onActiveDateKeyChange={noop}
        orientation="datesAsRows"
        onOrientationChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const rows = within(table).getAllByRole("row");
    // The 2026-01-08 row is the last one (index 3) - both its cells (Work
    // A=20, Work B=5) must be tinted; the OTHER rows' cells must not be.
    const activeRowCells = within(rows[3]).getAllByRole("cell");
    const otherRowCells = within(rows[2]).getAllByRole("cell");

    activeRowCells.forEach((cell) => expect(cell.className).toMatch(/bg-accent\/10/));
    otherRowCells.forEach((cell) => expect(cell.className ?? "").not.toMatch(/bg-accent\/10/));
  });
});

describe("SyncedDataTable: datesAsRows orientation - single series (§3 item 2)", () => {
  it("renders dates down the side as rows, and exactly one value column headed by the metric title", () => {
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        orientation="datesAsRows"
        onOrientationChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /total hits/i });
    const rowHeaders = within(table).getAllByRole("rowheader");
    const columnHeaders = within(table).getAllByRole("columnheader");

    expect(rowHeaders.map((el) => el.textContent)).toEqual(["2026-01-03", "2026-01-04"]);
    // corner + exactly one series column.
    expect(columnHeaders).toHaveLength(2);
    expect(within(table).getByText("100")).toBeInTheDocument();
    expect(within(table).getByText("140")).toBeInTheDocument();
  });
});

describe("SyncedDataTable: sync interaction still keys off dateKey under datesAsRows (item 2<->3 dependency)", () => {
  it("calls onActiveDateKeyChange(dateKey) when a date ROW header is hovered (not a column)", () => {
    const onActiveDateKeyChange = vi.fn();
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={onActiveDateKeyChange}
        orientation="datesAsRows"
        onOrientationChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const dateRowHeader = within(table)
      .getAllByRole("rowheader")
      .find((el) => el.textContent?.includes("2026-01-08"));
    expect(dateRowHeader).toBeDefined();
    if (dateRowHeader) {
      // fireEvent.mouseEnter (not a raw element.dispatchEvent) - confirmed
      // via an isolated repro that a bare dispatched "mouseenter" event
      // does not trigger React's synthetic onMouseEnter handler in this
      // React 19 + jsdom + vitest environment, while fireEvent.mouseEnter
      // (used by every other hover-sync test in this codebase) does.
      fireEvent.mouseEnter(dateRowHeader);
    }

    expect(onActiveDateKeyChange).toHaveBeenCalledWith("2026-01-08");
  });
});
