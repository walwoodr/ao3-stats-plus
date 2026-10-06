import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// Chart-table-polish-batch item 2, OD-1 (docs/plans/chart-table-polish-
// batch.md §4/§8 T2): RatioChart is explicitly EXCLUDED from the
// whole-number-only Y-axis change - the kudos-to-hits ratio is inherently
// fractional (~0.03-0.15), and whole-number ticks would collapse its axis
// to just 0/1. This file is a regression fence proving RatioChart's
// fractional ticks/formatNumber tickFormatter stay exactly as they are
// today, even after TrendChart/MultiSeriesTrendChart switch to
// allowDecimals={false}/formatWholeNumber - a future refactor that
// accidentally applies item 2 to every chart uniformly (the "obvious"
// mistake this OD-1 scope decision exists to prevent) would be caught here.
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

function yAxisTickTexts(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value"),
  ).map((el) => el.textContent ?? "");
}

describe("RatioChart: Y-axis keeps fractional/decimal ticks, unaffected by item 2 (OD-1)", () => {
  installRechartsSizePolyfill();

  // Not a red-today assertion by itself (RatioChart's axis is untouched by
  // this batch), but named and kept alongside the rest of this batch's
  // Testing-stage work as the explicit regression fence OD-1 calls for -
  // Implementation must not add allowDecimals={false}/formatWholeNumber
  // here while making TrendChart/MultiSeriesTrendChart's tests above pass.
  it("renders at least one fractional (decimal-point) tick for a realistic kudos-to-hits ratio domain", () => {
    const points = [
      { capturedOn: "2026-01-01", ratio: 0.03 },
      { capturedOn: "2026-01-08", ratio: 0.09 },
      { capturedOn: "2026-01-15", ratio: 0.15 },
    ];

    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={points} />);

    const texts = yAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((text) => text.includes("."))).toBe(true);
  });

  it("does not collapse a small-ratio domain down to just '0'/'1' integer ticks", () => {
    const points = [
      { capturedOn: "2026-01-01", ratio: 0.03 },
      { capturedOn: "2026-01-08", ratio: 0.09 },
    ];

    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={points} />);

    const texts = yAxisTickTexts(container);
    const uniqueTexts = new Set(texts);
    // If ticks were wrongly rounded to whole numbers at this scale, every
    // tick would collapse to "0" (the only integer in range) - a loss of
    // all axis information item 2 must never inflict on the ratio chart.
    expect(uniqueTexts.size).toBeGreaterThan(1);
  });
});
