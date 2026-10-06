import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { maxDotsFor } from "../../lib/chartDotDensity";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4 item 7/§5/§7/§8 T7): above 30 real points, TrendChart thins its
// on-line data-point dots to ~1 per 20px of plot width (hardcoded per
// breakpoint via useBreakpoint/chartDotDensity), while every point - dotted
// or not - stays hoverable/clickable (chart<->table sync is resolved at
// the <LineChart onMouseMove> level, never per-dot). jsdom's default
// matchMedia stub (src/test/setup.ts) reports `(min-width: 768px)` as
// non-matching, so these tests exercise the "base" tier
// (maxDotsFor("base")) unless a test explicitly mocks matchMedia for "md".
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

function dailyPoints(count: number): TrendPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    const iso = date.toISOString().slice(0, 10);
    return { capturedOn: iso, value: i + 1 };
  });
}

// The "value" line's own real-point dots are plain circles (r=3.5, fill
// colors.ink in light mode), rendered into Recharts' own
// `.recharts-line-dots` group (verified against the installed
// recharts@3.10.0 DOM output - NOT nested under a `.recharts-line` class,
// which this fixture's single Line also doesn't carry since it has no
// leadIn) - distinct from the lead-in's accent circles and from the
// (removed by item 6) axis-tick markers.
function valueDotCircles(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('.recharts-line-dots circle[r="3.5"]'));
}

describe("TrendChart: data-point dot thinning above 30 points (item 7)", () => {
  installRechartsLayoutPolyfill();

  it("renders exactly maxDotsFor('base') dots (not one per point) for a 45-point series", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={dailyPoints(45)} />,
    );

    expect(valueDotCircles(container)).toHaveLength(maxDotsFor("base"));
  });

  it("still renders one dot per point for a <=30-point series (regression fence - no thinning engages)", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={dailyPoints(10)} />,
    );

    expect(valueDotCircles(container)).toHaveLength(10);
  });

  it("keeps every point hoverable/clickable even though most don't have a visible dot - hovering the chart still tints a table column", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={dailyPoints(45)} />,
    );

    const table = screen.getByRole("table", { name: /total hits/i });
    expect(
      within(table)
        .getAllByRole("cell", {})
        .some((cell) => /bg-accent\/10/.test(cell.className)),
    ).toBe(false);

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (wrapper) {
      fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });
    }

    // Not asserting exactly WHICH column activates (same convention as
    // TrendChart.sync.test.tsx's own EXTERNAL-UNVERIFIED note on Recharts'
    // mouse-coordinate resolution) - the load-bearing claim here is that
    // hovering a dense, mostly-dot-less chart still resolves SOME active
    // column, proving sync is resolved at the chart level, not per-dot.
    await waitFor(() => {
      expect(
        within(table)
          .getAllByRole("cell", {})
          .some((cell) => /bg-accent\/10/.test(cell.className)),
      ).toBe(true);
    });
  });
});
