import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import { maxDotsFor } from "../../lib/chartDotDensity";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4 item 7/§5/§7/§8 T7): MultiSeriesTrendChart gets the same data-point
// dot thinning as TrendChart/RatioChart, keyed off each series' OWN point
// count - see TrendChart.dotThinning.test.tsx's identical top-of-file
// rationale. A single-work fixture is used so "distinct real capture
// dates in the union" and "this series' own point count" coincide.
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

function seriesWith(count: number): SeriesDatum[] {
  const points = Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    const iso = date.toISOString().slice(0, 10);
    return { capturedOn: iso, value: i + 1 };
  });
  return [{ workId: 1, title: "Work One", styleIndex: 0, points }];
}

// The work's own-series dots render via multiSeriesDots.createSeriesDot ->
// renderMarkerShape - for styleIndex 0 ("circle" slot) that's a plain
// <circle r="4" fill={seriesColor}>, inside Recharts' own
// `.recharts-line-dots` group (verified against the installed
// recharts@3.10.0 DOM output - see TrendChart.dotThinning.test.tsx's
// identical comment).
function seriesDotCircles(container: HTMLElement): Element[] {
  const seriesColor = LIGHT_COLOR_TOKENS.series[0];
  return Array.from(
    container.querySelectorAll(`.recharts-line-dots circle[r="4"][fill="${seriesColor}"]`),
  );
}

describe("MultiSeriesTrendChart: data-point dot thinning above 30 points (item 7)", () => {
  installRechartsLayoutPolyfill();

  it("renders exactly maxDotsFor('base') dots (not one per point) for a 45-point series", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={seriesWith(45)} />,
    );

    expect(seriesDotCircles(container)).toHaveLength(maxDotsFor("base"));
  });

  it("still renders one dot per point for a <=30-point series (regression fence - no thinning engages)", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={seriesWith(10)} />,
    );

    expect(seriesDotCircles(container)).toHaveLength(10);
  });

  it("keeps every point hoverable/clickable even though most don't have a visible dot - hovering the chart still tints a table column", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={seriesWith(45)} />,
    );

    const table = screen.getByRole("table", { name: /hits/i });

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
