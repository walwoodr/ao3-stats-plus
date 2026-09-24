import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Testing task 10 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.3, §3 item 3, D5, C3a/C3b): mirrors TrendChart.pin.test.
// tsx's wiring coverage for MultiSeriesTrendChart's N-series shape, plus the
// per-row (per-work) delta independence that's specific to N series (one
// work's carried-forward fallback must never affect another work's delta).
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

// Work A: real points on 2026-01-01 and 2026-01-08. Work B: a RAGGED
// history - only a real point on 2026-01-08 (no 2026-01-01 point), so
// hovering 2026-01-01 while pinned at 2026-01-08 (or vice versa) exercises
// per-row independence (C3a: one row's own fallback never leaks into
// another's number).
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
  points: [{ capturedOn: "2026-01-08", value: 5 }],
};

describe("MultiSeriesTrendChart: pin via table header (§3 item 3, D5)", () => {
  it("shows a PinnedComparisonBar naming the pinned date once its table header's pin control is activated", () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

    screen.getByRole("button", { name: /compare from.*2026-01-01/i }).click();

    expect(screen.getByText(/comparing from 2026-01-01/i)).toBeInTheDocument();
  });

  it("clears the pin when the PinnedComparisonBar's Clear button is activated", () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

    screen.getByRole("button", { name: /compare from.*2026-01-01/i }).click();
    screen.getByRole("button", { name: /clear comparison/i }).click();

    expect(screen.queryByText(/comparing from/i)).not.toBeInTheDocument();
  });
});

describe("MultiSeriesTrendChart: pin via clicking a chart point (§3 item 3)", () => {
  installRechartsLayoutPolyfill();

  it("pins the clicked date's column when the chart itself is clicked", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;

    fireEvent.click(wrapper, { clientX: 300, clientY: 120 });

    await waitFor(() => {
      expect(screen.getByText(/comparing from/i)).toBeInTheDocument();
    });
  });
});

describe("MultiSeriesTrendChart: per-row delta independence across N series (C3a)", () => {
  it("gives Work A a real delta and Work B an empty 'no data' cell at the same active column, independently", async () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

    // Pin at Work A's own first point; hover 2026-01-01 too (delta-vs-self
    // for A = 0), but Work B has NO data at/before 2026-01-01 at all.
    screen.getByRole("button", { name: /compare from.*2026-01-01/i }).click();
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-01-01" }));

    await waitFor(() => {
      const workARow = screen.getByRole("row", { name: /work a/i });
      expect(within(workARow).getByTestId("delta-chip").textContent).toBe("0");
    });

    const workBRow = screen.getByRole("row", { name: /work b/i });
    expect(within(workBRow).queryByTestId("delta-chip")).not.toBeInTheDocument();
    expect(workBRow.textContent).toMatch(/no data.*as of 2026-01-01/i);
  });

  it("gives Work A a real delta at 2026-01-08 while Work B (only real point there) gets its own independent delta too", async () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

    screen.getByRole("button", { name: /compare from.*2026-01-01/i }).click();
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-01-08" }));

    await waitFor(() => {
      const workARow = screen.getByRole("row", { name: /work a/i });
      // Work A: 10 (pinned 2026-01-01) -> 20 (hovered 2026-01-08) = +10.
      expect(within(workARow).getByTestId("delta-chip").textContent).toBe("+10");
    });

    // Work B has no data at/before the PINNED date (2026-01-01) at all - so
    // even though it HAS a real value at the hovered date (5), the pinned
    // side is what's missing; per this Testing stage's documented
    // missingDateKey priority (pointComparison.test.ts), the hovered date
    // (2026-01-08) is still what's cited since both are the "no data" case
    // resolved against B's own earliest entry (2026-01-08 itself - AT that
    // date, not before it, so effA is null, effB resolves). This is B's own
    // "no data for the PIN" case, independent of Work A's real delta.
    const workBRow = screen.getByRole("row", { name: /work b/i });
    expect(workBRow.textContent).toMatch(/no data/i);
  });
});

