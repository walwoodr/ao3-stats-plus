import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Testing task 8 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.3, §3 item 3, D5, C3b): TrendChart must own a new
// `pinnedDateKey` state alongside the existing `activeDateKey`, wire it into
// SyncedDataTable (pin controls + delta chips) and render a
// PinnedComparisonBar once something is pinned. None of this exists yet -
// every assertion below fails today (no pin buttons, no
// PinnedComparisonBar, no click-to-pin handler on the chart).
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

const POINTS = [
  { capturedOn: "2026-01-03", value: 100 },
  { capturedOn: "2026-01-04", value: 140 },
  { capturedOn: "2026-02-20", value: 300 },
];

describe("TrendChart: pin via table header (§3 item 3, D5)", () => {
  it("shows a PinnedComparisonBar naming the pinned date once its table header's pin control is activated", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />);

    expect(screen.queryByText(/comparing from/i)).not.toBeInTheDocument();

    screen.getByRole("button", { name: /compare from.*2026-01-04/i }).click();

    expect(screen.getByText(/comparing from 2026-01-04/i)).toBeInTheDocument();
  });

  it("clears the pin (bar disappears) when the same header's control is activated again", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />);

    const pinButton = screen.getByRole("button", { name: /compare from.*2026-01-04/i });
    pinButton.click();
    expect(screen.getByText(/comparing from/i)).toBeInTheDocument();

    pinButton.click();
    expect(screen.queryByText(/comparing from/i)).not.toBeInTheDocument();
  });

  it("clears the pin when the PinnedComparisonBar's Clear button is activated", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />);

    screen.getByRole("button", { name: /compare from.*2026-01-04/i }).click();
    expect(screen.getByText(/comparing from/i)).toBeInTheDocument();

    screen.getByRole("button", { name: /clear comparison/i }).click();

    expect(screen.queryByText(/comparing from/i)).not.toBeInTheDocument();
  });

  // C3b: a leadIn date is just as valid a pin target as any real date.
  it("pins the lead-in column just as validly as a real date column (C3b)", () => {
    const leadIn = { capturedOn: "2014-01-01", value: 0 };
    render(<TrendChart title="Total hits" valueLabel="Hits" points={POINTS} leadIn={leadIn} />);

    screen.getByRole("button", { name: /compare from.*before 2014/i }).click();

    expect(screen.getByText(/comparing from before 2014/i)).toBeInTheDocument();
  });
});

describe("TrendChart: pin via clicking a chart point (§3 item 3)", () => {
  installRechartsLayoutPolyfill();

  it("pins the clicked date's column when the chart itself is clicked", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
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

describe("TrendChart: pin and hover are independent states (D5)", () => {
  installRechartsLayoutPolyfill();

  it("hovering a different column never moves the pin off its original date", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />);

    screen.getByRole("button", { name: /compare from.*2026-01-04/i }).click();
    expect(screen.getByText(/comparing from 2026-01-04/i)).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-02-20" }));

    expect(screen.getByText(/comparing from 2026-01-04/i)).toBeInTheDocument();
  });

  it("shows a delta chip in the table once a different column is hovered while pinned", async () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />);

    screen.getByRole("button", { name: /compare from.*2026-01-03/i }).click();
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-01-04" }));

    await waitFor(() => {
      // 140 (hovered, 2026-01-04) - 100 (pinned, 2026-01-03) = +40.
      expect(screen.getByTestId("delta-chip").textContent).toBe("+40");
    });
  });
});
