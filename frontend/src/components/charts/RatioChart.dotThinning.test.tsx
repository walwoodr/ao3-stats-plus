import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RatioChart, type RatioPoint } from "./RatioChart";
import { maxDotsFor } from "../../lib/chartDotDensity";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4 item 7/§5/§7/§8 T7): RatioChart gets the same data-point dot thinning
// as TrendChart - see TrendChart.dotThinning.test.tsx's identical
// top-of-file rationale.
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

function dailyPoints(count: number): RatioPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    const iso = date.toISOString().slice(0, 10);
    return { capturedOn: iso, ratio: 0.01 * (i + 1) };
  });
}

// See TrendChart.dotThinning.test.tsx's identical comment: Recharts'
// real-point dots live in its own `.recharts-line-dots` group, not nested
// under a `.recharts-line` class (verified against the installed
// recharts@3.10.0 DOM output).
function ratioDotCircles(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('.recharts-line-dots circle[r="3.5"]'));
}

describe("RatioChart: data-point dot thinning above 30 points (item 7)", () => {
  installRechartsLayoutPolyfill();

  it("renders exactly maxDotsFor('base') dots (not one per point) for a 45-point series", () => {
    const { container } = render(
      <RatioChart title="Kudos-to-hits ratio" points={dailyPoints(45)} />,
    );

    expect(ratioDotCircles(container)).toHaveLength(maxDotsFor("base"));
  });

  it("still renders one dot per point for a <=30-point series (regression fence - no thinning engages)", () => {
    const { container } = render(
      <RatioChart title="Kudos-to-hits ratio" points={dailyPoints(10)} />,
    );

    expect(ratioDotCircles(container)).toHaveLength(10);
  });

  it("keeps every point hoverable/clickable even though most don't have a visible dot - hovering the chart still tints a table column", async () => {
    const { container } = render(
      <RatioChart title="Kudos-to-hits ratio" points={dailyPoints(45)} />,
    );

    const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (wrapper) {
      fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });
    }

    await waitFor(() => {
      expect(
        within(table)
          .getAllByRole("cell", {})
          .some((cell) => /bg-accent\/10/.test(cell.className)),
      ).toBe(true);
    });
  });
});
