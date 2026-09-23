import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";
import * as scrollColumnIntoView from "../../lib/scrollColumnIntoView";

// Maintenance item 5 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): when a column becomes highlighted via an EXTERNAL
// (chart-hover) activeDateKey change, the table auto-scrolls to bring it
// into view. A TABLE-originated hover (the user mousing over a column
// header) must NOT also trigger this - that would create a jarring
// self-scroll loop. animateScrollLeft/computeTargetScrollLeft are mocked
// here (already independently unit-tested in scrollColumnIntoView.test.ts,
// including the exact placement math) - this file only exercises
// SyncedDataTable's own self-triggered-suppression wiring.
const MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2026-01-01", label: "2026-01-01", isLeadIn: false },
    { dateKey: "2026-01-02", label: "2026-01-02", isLeadIn: false },
    { dateKey: "2026-01-03", label: "2026-01-03", isLeadIn: false },
    { dateKey: "2026-01-04", label: "2026-01-04", isLeadIn: false },
    { dateKey: "2026-01-05", label: "2026-01-05", isLeadIn: false },
  ],
  rows: [{ seriesKey: "value", title: "Hits", cells: [1, 2, 3, 4, 5] }],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: auto-scroll on externally-triggered activeDateKey (Maintenance item 5)", () => {
  beforeEach(() => {
    vi.spyOn(scrollColumnIntoView, "animateScrollLeft").mockImplementation(() => {});
    vi.spyOn(scrollColumnIntoView, "prefersReducedMotion").mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT auto-scroll when the active column was set by the table's own hover (self-triggered)", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    const columnHeader = document.querySelector('[data-date-key="2026-01-03"]') as HTMLElement;
    fireEvent.mouseEnter(columnHeader);

    expect(scrollColumnIntoView.animateScrollLeft).not.toHaveBeenCalled();
  });

  it("auto-scrolls when activeDateKey changes from an EXTERNAL source (chart hover), not table hover", () => {
    const { rerender, container } = render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    // Simulates the parent chart component setting activeDateKey from its
    // own onMouseMove handler - a prop change with no preceding table-side
    // mouseEnter/focus event on this render.
    rerender(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey="2026-01-04"
        onActiveDateKeyChange={noop}
      />,
    );

    expect(scrollColumnIntoView.animateScrollLeft).toHaveBeenCalledTimes(1);
    const call = vi.mocked(scrollColumnIntoView.animateScrollLeft).mock.calls[0][0];
    expect(call.container).toBe(container.querySelector('[role="region"]'));
    expect(typeof call.targetScrollLeft).toBe("number");
  });

  it("does not auto-scroll again for a subsequent table-originated hover after an external scroll already happened", () => {
    const { rerender } = render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    rerender(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey="2026-01-04"
        onActiveDateKeyChange={noop}
      />,
    );
    expect(scrollColumnIntoView.animateScrollLeft).toHaveBeenCalledTimes(1);

    const columnHeader = document.querySelector('[data-date-key="2026-01-02"]') as HTMLElement;
    fireEvent.mouseEnter(columnHeader);

    expect(scrollColumnIntoView.animateScrollLeft).toHaveBeenCalledTimes(1);
  });

  it("passes prefersReducedMotion() through to animateScrollLeft", () => {
    vi.mocked(scrollColumnIntoView.prefersReducedMotion).mockReturnValue(true);
    const { rerender } = render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    rerender(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Metric"
        model={MODEL}
        activeDateKey="2026-01-04"
        onActiveDateKeyChange={noop}
      />,
    );

    const call = vi.mocked(scrollColumnIntoView.animateScrollLeft).mock.calls[0][0];
    expect(call.prefersReducedMotion).toBe(true);
  });
});
