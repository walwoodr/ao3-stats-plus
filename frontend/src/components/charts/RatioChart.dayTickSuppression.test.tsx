import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RatioChart, type RatioPoint } from "./RatioChart";

// Chart-table-polish-batch item 5 (docs/plans/chart-table-polish-batch.md
// §4/§5/§8 T5): RatioChart gets the same >30-point day-tick suppression as
// TrendChart - see that file's identical top-of-file rationale.
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

function xAxisTickTexts(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
  ).map((el) => el.textContent ?? "");
}

function dailyPoints(count: number): RatioPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    const iso = date.toISOString().slice(0, 10);
    return { capturedOn: iso, ratio: 0.01 * (i + 1) };
  });
}

describe("RatioChart: day-of-month tick suppression above 30 points (item 5)", () => {
  installRechartsSizePolyfill();

  it("suppresses every day-number tick text (all empty) for a >30-point series", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={dailyPoints(45)} />);

    const texts = xAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => expect(text).toBe(""));
  });

  it("still shows real day-number ticks at exactly 30 points (boundary, unaffected)", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={dailyPoints(30)} />);

    const texts = xAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((text) => text !== "")).toBe(true);
  });

  it("suppresses day-number ticks at exactly 31 points (boundary, strict > 30)", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={dailyPoints(31)} />);

    const texts = xAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => expect(text).toBe(""));
  });

  it("leaves a small (<=30-point) series' day-number ticks fully intact (regression fence)", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={dailyPoints(3)} />);

    const texts = xAxisTickTexts(container);
    expect(texts.every((text) => /^\d{2}$/.test(text))).toBe(true);
  });
});
