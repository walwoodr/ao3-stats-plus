import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// Testing task 9 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §3 item 4, D7): mirrors TrendChart.timeAxis.test.tsx exactly
// for RatioChart's identical numeric-xValue chart shape - see that file's
// header comment for the full rationale, including the required §3 item 4
// point 4 runtime proportional-spacing assertion.
function installRechartsSizePolyfill() {
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

function realPointCxs(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('circle[r="3.5"]')).map((circle) =>
    Number(circle.getAttribute("cx")),
  );
}

function leadInCx(container: HTMLElement): number {
  const circle = container.querySelector('circle[r="4"]');
  if (!circle) throw new Error("expected a lead-in dot");
  return Number(circle.getAttribute("cx"));
}

describe("RatioChart: real elapsed-time x-axis (item 4, D7)", () => {
  installRechartsSizePolyfill();

  it("spaces two points 20 days apart roughly 10x as far as two points 2 days apart (proportional to elapsed time)", () => {
    const points = [
      { capturedOn: "2026-01-01", ratio: 0.1 },
      { capturedOn: "2026-01-03", ratio: 0.12 },
      { capturedOn: "2026-01-23", ratio: 0.2 },
    ];

    const { container } = render(<RatioChart title="Kudos/hits" points={points} />);

    const cxs = realPointCxs(container);
    const shortGap = cxs[1] - cxs[0];
    const longGap = cxs[2] - cxs[1];

    expect(shortGap).toBeGreaterThan(0);
    expect(longGap / shortGap).toBeGreaterThan(6);
    expect(longGap / shortGap).toBeLessThan(14);
  });
});

describe("RatioChart: bounded synthetic lead-in offset (item 4 point 2)", () => {
  installRechartsSizePolyfill();

  // Regression fence, not a red-today assertion - see TrendChart.timeAxis.
  // test.tsx's identical case for why (today's ordinal axis already
  // trivially satisfies "bounded").
  it("places the estimated-baseline lead-in strictly before the first real point, with a BOUNDED gap even when the raw calendar gap is huge (~10 years)", () => {
    const points = [
      { capturedOn: "2026-01-01", ratio: 0.1 },
      { capturedOn: "2026-01-11", ratio: 0.12 },
    ];
    const leadIn = { capturedOn: "2016-01-01", ratio: 0 };

    const { container } = render(<RatioChart title="Kudos/hits" points={points} leadIn={leadIn} />);

    const realCxs = realPointCxs(container);
    const leadCx = leadInCx(container);
    const pixelsPerDay = (realCxs[1] - realCxs[0]) / 10;
    const leadInGapPixels = realCxs[0] - leadCx;

    expect(leadInGapPixels).toBeGreaterThan(0);
    expect(leadInGapPixels).toBeLessThan(pixelsPerDay * 150);
  });
});
