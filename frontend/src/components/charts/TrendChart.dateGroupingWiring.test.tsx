import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Testing task T6 (docs/plans/date-hierarchy-grouping.md §10, §2.2, §5.4,
// D1): TrendChart.tsx must wire in <DateGroupingOverlay> as a <LineChart>
// child and swap its real-tick `formatTick` from formatDateTick to the new
// formatDayTick. Every assertion below is red today - TrendChart doesn't
// render a date-grouping-overlay group yet, and its real day ticks still
// print the full ISO date.
//
// REGRESSION FENCE (this file's whole reason for existing as a SEPARATE
// file rather than edits inside TrendChart.timeAxis.test.tsx/TrendChart.
// leadInAxisMarker.test.tsx): per this project's five-round tick-machinery
// history, TrendChart.timeAxis.test.tsx and TrendChart.leadInAxisMarker.
// test.tsx are NOT modified by this feature at all - both continue to pass
// unmodified (verified directly: `npx vitest run` against this project's
// full suite during this Testing stage shows both files still green,
// confirming `selectDisplayedTicks`/`interval={0}`/LeadInXAxisTick's marker
// path are genuinely untouched, not just unedited-by-oversight).
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

// Recharts renders each x-axis tick's <text> with `recharts-xAxis` as one of
// its OWN classes (not nested inside a `.recharts-xAxis` container element -
// verified directly against the rendered jsdom output, not assumed), so
// this is a class selector on `text` itself, not a descendant combinator.
function xAxisTickTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("text.recharts-xAxis")).map(
    (el) => el.textContent ?? "",
  );
}

const POINTS = [
  { capturedOn: "2026-07-01", value: 10 },
  { capturedOn: "2026-07-15", value: 20 },
  { capturedOn: "2026-08-06", value: 30 },
];

describe("TrendChart: DateGroupingOverlay wired into the chart (§5.4)", () => {
  installRechartsSizePolyfill();

  it("renders the date-grouping-overlay group as a child of the aria-hidden chart", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
    );

    expect(container.querySelector('g[data-testid="date-grouping-overlay"]')).not.toBeNull();
  });

  it("still renders the overlay (no crash) for a single-point history", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={[POINTS[0]]} />,
    );

    expect(container.querySelector('g[data-testid="date-grouping-overlay"]')).not.toBeNull();
  });
});

describe("TrendChart: real day ticks print bare day-of-month, not full ISO (D1)", () => {
  installRechartsSizePolyfill();

  it("renders a real point's x-axis tick as its zero-padded day-of-month", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
    );

    const tickTexts = xAxisTickTexts(container);
    expect(tickTexts).toContain("06");
    expect(tickTexts.some((text) => text === "2026-08-06")).toBe(false);
  });

  it("never prints a full ISO date anywhere on the x-axis (month/year context now lives in DateGroupingOverlay's own labels)", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
    );

    const tickTexts = xAxisTickTexts(container);
    expect(tickTexts.some((text) => /\d{4}-\d{2}-\d{2}/.test(text))).toBe(false);
  });
});

describe("TrendChart: the sampled-tick cap still applies under the new day-of-month text (regression fence for selectDisplayedTicks)", () => {
  installRechartsSizePolyfill();

  it("still caps real x-axis ticks at MAX_REAL_AXIS_TICKS (6) for a dense >6-point history, now rendered as day-of-month text", () => {
    const densePoints = Array.from({ length: 12 }, (_, i) => ({
      capturedOn: `2026-01-${String(i + 1).padStart(2, "0")}`,
      value: (i + 1) * 10,
    }));

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={densePoints} />,
    );

    const tickTexts = xAxisTickTexts(container).filter((text) => text !== "");
    expect(tickTexts.length).toBeLessThanOrEqual(6);
    tickTexts.forEach((text) => expect(text).toMatch(/^\d{2}$/));
  });
});
