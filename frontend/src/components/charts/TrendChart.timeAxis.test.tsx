import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Testing task 8 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §3 item 4, D7, §0 point 4/§7 error states): TrendChart's
// XAxis must switch from the ordinal integer `xValue` to a real elapsed-
// time scale (`type="number" scale="time"` over epoch-ms x-values). Every
// assertion below is red today because TrendChart still plots real points
// exactly one unit apart regardless of calendar distance.
//
// Per §3 item 4 point 4, this is the required RUNTIME assertion that the
// time axis produces proportionally-spaced x positions - not just trusting
// the installed recharts@3.10.0 type declarations (verified separately
// during Planning, §0 point 1).
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

// Real point dots are drawn as `<circle r="3.5">` (see TrendChart.tsx's
// `dot` renderer) - collected in DOM/data order, which matches chronological
// order since every fixture below lists points ascending.
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

describe("TrendChart: real elapsed-time x-axis (item 4, D7)", () => {
  installRechartsSizePolyfill();

  it("spaces two points 20 days apart roughly 10x as far as two points 2 days apart (proportional to elapsed time)", () => {
    // day 0, day 2 (2-day gap), day 22 (20-day gap) - a 10x ratio.
    const points = [
      { capturedOn: "2026-01-01", value: 10 },
      { capturedOn: "2026-01-03", value: 20 },
      { capturedOn: "2026-01-23", value: 30 },
    ];

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} />,
    );

    const cxs = realPointCxs(container);
    expect(cxs).toHaveLength(3);
    const shortGap = cxs[1] - cxs[0];
    const longGap = cxs[2] - cxs[1];

    expect(shortGap).toBeGreaterThan(0);
    // Allow generous tolerance for chart margins/rounding - the point is
    // "roughly proportional", not exact-pixel, but a genuinely ORDINAL axis
    // (today's behavior) would make this ratio exactly 1, not ~10.
    expect(longGap / shortGap).toBeGreaterThan(6);
    expect(longGap / shortGap).toBeLessThan(14);
  });

  // Regression fence, not a red-today assertion: today's ordinal xValue
  // axis already places real points in increasing x order too (it's just
  // not PROPORTIONAL, which the test above does catch) - kept as a named
  // guard against a future regression that reorders points.
  it("places real points at increasing x positions in chronological order", () => {
    const points = [
      { capturedOn: "2026-01-01", value: 10 },
      { capturedOn: "2026-03-01", value: 20 },
      { capturedOn: "2026-03-15", value: 30 },
    ];

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} />,
    );

    const cxs = realPointCxs(container);
    expect(cxs[0]).toBeLessThan(cxs[1]);
    expect(cxs[1]).toBeLessThan(cxs[2]);
  });
});

describe("TrendChart: bounded synthetic lead-in offset (item 4 point 2, §3 item 4)", () => {
  installRechartsSizePolyfill();

  // Regression fence, not a red-today assertion: today's ordinal axis
  // already places the lead-in exactly one unit before the first real
  // point, which trivially satisfies "bounded" against this generous
  // tolerance - this guards against Implementation swapping in the real
  // (unbounded) 10-year epoch by mistake, once the time axis exists. The
  // proportional-spacing test above is what actually proves the axis went
  // real-time; this one only proves the offset didn't become unbounded.
  it("places the estimated-baseline lead-in strictly before the first real point, with a BOUNDED gap even when the raw calendar gap is huge (~10 years)", () => {
    const points = [
      { capturedOn: "2026-01-01", value: 10 },
      { capturedOn: "2026-01-11", value: 20 }, // 10 real days later - the ruler.
    ];
    const leadIn = { capturedOn: "2016-01-01", value: 0 }; // ~10 years before the first point.

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} leadIn={leadIn} />,
    );

    const realCxs = realPointCxs(container);
    const leadCx = leadInCx(container);
    const pixelsPerDay = (realCxs[1] - realCxs[0]) / 10;
    const leadInGapPixels = realCxs[0] - leadCx;

    expect(leadInGapPixels).toBeGreaterThan(0);
    // Bounded to the MAX ~90-day clamp (chartTimeAxis.leadInEpoch), not the
    // real ~3650-day gap - generous tolerance (150 days) for chart margin/
    // rounding noise, while still being FAR short of the true 10-year gap
    // (which would be roughly 365x pixelsPerDay*10, an order of magnitude
    // more).
    expect(leadInGapPixels).toBeLessThan(pixelsPerDay * 150);
  });
});
