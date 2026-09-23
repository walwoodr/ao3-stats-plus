import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { TrendChart } from "./TrendChart";
import { RatioChart } from "./RatioChart";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Maintenance item 1 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): Recharts renders its OWN default filled active-dot
// (`.recharts-active-dot`, see node_modules/recharts/es6/component/
// ActivePoints.js) at the hover position whenever a <Line> doesn't set
// activeDot={false} - this was layering a stray filled dot under/over
// ActivePointOverlay's hollow accent ring. Every <Line> across the three
// chart components must suppress it so ActivePointOverlay owns 100% of the
// active-point visual. Mirrors the mousemove/layout-polyfill technique the
// existing *.sync.test.tsx files already use for this hover interaction.
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

const SPARSE_POINTS = [
  { capturedOn: "2026-01-03", value: 100 },
  { capturedOn: "2026-01-04", value: 140 },
  { capturedOn: "2026-02-20", value: 300 },
];

const RATIO_POINTS = [
  { capturedOn: "2026-01-03", ratio: 0.1 },
  { capturedOn: "2026-01-04", ratio: 0.14 },
];

const SERIES: SeriesDatum[] = [
  { workId: 1, title: "Work A", styleIndex: 0, points: SPARSE_POINTS },
  { workId: 2, title: "Work B", styleIndex: 1, points: SPARSE_POINTS },
];

describe("Chart hover: no stray Recharts default active-dot (Maintenance item 1)", () => {
  installRechartsLayoutPolyfill();

  it("TrendChart renders no .recharts-active-dot on hover", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />,
    );

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;
    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });

    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-testid="active-point-ring"]').length,
      ).toBeGreaterThan(0);
    });
    expect(container.querySelectorAll(".recharts-active-dot")).toHaveLength(0);
  });

  it("RatioChart renders no .recharts-active-dot on hover", async () => {
    const { container } = render(<RatioChart title="Kudos/hits" points={RATIO_POINTS} />);

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;
    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });

    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-testid="active-point-ring"]').length,
      ).toBeGreaterThan(0);
    });
    expect(container.querySelectorAll(".recharts-active-dot")).toHaveLength(0);
  });

  it("MultiSeriesTrendChart renders no .recharts-active-dot on hover", async () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={SERIES} />,
    );

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;
    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });

    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-testid="active-point-ring"]').length,
      ).toBeGreaterThan(0);
    });
    expect(container.querySelectorAll(".recharts-active-dot")).toHaveLength(0);
  });
});
