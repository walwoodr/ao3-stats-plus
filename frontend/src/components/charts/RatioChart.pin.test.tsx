import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// Testing task 9 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.3, §3 item 3, D5, D6): mirrors TrendChart.pin.test.tsx's
// wiring coverage for RatioChart, PLUS the D6-specific check that the
// kudos-to-hits ratio delta is colored by the SAME up=green/down=red rule
// as any other metric - no metric-aware neutral special-case. None of this
// exists yet - every assertion below fails today.
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

const RATIO_POINTS = [
  { capturedOn: "2026-01-03", ratio: 0.1 },
  { capturedOn: "2026-01-04", ratio: 0.14 },
  { capturedOn: "2026-02-20", ratio: 0.02 },
];

describe("RatioChart: pin via table header (§3 item 3, D5)", () => {
  it("shows a PinnedComparisonBar naming the pinned date once its table header's pin control is activated", () => {
    render(<RatioChart title="Kudos/hits" points={RATIO_POINTS} />);

    // fireEvent.click (not a raw element.click()) - confirmed via an
    // isolated repro that a bare .click() does not flush a React state
    // update before the next synchronous assertion runs in this React 19 +
    // jsdom + vitest environment, while fireEvent.click (wrapped in act()
    // by RTL) does.
    fireEvent.click(screen.getByRole("button", { name: /compare from.*2026-01-04/i }));

    expect(screen.getByText(/comparing from 2026-01-04/i)).toBeInTheDocument();
  });

  it("clears the pin when the PinnedComparisonBar's Clear button is activated", () => {
    render(<RatioChart title="Kudos/hits" points={RATIO_POINTS} />);

    fireEvent.click(screen.getByRole("button", { name: /compare from.*2026-01-04/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear comparison/i }));

    expect(screen.queryByText(/comparing from/i)).not.toBeInTheDocument();
  });
});

describe("RatioChart: pin via clicking a chart point (§3 item 3)", () => {
  installRechartsLayoutPolyfill();

  it("pins the clicked date's column when the chart itself is clicked", async () => {
    const { container } = render(<RatioChart title="Kudos/hits" points={RATIO_POINTS} />);

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;

    // A preceding mousemove is required first, with its own effect
    // awaited before the click fires - see TrendChart.pin.test.tsx's
    // identical comment for the full repro-confirmed rationale.
    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });
    await waitFor(() => {
      expect(container.querySelectorAll('[class*="bg-accent/10"]').length).toBeGreaterThan(0);
    });

    fireEvent.click(wrapper, { clientX: 300, clientY: 120 });

    await waitFor(() => {
      expect(screen.getByText(/comparing from/i)).toBeInTheDocument();
    });
  });
});

describe("RatioChart: D6 uniform delta coloring, including the ratio itself", () => {
  it("shows a fractional +delta for a ratio increase, formatted the same way any other metric's delta is (no metric-aware neutral special-case)", async () => {
    render(<RatioChart title="Kudos/hits" points={RATIO_POINTS} />);

    fireEvent.click(screen.getByRole("button", { name: /compare from.*2026-01-03/i }));
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-01-04" }));

    await waitFor(() => {
      // 0.14 (hovered) - 0.1 (pinned) = +0.04.. exact string formatting is
      // this Testing stage's own call (matching deltaLabel's sign-prefix
      // contract in pointComparison.test.ts) - the load-bearing part is the
      // "+" sign and a non-empty, non-neutral chip class, per D6.
      const chip = screen.getByTestId("delta-chip");
      expect(chip.textContent).toMatch(/^\+0\.0?4/);
    });
  });

  it("shows a -delta for a ratio decrease, colored by the same down rule as any other metric (D6, no ratio exception)", async () => {
    render(<RatioChart title="Kudos/hits" points={RATIO_POINTS} />);

    fireEvent.click(screen.getByRole("button", { name: /compare from.*2026-01-04/i }));
    fireEvent.mouseEnter(screen.getByRole("columnheader", { name: "2026-02-20" }));

    await waitFor(() => {
      // 0.02 (hovered) - 0.14 (pinned) = -0.12.
      const chip = screen.getByTestId("delta-chip");
      expect(chip.textContent).toMatch(/^-0\.1?2/);
    });
  });
});
