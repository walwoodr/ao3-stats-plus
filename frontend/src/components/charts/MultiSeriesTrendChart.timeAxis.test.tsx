import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Testing task 10 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §3 item 4, D7): MultiSeriesTrendChart's categorical
// `dataKey="capturedOn" type="category"` XAxis must switch to the same real
// elapsed-time scale as TrendChart/RatioChart - see
// MultiSeriesTrendChart.buildChartData.test.ts's new xEpoch describe block
// for the underlying per-row data change this depends on. This file adds
// the required §3 item 4 point 4 runtime rendered-position assertion, plus
// the union-epoch-domain corner case specific to N series.
//
// Uses a single series (WORK_A, styleIndex 0 -> "circle" per
// SERIES_STYLE_SLOTS) so its real-point dots are plain, distinguishable
// `<circle r="4" fill={series[0]}>` elements (see markerPaths.tsx) - the
// lead-in's own dot is ALSO a `r="4"` circle but filled inkSoft instead, so
// the two are distinguished by fill color, following this codebase's
// existing convention (MultiSeriesTrendChart.leadIn.test.tsx's inkSoft
// circle filter).
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

// Scoped to .recharts-wrapper (the chart's own SVG), not the whole render
// container - the SAME series color/shape is also legitimately reused by
// ComparisonLegend's swatch and SyncedDataTable's row-header MarkerGlyph
// (both correctly preserve D5's identity-consistency requirement outside
// the chart), so an unscoped query over the whole container would also
// match those, not just the chart's own real point dots.
function chartWrapper(container: HTMLElement): HTMLElement {
  const wrapper = container.querySelector<HTMLElement>(".recharts-wrapper");
  if (!wrapper) throw new Error("expected a .recharts-wrapper");
  return wrapper;
}

function seriesDotCxs(container: HTMLElement): number[] {
  return Array.from(
    chartWrapper(container).querySelectorAll(`circle[fill="${LIGHT_COLOR_TOKENS.series[0]}"]`),
  ).map((circle) => Number(circle.getAttribute("cx")));
}

function leadInCx(container: HTMLElement): number {
  const circle = chartWrapper(container).querySelector(
    `circle[fill="${LIGHT_COLOR_TOKENS.inkSoft}"]`,
  );
  if (!circle) throw new Error("expected a lead-in dot");
  return Number(circle.getAttribute("cx"));
}

describe("MultiSeriesTrendChart: real elapsed-time x-axis (item 4, D7)", () => {
  installRechartsSizePolyfill();

  it("spaces two points 20 days apart roughly 10x as far as two points 2 days apart (proportional to elapsed time)", () => {
    const work: SeriesDatum = {
      workId: 1,
      title: "Work A",
      styleIndex: 0,
      points: [
        { capturedOn: "2026-01-01", value: 10 },
        { capturedOn: "2026-01-03", value: 20 },
        { capturedOn: "2026-01-23", value: 30 },
      ],
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[work]} />,
    );

    const cxs = seriesDotCxs(container).sort((a, b) => a - b);
    expect(cxs).toHaveLength(3);
    const shortGap = cxs[1] - cxs[0];
    const longGap = cxs[2] - cxs[1];

    expect(shortGap).toBeGreaterThan(0);
    expect(longGap / shortGap).toBeGreaterThan(6);
    expect(longGap / shortGap).toBeLessThan(14);
  });
});

describe("MultiSeriesTrendChart: lead-in placement split (item 4 point 2)", () => {
  installRechartsSizePolyfill();

  it("places a PUBLISH-DATE lead-in dot at its real epoch - the SAME distance from the first real point as the chart's own known pixels-per-day ruler predicts", () => {
    const work: SeriesDatum = {
      workId: 1,
      title: "Work A",
      styleIndex: 0,
      points: [
        { capturedOn: "2026-01-01", value: 10 },
        { capturedOn: "2026-01-11", value: 20 }, // 10-day ruler.
      ],
      leadIn: { capturedOn: "2025-12-22", label: "Published 2025-12-22", isPublishDate: true }, // exactly 10 days before the first point.
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[work]} />,
    );

    const realCxs = seriesDotCxs(container).sort((a, b) => a - b);
    const pixelsPerDay = (realCxs[1] - realCxs[0]) / 10;
    const leadInGapPixels = realCxs[0] - leadInCx(container);

    // A REAL 10-day-before epoch, not a bounded/clamped offset - should sit
    // very close to 10 * pixelsPerDay (generous tolerance for rounding).
    expect(leadInGapPixels).toBeGreaterThan(pixelsPerDay * 7);
    expect(leadInGapPixels).toBeLessThan(pixelsPerDay * 13);
  });

  it("places an ESTIMATED-BASELINE lead-in dot at a BOUNDED offset, far short of a huge (~10-year) raw calendar gap", () => {
    const work: SeriesDatum = {
      workId: 1,
      title: "Work A",
      styleIndex: 0,
      points: [
        { capturedOn: "2026-01-01", value: 10 },
        { capturedOn: "2026-01-11", value: 20 }, // 10-day ruler.
      ],
      leadIn: { capturedOn: "2016-01-01", label: "Before 2016 (estimated baseline)" }, // ~10 years before.
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[work]} />,
    );

    const realCxs = seriesDotCxs(container).sort((a, b) => a - b);
    const pixelsPerDay = (realCxs[1] - realCxs[0]) / 10;
    const leadInGapPixels = realCxs[0] - leadInCx(container);

    expect(leadInGapPixels).toBeGreaterThan(0);
    expect(leadInGapPixels).toBeLessThan(pixelsPerDay * 150);
  });
});
