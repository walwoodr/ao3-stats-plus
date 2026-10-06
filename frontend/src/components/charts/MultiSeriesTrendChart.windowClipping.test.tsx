import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import { toEpoch } from "../../lib/chartTimeAxis";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Chart-table-polish-batch item 4, OD-2/OD-2a = Option B (docs/plans/
// chart-table-polish-batch.md §4 item 4, §5, §6, §8 T4): MultiSeriesTrend-
// Chart gains a new `windowStartEpoch?: number` prop (not yet on
// MultiSeriesTrendChartProps - every assertion below is red against
// today's component, which has no knowledge of any window and always
// derives its domain from `[Math.min(...xEpoch), Math.max(...xEpoch)]`).
// When present, it becomes the XAxis domain's LEFT bound (clipping a
// baseline earlier than the window off the left edge); the RIGHT bound
// stays the existing data-derived maximum.
//
// EXTERNAL-UNVERIFIED-turned-VERIFIED translation note: the plan's own
// mechanism text (§4 item 4, point 3) says Recharts "clips any point left
// of windowStartEpoch...out of view: its series dot isn't drawn
// (off-domain)". A direct probe against the installed recharts@3.10.0
// package (scratch probes, not kept in this suite) confirms the REAL
// mechanism is more specific than that prose: Recharts does NOT remove an
// out-of-domain data point from the DOM - a custom `dot` render prop still
// fires for it, and (with `allowDataOverflow` enabled, needed for the
// explicit domain to be honored at all rather than silently auto-expanded
// to fit every point) the resulting negative/off-canvas coordinate is only
// visually hidden via an SVG clipPath - invisible in jsdom, which applies
// no real clipping. The genuinely verifiable, implementation-independent
// proxy for "clipped off the left edge" is therefore geometric: the
// baseline's own circle renders at an x (`cx`) coordinate strictly LEFT of
// the plot's actual left edge (`recharts-cartesian-axis-line`'s own `x1`,
// a pure-geometry anchor independent of data/domain), while an in-window
// point's `cx` sits at-or-right of that same edge. This is what the tests
// below assert, with this comment as the translation record Implementation
// and Review should read before assuming the literal "isn't drawn" prose.
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

// The plot's left/right pixel edges, independent of any data/domain -
// always rendered from the XAxis's own line element.
function plotEdges(container: HTMLElement): { left: number; right: number } {
  const axisLine = container.querySelector(".recharts-xAxis .recharts-cartesian-axis-line");
  if (!axisLine) throw new Error("expected the XAxis line to be rendered");
  return {
    left: Number(axisLine.getAttribute("x1")),
    right: Number(axisLine.getAttribute("x2")),
  };
}

function leadInDotCx(container: HTMLElement): number | null {
  const dot = Array.from(container.querySelectorAll('circle[r="4"]')).find(
    (circle) => circle.getAttribute("fill") === LIGHT_COLOR_TOKENS.inkSoft,
  );
  return dot ? Number(dot.getAttribute("cx")) : null;
}

// A work published 2020-01-01, first REAL capture 2026-01-10 - a realistic
// "publish date long before any capture" shape (per §5's corner-case note:
// "this clip chiefly affects real publish-date baselines").
const WORK: SeriesDatum = {
  workId: 1,
  title: "Work One",
  styleIndex: 0,
  points: [
    { capturedOn: "2026-01-10", value: 100 },
    { capturedOn: "2026-02-10", value: 200 },
  ],
  leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01", isPublishDate: true },
};

describe("MultiSeriesTrendChart: windowStartEpoch domain clipping (item 4, OD-2a = Option B)", () => {
  installRechartsSizePolyfill();

  // Regression fence, not red-today: passing an extra unrecognized prop is
  // a no-op for today's component, so this already holds before
  // Implementation - it earns its place by catching a future regression
  // where windowStartEpoch's absence stops being treated as "fall back to
  // today's domain" (§6's documented fallback contract).
  it("with no windowStartEpoch prop, keeps today's domain - the baseline sits exactly at the plot's left edge, unclipped", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK]} />,
    );

    const { left } = plotEdges(container);
    const cx = leadInDotCx(container);
    expect(cx).not.toBeNull();
    expect(cx).toBeCloseTo(left, 0);
  });

  it("with a windowStartEpoch AFTER the baseline (the OD-2 clip case), renders the baseline strictly LEFT of the plot's edge", () => {
    const windowStartEpoch = toEpoch("2026-01-01"); // after the 2020 publish date, before the first real capture
    const { container } = render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[WORK]}
        windowStartEpoch={windowStartEpoch}
      />,
    );

    const { left } = plotEdges(container);
    const cx = leadInDotCx(container);
    expect(cx).not.toBeNull();
    expect(cx as number).toBeLessThan(left);
  });

  // Regression fence, not red-today: the dashed line already renders
  // regardless of the (currently inert) windowStartEpoch prop - it earns
  // its place once domain-clipping lands by catching a future refactor
  // that drops the line entirely for a clipped baseline instead of just
  // clipping its endpoint (the exact failure mode §6 warns against).
  it("still renders the dashed lead-in line even when its baseline is clipped off the left edge (§6 regression fence)", () => {
    const windowStartEpoch = toEpoch("2026-01-01");
    const { container } = render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[WORK]}
        windowStartEpoch={windowStartEpoch}
      />,
    );

    expect(container.querySelector('path[stroke-dasharray="4 4"]')).not.toBeNull();
  });

  it("with a windowStartEpoch BEFORE the baseline (window includes it), renders the baseline inset from the edge, not exactly on it", () => {
    const windowStartEpoch = toEpoch("2019-01-01"); // before the 2020 publish date
    const { container } = render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[WORK]}
        windowStartEpoch={windowStartEpoch}
      />,
    );

    const { left } = plotEdges(container);
    const cx = leadInDotCx(container);
    expect(cx).not.toBeNull();
    expect(cx as number).toBeGreaterThan(left);
  });

  // Regression fence, not red-today: the right bound is already
  // data-derived-max today (unaffected by the inert prop) - earns its
  // place by catching a future change that lets windowStartEpoch
  // accidentally influence the right bound too (Option B's left-only
  // contract).
  it("keeps the right bound tight to the last real data epoch regardless of windowStartEpoch", () => {
    const windowStartEpoch = toEpoch("2026-01-01");
    const { container } = render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[WORK]}
        windowStartEpoch={windowStartEpoch}
      />,
    );

    const { right } = plotEdges(container);
    // The work's own-series dots (styleIndex 0's color, via
    // renderMarkerShape - a <g> wrapper per multiSeriesDots.createSeriesDot,
    // not a bare <circle> like the inkSoft lead-in dot) include one at the
    // domain's right edge: the last real point (2026-02-10), which is also
    // the chart's overall xEpoch max and therefore unaffected by
    // windowStartEpoch (Option B only moves the LEFT bound).
    const seriesColor = LIGHT_COLOR_TOKENS.series[0];
    const seriesShapeNodes = Array.from(container.querySelectorAll(`[fill="${seriesColor}"]`));
    expect(seriesShapeNodes.length).toBeGreaterThan(0);
    const rightmostX = Math.max(
      ...seriesShapeNodes.map((node) => Number(node.getAttribute("cx") ?? node.getAttribute("x"))),
    );
    expect(rightmostX).toBeCloseTo(right, 0);
  });

  // §7 accessibility: Option B clips the baseline VISUALLY only - the
  // table's lead-in column (the accessible representation of the baseline,
  // per §7 item 4) must stay in the table model regardless of visual
  // clipping, so a screen-reader user still gets the full "Published
  // 2020-01-01" label even though the chart's own dot/line endpoint is
  // clipped off-canvas.
  // Regression fence, not red-today: the table model is built from
  // `series` independent of windowStartEpoch, so this already holds - it
  // earns its place by catching a future change that tries to filter the
  // table's columns by the same window (which would be the real AT
  // regression §7 explicitly warns against).
  it("keeps the baseline's column in the visible synced table even when its dot is clipped off the chart (§7, no AT regression)", () => {
    const windowStartEpoch = toEpoch("2026-01-01");
    render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[WORK]}
        windowStartEpoch={windowStartEpoch}
      />,
    );

    // WORK's leadIn is a publish-date baseline (isPublishDate: true), whose
    // column header is the raw accurate ISO date (syncedTableModel.ts's
    // own already-shipped convention for this case - its CELL, not its
    // header, carries the "Published (N)" wording) - see
    // MultiSeriesTrendChart.leadIn.test.tsx's "zero-basis columns" block for
    // the non-publish-date (word-label header) counterpart.
    const table = screen.getByRole("table", { name: /hits/i });
    expect(within(table).getByRole("columnheader", { name: "2020-01-01" })).toBeInTheDocument();
    expect(within(table).getByText("Published (0)")).toBeInTheDocument();
  });
});
