import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// Testing task T6 (docs/plans/date-hierarchy-grouping.md §10, §2.2, §5.4,
// D1): mirror of TrendChart.dateGroupingWiring.test.tsx for RatioChart -
// see that file's top-of-file comment for the full rationale, including why
// this is a SEPARATE file rather than edits inside RatioChart.timeAxis.
// test.tsx/RatioChart.leadInAxisMarker.test.tsx (both untouched, confirmed
// still green during this Testing stage's full-suite run).
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

// See TrendChart.dateGroupingWiring.test.tsx's identical comment: verified
// directly against the rendered jsdom output that `recharts-xAxis` is a
// class on the tick `<text>` element itself, not a container it's nested
// inside.
function xAxisTickTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("text.recharts-xAxis")).map(
    (el) => el.textContent ?? "",
  );
}

const POINTS = [
  { capturedOn: "2026-07-01", ratio: 0.1 },
  { capturedOn: "2026-07-15", ratio: 0.14 },
  { capturedOn: "2026-08-06", ratio: 0.2 },
];

describe("RatioChart: DateGroupingOverlay wired into the chart (§5.4)", () => {
  installRechartsSizePolyfill();

  it("renders the date-grouping-overlay group as a child of the aria-hidden chart", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={POINTS} />);

    expect(container.querySelector('g[data-testid="date-grouping-overlay"]')).not.toBeNull();
  });
});

describe("RatioChart: real day ticks print bare day-of-month, not full ISO (D1)", () => {
  installRechartsSizePolyfill();

  it("renders a real point's x-axis tick as its zero-padded day-of-month", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={POINTS} />);

    const tickTexts = xAxisTickTexts(container);
    expect(tickTexts).toContain("06");
    expect(tickTexts.some((text) => text === "2026-08-06")).toBe(false);
  });

  it("never prints a full ISO date anywhere on the x-axis", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={POINTS} />);

    const tickTexts = xAxisTickTexts(container);
    expect(tickTexts.some((text) => /\d{4}-\d{2}-\d{2}/.test(text))).toBe(false);
  });
});
