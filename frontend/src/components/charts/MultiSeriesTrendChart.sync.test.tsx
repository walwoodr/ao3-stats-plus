import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Testing tasks T9/T10 (docs/plans/chart-synced-data-table.md §10, §2.3):
// the bidirectional chart<->table sync mechanism on MultiSeriesTrendChart's
// CATEGORICAL capturedOn XAxis shape - the "easy" dateKey-resolution path
// (state.activeLabel IS the capturedOn string directly, §2.3), and the
// richest case for D-B's guide-line-plus-rings treatment: multiple series
// at once, with the sparse-cell skip rule (an overlay ring only for series
// that HAVE a value at the active date, plan §6). See TrendChart.sync.
// test.tsx for the numeric-xValue path and this file's shared EXTERNAL-
// UNVERIFIED note on jsdom's approximated mouse-coordinate resolution.
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
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

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
    HTMLElement.prototype.getBoundingClientRect = function stubbedRect() {
      return {
        left: 0,
        top: 0,
        right: 600,
        bottom: 240,
        width: 600,
        height: 240,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      } as DOMRect;
    };
  });

  afterAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    }
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    }
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });
}

const WORK_A: SeriesDatum = {
  workId: 1,
  title: "Work A",
  styleIndex: 0,
  points: [
    { capturedOn: "2026-01-01", value: 10 },
    { capturedOn: "2026-01-08", value: 20 },
  ],
};

const WORK_B: SeriesDatum = {
  workId: 2,
  title: "Work B",
  styleIndex: 1,
  // No point on 2026-01-01 - the sparse/ragged-history corner case: the
  // overlay must skip Work B's ring at that date rather than fabricate one.
  points: [{ capturedOn: "2026-01-08", value: 5 }],
};

describe("MultiSeriesTrendChart: chart -> table sync (T9, categorical XAxis)", () => {
  installRechartsLayoutPolyfill();

  it("highlights a table column when the pointer moves over the chart, with NO Tooltip element rendered", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    expect(container.querySelector(".recharts-tooltip-wrapper")).toBeNull();

    const table = screen.getByRole("table", { name: /hits/i });
    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (wrapper) {
      fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });
    }

    await waitFor(() => {
      expect(
        within(table)
          .getAllByRole("cell")
          .some((cell) => /bg-accent\/10/.test(cell.className)),
      ).toBe(true);
    });
  });

  it("clears the table highlight when the pointer leaves the chart", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;

    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });
    await waitFor(() => {
      expect(container.querySelectorAll('[class*="bg-accent/10"]').length).toBeGreaterThan(0);
    });

    fireEvent.mouseLeave(wrapper);
    await waitFor(() => {
      expect(container.querySelectorAll('[class*="bg-accent/10"]')).toHaveLength(0);
    });
  });
});

describe("MultiSeriesTrendChart: table -> chart sync (T10, D-B guide line + ringed markers)", () => {
  installRechartsLayoutPolyfill();

  it("rings every series that has a value at the hovered date's column", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-08" });
    fireEvent.mouseEnter(columnHeader);

    // Both Work A and Work B have a value at 2026-01-08.
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-guide-line"]')).toHaveLength(
        1,
      );
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(2);
    });
  });

  // Sparse-cell skip rule (plan §6): the overlay must ring only the
  // series that actually have a value at the active date - Work B has no
  // point at 2026-01-01, so only Work A gets a ring there.
  it("skips the ring for a series with no value at the hovered date (sparse cell)", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-01" });
    fireEvent.mouseEnter(columnHeader);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(1);
    });
  });

  it("clears the guide line and every ring when the column header is no longer hovered", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-08" });
    fireEvent.mouseEnter(columnHeader);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(2);
    });

    fireEvent.mouseLeave(columnHeader);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-guide-line"]')).toHaveLength(
        0,
      );
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(0);
    });
  });

  it("never cross-triggers a highlight on a second, independent chart instance (plan §6)", async () => {
    render(
      <>
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A]} />
        <MultiSeriesTrendChart title="Kudos" valueLabel="Kudos" series={[WORK_A]} />
      </>,
    );

    const hitsTable = screen.getByRole("table", { name: /^hits$/i });
    const kudosTable = screen.getByRole("table", { name: /^kudos$/i });
    const hitsColumnHeader = within(hitsTable).getByRole("columnheader", { name: "2026-01-01" });
    fireEvent.mouseEnter(hitsColumnHeader);

    await waitFor(() => {
      expect(
        within(hitsTable)
          .getAllByRole("cell")
          .some((cell) => /bg-accent\/10/.test(cell.className)),
      ).toBe(true);
    });
    expect(
      within(kudosTable)
        .getAllByRole("cell")
        .some((cell) => /bg-accent\/10/.test(cell.className)),
    ).toBe(false);
  });
});
