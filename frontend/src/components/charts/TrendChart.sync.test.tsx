import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Testing tasks T9/T10 (docs/plans/chart-synced-data-table.md §10, §2.3):
// the bidirectional chart<->table sync mechanism, exercised on TrendChart's
// numeric-xValue XAxis shape (the "harder" of the two dateKey-resolution
// paths §2.3 calls out - MultiSeriesTrendChart's categorical capturedOn
// XAxis is the other, covered by MultiSeriesTrendChart.sync.test.tsx).
// Neither direction is wired up in TrendChart.tsx yet, so every test below
// is a genuine red (no <ActivePointOverlay>, no onMouseMove/onMouseLeave on
// <LineChart>, no activeDateKey state at all).
//
// EXTERNAL-UNVERIFIED (chart-to-table direction only, T9): the exact pixel
// position a given fireEvent.mouseMove(clientX, clientY) resolves to inside
// Recharts' redux-toolkit-driven mouse-move middleware is verified here
// only against the installed recharts@3.10.0 SOURCE (getRelativeCoordinate.
// js's rect/offsetWidth-based scaling, RechartsWrapper.js's onMouseMove
// binding to the HTML .recharts-wrapper div) - not against a real browser
// or even a real implementation of this feature (which doesn't exist yet).
// jsdom has no real layout engine; getBoundingClientRect/offsetWidth are
// polyfilled below to a plausible 600x240 to make the coordinate math
// resolvable at all, and requestAnimationFrame/redux-listener-middleware
// timing is worked around with waitFor rather than assumed synchronous.
// This test intentionally does NOT assert on the specific date column that
// ends up active - only that hovering the chart activates SOME column and
// hovering away clears it - to stay robust to exactly where Recharts'
// pixel math lands, while still being a real, non-vacuous red today (no
// column is ever active before this feature exists). If Implementation
// finds the mousemove-without-Tooltip mechanism genuinely doesn't populate
// activeLabel in a real browser, the plan's documented zero-UI
// `<Tooltip content={() => null} cursor={false} />` fallback applies (§2.3)
// and this file's Tooltip-absence assertion moves to a "no VISIBLE popover"
// check instead - see this file's own TECH_DEBT.md entry.
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

describe("TrendChart: chart -> table sync (T9)", () => {
  installRechartsLayoutPolyfill();

  it("highlights a table column when the pointer moves over the chart, with NO Tooltip element rendered", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />,
    );

    expect(container.querySelector(".recharts-tooltip-wrapper")).toBeNull();

    const table = screen.getByRole("table", { name: /total hits/i });
    expect(container.querySelectorAll('[class*="bg-accent/10"]')).toHaveLength(0);

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

  it("clears the table highlight when the pointer leaves the chart", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />,
    );

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;

    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });
    await waitFor(() => {
      expect(container.querySelectorAll('[class*="bg-accent/10"]').length).toBeGreaterThan(0);
    });

    fireEvent.mouseLeave(wrapper);
    await waitFor(() => {
      expect(container.querySelectorAll('[class*="bg-accent/10"]')).toHaveLength(0);
    });
  });
});

describe("TrendChart: table -> chart sync (T10, D-B guide line + ringed markers)", () => {
  installRechartsLayoutPolyfill();

  it("renders a guide line and a ring at the point when its date column header is hovered", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />,
    );

    expect(container.querySelectorAll('[data-testid="active-point-guide-line"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(0);

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-04" });
    fireEvent.mouseEnter(columnHeader);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-guide-line"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(1);
    });
  });

  it("clears the guide line and ring when the column header is no longer hovered", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />,
    );

    const columnHeader = screen.getByRole("columnheader", { name: "2026-01-04" });
    fireEvent.mouseEnter(columnHeader);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(1);
    });

    fireEvent.mouseLeave(columnHeader);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-guide-line"]')).toHaveLength(0);
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(0);
    });
  });

  it("skips the leadIn column gracefully - a lone ring at the synthetic baseline point, not a throw", async () => {
    const LEAD_IN = { capturedOn: "2014-01-01", value: 0 };
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
    );

    const leadInHeader = screen.getByRole("columnheader", { name: /before.*2014/i });
    expect(() => fireEvent.mouseEnter(leadInHeader)).not.toThrow();

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(1);
    });
  });
});
