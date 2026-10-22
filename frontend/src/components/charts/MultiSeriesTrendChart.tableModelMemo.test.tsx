import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import * as syncedTableModel from "../../lib/syncedTableModel";

// Regression test (TECH_DEBT.md, 2026-09-23 entry: "MultiSeriesTrendChart
// rebuilds the full table model on every render"). buildMultiSeriesTableModel
// sorts the union of dates, re-sorts series by latest value, and rebuilds
// every row's cells/comparablePoints - genuine O(series x dates) work that
// previously reran on every render, including every chart-hover
// activeDateKey change (local state on this component, unrelated to
// series/seriesColors/valueLabel - the only inputs the output actually
// depends on). Mirrors ActivePointOverlay.test.tsx/MultiSeriesTrendChart.
// sync.test.tsx's own duplicated Recharts layout polyfill (established
// per-file precedent in this suite, not extracted into a shared helper).
function installRechartsLayoutPolyfill() {
  class ResizeObserverStub {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 600, height: 240 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }

  const originalResizeObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );

  beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: 240,
    });
  });

  afterAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    }
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    }
  });
}

const WORK_A: SeriesDatum = {
  workId: 1,
  title: "Work A",
  styleIndex: 0,
  points: [
    { capturedOn: "2026-01-01", value: 10 },
    { capturedOn: "2026-01-08", value: 20 },
    { capturedOn: "2026-01-15", value: 30 },
  ],
};

const WORK_B: SeriesDatum = {
  workId: 2,
  title: "Work B",
  styleIndex: 1,
  points: [
    { capturedOn: "2026-01-01", value: 2 },
    { capturedOn: "2026-01-08", value: 5 },
    { capturedOn: "2026-01-15", value: 9 },
  ],
};

describe("MultiSeriesTrendChart: tableModel memoization (regression, TECH_DEBT.md 2026-09-23)", () => {
  installRechartsLayoutPolyfill();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not rebuild the table model on a chart-hover activeDateKey change", () => {
    const buildSpy = vi.spyOn(syncedTableModel, "buildMultiSeriesTableModel");

    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);
    expect(buildSpy).toHaveBeenCalledTimes(1);

    // Table-originated hovers over two different date columns, each
    // forcing a real re-render via this component's own activeDateKey
    // state - the previously-unmemoized rebuild would rerun on each one.
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-01-01" }));
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-01-08" }));
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-01-15" }));

    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  it("still rebuilds the table model when series genuinely changes", () => {
    const buildSpy = vi.spyOn(syncedTableModel, "buildMultiSeriesTableModel");

    const { rerender } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A]} />,
    );
    expect(buildSpy).toHaveBeenCalledTimes(1);

    rerender(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

    expect(buildSpy).toHaveBeenCalledTimes(2);
  });
});
