import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Testing tasks T3-T5 (docs/plans/chart-synced-data-table.md §10, §5.3-§5.5,
// D-A). SyncedDataTable.tsx does not exist yet, so every test below fails
// at the import - a genuine red for this whole file.
//
// Props shape assumed here (this Testing stage's own translation of §5.3's
// prose into a concrete, controlled component contract - purely controlled,
// per §2.1's "receives activeDateKey + onActiveDateKeyChange, holds no sync
// state" instruction):
//   title: string                                 - matches the aria-label
//   rowHeaderLabel: string                         - corner cell text (§5.3:
//                                                     "Metric" / "Work")
//   model: SyncedTableModel                        - from syncedTableModel.ts
//   activeDateKey: string | null                   - controlled
//   onActiveDateKeyChange: (key: string | null) => void
//   defaultOpen?: boolean                          - D-A, default true

const SINGLE_SERIES_MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false },
    { dateKey: "2026-01-04", label: "2026-01-04", isLeadIn: false },
    { dateKey: "2026-02-20", label: "2026-02-20", isLeadIn: false },
  ],
  rows: [{ seriesKey: "value", title: "Hits", cells: [100, 140, 300] }],
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
    },
    {
      seriesKey: "work-2",
      title: "Work B",
      identityDescription: "teal square marker",
      colorHex: "#4F7074",
      shape: "square",
      cells: ["—", 5],
    },
  ],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: structure and semantics (T3)", () => {
  it("renders a table named by the title prop", () => {
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    expect(screen.getByRole("table", { name: /total hits/i })).toBeInTheDocument();
  });

  it("renders one column-header <th scope=col> per date plus the corner cell", () => {
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /total hits/i });
    const columnHeaders = within(table).getAllByRole("columnheader");
    // corner cell + one per date column.
    expect(columnHeaders).toHaveLength(SINGLE_SERIES_MODEL.columns.length + 1);
    SINGLE_SERIES_MODEL.columns.forEach((column) => {
      expect(within(table).getByText(column.label)).toBeInTheDocument();
    });
  });

  it("renders one row-header <th scope=row> per series, carrying the series title", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders).toHaveLength(2);
    expect(rowHeaders[0].textContent).toContain("Work A");
    expect(rowHeaders[1].textContent).toContain("Work B");
  });

  it("renders every value cell, including the sparse '—' placeholder", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    expect(within(table).getByText("10")).toBeInTheDocument();
    expect(within(table).getByText("20")).toBeInTheDocument();
    expect(within(table).getByText("5")).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
  });

  it("renders the single-series case as exactly one data row (the degenerate N=1 case)", () => {
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /total hits/i });
    expect(within(table).getAllByRole("rowheader")).toHaveLength(1);
    expect(within(table).getByText("Hits")).toBeInTheDocument();
  });

  // D5: the (shape, color) identity that used to live in the sr-only
  // column headers now lives in each row header as visually-hidden text, so
  // colorblind/SR users still get a unique per-series identity.
  it("carries each series' visually-hidden identity description in its row header", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MULTI_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders[0].textContent).toContain("slate-blue circle marker");
    expect(rowHeaders[1].textContent).toContain("teal square marker");
  });
});

describe("SyncedDataTable: table -> chart sync wiring (T4)", () => {
  it("calls onActiveDateKeyChange(dateKey) when a date column header is hovered", () => {
    const onActiveDateKeyChange = vi.fn();
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={onActiveDateKeyChange}
      />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-04" });
    fireEvent.mouseEnter(columnHeader);

    expect(onActiveDateKeyChange).toHaveBeenCalledWith("2026-01-04");
  });

  it("calls onActiveDateKeyChange(null) when the pointer leaves the column header", () => {
    const onActiveDateKeyChange = vi.fn();
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey="2026-01-04"
        onActiveDateKeyChange={onActiveDateKeyChange}
      />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-04" });
    fireEvent.mouseLeave(columnHeader);

    expect(onActiveDateKeyChange).toHaveBeenCalledWith(null);
  });

  // §8: no new forced tab stops, but a column header that DOES receive
  // focus (e.g. a future keyboard affordance, or an assistive technology
  // that moves focus programmatically) must still drive the sync -
  // fireEvent.focus/.blur exercise the handler wiring directly regardless
  // of whether the element is in the natural Tab order.
  it("calls onActiveDateKeyChange(dateKey) on focus and (null) on blur", () => {
    const onActiveDateKeyChange = vi.fn();
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={onActiveDateKeyChange}
      />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-02-20" });
    fireEvent.focus(columnHeader);
    expect(onActiveDateKeyChange).toHaveBeenCalledWith("2026-02-20");

    fireEvent.blur(columnHeader);
    expect(onActiveDateKeyChange).toHaveBeenLastCalledWith(null);
  });

  // §5.4: active-column tint is bg-accent/10 (ink text unchanged, contrast
  // preserved) - pinned literally per the plan's explicit styling spec.
  it("applies the bg-accent/10 active-column tint to the active date's cells when activeDateKey is set (controlled)", () => {
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey="2026-01-04"
        onActiveDateKeyChange={noop}
      />,
    );

    const activeCell = screen.getByText("140").closest("td");
    const inactiveCell = screen.getByText("100").closest("td");
    expect(activeCell?.className).toMatch(/bg-accent\/10/);
    expect(inactiveCell?.className ?? "").not.toMatch(/bg-accent\/10/);
  });

  it("applies no active-column tint anywhere when activeDateKey is null", () => {
    const { container } = render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    expect(container.querySelector('[class*="bg-accent/10"]')).toBeNull();
  });

  it("gives the active column's header a visually distinct treatment from an inactive header", () => {
    render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey="2026-01-04"
        onActiveDateKeyChange={noop}
      />,
    );

    const activeHeader = screen.getByRole("columnheader", { name: "2026-01-04" });
    const inactiveHeader = screen.getByRole("columnheader", { name: "2026-01-03" });
    expect(activeHeader.className).not.toBe(inactiveHeader.className);
  });
});

describe("SyncedDataTable: disclosure (T5, D-A)", () => {
  it("renders a native <details>/<summary> disclosure wrapping the table", () => {
    const { container } = render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("details > summary")).not.toBeNull();
  });

  it("defaults to open when defaultOpen is omitted (D-A default true)", () => {
    const { container } = render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const details = container.querySelector("details");
    expect(details).toHaveProperty("open", true);
  });

  it("honors defaultOpen={false} (the By-Work Bookmarks call site, D-A)", () => {
    const { container } = render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        defaultOpen={false}
      />,
    );

    const details = container.querySelector("details");
    expect(details).toHaveProperty("open", false);
  });

  it("is keyboard-operable: activating the summary toggles the table's visibility", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SyncedDataTable
        title="Total hits"
        rowHeaderLabel="Metric"
        model={SINGLE_SERIES_MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        defaultOpen={false}
      />,
    );

    const details = container.querySelector("details");
    expect(details).toHaveProperty("open", false);

    const summary = container.querySelector("summary") as HTMLElement;
    summary.focus();
    await user.keyboard("{Enter}");

    expect(details).toHaveProperty("open", true);
  });
});
