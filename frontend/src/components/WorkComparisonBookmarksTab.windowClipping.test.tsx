import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonBookmarksTab } from "./WorkComparisonBookmarksTab";
import type { SeriesDatum } from "./charts/MultiSeriesTrendChart";
import { toEpoch } from "../lib/chartTimeAxis";
import { LIGHT_COLOR_TOKENS } from "../lib/colorTokens";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Maintenance (2026-10-13, item 2): the date-range slider's "from" window
// start (`windowStartEpoch`, chart-table-polish-batch item 4/OD-2a) was
// threaded into the non-Bookmarks metric chart only - WorkComparisonSection
// never passed it to WorkComparisonBookmarksTab, so neither of ITS two
// internal MultiSeriesTrendChart call sites (By Type, By Work) ever clipped
// a baseline earlier than the window, unlike every other metric tab. Same
// geometric-clipping technique as MultiSeriesTrendChart.windowClipping.
// test.tsx (jsdom applies no real SVG clipPath, so "clipped" is verified via
// the lead-in dot's cx sitting strictly left of the plot's own edge).
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

function plotEdges(container: HTMLElement): { left: number } {
  const axisLine = container.querySelector(".recharts-xAxis .recharts-cartesian-axis-line");
  if (!axisLine) throw new Error("expected the XAxis line to be rendered");
  return { left: Number(axisLine.getAttribute("x1")) };
}

function leadInDotCx(container: HTMLElement): number | null {
  const dot = Array.from(container.querySelectorAll('circle[r="4"]')).find(
    (circle) => circle.getAttribute("fill") === LIGHT_COLOR_TOKENS.inkSoft,
  );
  return dot ? Number(dot.getAttribute("cx")) : null;
}

// A work published 2020-01-01, first real capture 2026-01-10 - same shape
// as MultiSeriesTrendChart.windowClipping.test.tsx's own fixture.
const WORK_WITH_LEAD_IN: SeriesDatum = {
  workId: 1,
  title: "Work One",
  styleIndex: 0,
  points: [
    { capturedOn: "2026-01-10", value: 100 },
    { capturedOn: "2026-02-10", value: 200 },
  ],
  leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01", isPublishDate: true },
};

const ORDERED_SELECTED_WORKS: PerWorkSeries[] = [
  {
    ao3WorkId: 1,
    title: "Work One",
    fandoms: "",
    points: [],
    bookmarks: [],
    publishedOn: "2020-01-01",
  },
];

describe("WorkComparisonBookmarksTab: windowStartEpoch reaches its own charts (item 2 fix)", () => {
  installRechartsSizePolyfill();

  // windowStartEpoch sits strictly AFTER the 2020 publish date and strictly
  // BEFORE the first real capture - the OD-2 clip case.
  const windowStartEpoch = toEpoch("2026-01-01");

  it("By Type: clips the Total chart's baseline at the window start, same as the non-Bookmarks tabs", () => {
    const { container } = render(
      <WorkComparisonBookmarksTab
        orderedSelectedWorks={ORDERED_SELECTED_WORKS}
        buildTypeSeries={() => [WORK_WITH_LEAD_IN]}
        buildWorkTypeSeries={() => [WORK_WITH_LEAD_IN]}
        windowStartEpoch={windowStartEpoch}
      />,
    );

    const { left } = plotEdges(container);
    const cx = leadInDotCx(container);
    expect(cx).not.toBeNull();
    expect(cx as number).toBeLessThan(left);
  });

  it("By Work: clips each work's own chart baseline at the window start too", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WorkComparisonBookmarksTab
        orderedSelectedWorks={ORDERED_SELECTED_WORKS}
        buildTypeSeries={() => [WORK_WITH_LEAD_IN]}
        buildWorkTypeSeries={() => [WORK_WITH_LEAD_IN]}
        windowStartEpoch={windowStartEpoch}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "By Work" }));

    const { left } = plotEdges(container);
    const cx = leadInDotCx(container);
    expect(cx).not.toBeNull();
    expect(cx as number).toBeLessThan(left);
  });

  it("regression fence: with no windowStartEpoch, the baseline is unclipped (today's pre-fix default), confirming the assertion technique itself is sound", () => {
    const { container } = render(
      <WorkComparisonBookmarksTab
        orderedSelectedWorks={ORDERED_SELECTED_WORKS}
        buildTypeSeries={() => [WORK_WITH_LEAD_IN]}
        buildWorkTypeSeries={() => [WORK_WITH_LEAD_IN]}
        windowStartEpoch={undefined}
      />,
    );

    const { left } = plotEdges(container);
    const cx = leadInDotCx(container);
    expect(cx).not.toBeNull();
    expect(cx).toBeCloseTo(left, 0);
  });
});
