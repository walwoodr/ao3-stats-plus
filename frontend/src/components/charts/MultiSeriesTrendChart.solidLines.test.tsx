import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Testing task 9 (docs/plans/usds-dataviz-color-scheme.md, section 7): dash
// is dropped entirely as a per-series channel - lines are solid now (the
// plan's "Dash decision"). New file, not an extension of
// MultiSeriesTrendChart.test.tsx, both for CODE_STANDARDS.md's file-length
// budget and so the ResizeObserver polyfill (needed to inspect real
// Recharts <path> stroke-dasharray attributes) stays scoped to the tests
// that actually need real SVG layout - mirrors the existing
// MultiSeriesTrendChart.leadIn.test.tsx's own justification for the same
// polyfill/scoping choice.
//
// Explicitly NOT covered here: the lead-in's own dash ("4 4", inkSoft) -
// that is unchanged/regression-tested in MultiSeriesTrendChart.leadIn.
// test.tsx already. This file's "lead-in unaffected" test below is a
// lighter cross-check that the lead-in's dashed segment survives even once
// every *series* line has gone solid, not a duplicate of that file's full
// coverage.
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

const TEN_WORKS: SeriesDatum[] = Array.from({ length: 10 }, (_, i) => ({
  workId: i + 1,
  title: `Work ${i + 1}`,
  styleIndex: i,
  points: [
    { capturedOn: "2026-01-01", value: (i + 1) * 10 },
    { capturedOn: "2026-01-08", value: (i + 1) * 20 },
  ],
}));

const WORK_WITH_LEAD: SeriesDatum = {
  workId: 1,
  title: "Work A",
  styleIndex: 0,
  points: [{ capturedOn: "2026-01-01", value: 10 }],
  leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01" },
};

describe("MultiSeriesTrendChart: series lines are solid (no per-series strokeDasharray)", () => {
  installRechartsSizePolyfill();

  it("renders no strokeDasharray on any per-series <path> for a 2-work selection", () => {
    const twoWorks = TEN_WORKS.slice(0, 2);
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={twoWorks} />,
    );

    // Every series color is distinct at these two slots, so each series
    // <path> can be found by its own stroke color and asserted dash-free.
    twoWorks.forEach((work) => {
      const color = LIGHT_COLOR_TOKENS.series[work.styleIndex];
      const path = container.querySelector(`path[stroke="${color}"]`);
      expect(path, `series path for ${work.title} (${color})`).not.toBeNull();
      expect(path?.hasAttribute("stroke-dasharray")).toBe(false);
    });
  });

  it("renders 10 dash-free series lines with distinct colors for the full 10-work cap-raise state", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={TEN_WORKS} />,
    );

    TEN_WORKS.forEach((work) => {
      const color = LIGHT_COLOR_TOKENS.series[work.styleIndex];
      const path = container.querySelector(`path[stroke="${color}"]`);
      expect(path, `series path for ${work.title} (${color})`).not.toBeNull();
      expect(path?.hasAttribute("stroke-dasharray")).toBe(false);
    });
  });

  it("still uses colors.series[styleIndex] (useChartColors seam) for each series line's stroke, unaffected by dropping dash", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={TEN_WORKS} />,
    );

    const strokes = TEN_WORKS.map((work) => {
      const color = LIGHT_COLOR_TOKENS.series[work.styleIndex];
      return container.querySelector(`path[stroke="${color}"]`);
    });

    strokes.forEach((path) => expect(path).not.toBeNull());
  });

  // Regression: the already-shipped zero-basis lead-in owns its own
  // hardcoded dash and never read the slot table's dash field, so dropping
  // per-series dash must not touch it (plan's happy-path step 6).
  it("leaves the lead-in's own dashed '4 4' inkSoft segment unaffected by series lines going solid", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_WITH_LEAD]} />,
    );

    const leadPath = container.querySelector('path[stroke-dasharray="4 4"]');
    expect(leadPath).not.toBeNull();
    expect(leadPath?.getAttribute("stroke")).toBe(LIGHT_COLOR_TOKENS.inkSoft);

    // The work's own series line (styleIndex 0's color) must NOT carry that
    // same dasharray - only the lead-in segment does.
    const ownColor = LIGHT_COLOR_TOKENS.series[0];
    const ownPath = container.querySelector(`path[stroke="${ownColor}"]`);
    expect(ownPath?.hasAttribute("stroke-dasharray")).toBe(false);
  });
});
