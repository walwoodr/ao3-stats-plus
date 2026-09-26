import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Structural fix regression test (2026-09-25, third round - supersedes the
// text-anchor-based EdgeSafeXAxisTick approach from `026890f`). A real
// production-build Preview run against a real per-work publish-date lead-in
// ("Lay Down Your Stones and Arrows", published 2014-09-06) originally found
// this exact label rendering left-clipped ("Published 2014-09-06" ->
// "ublished 2014-09-06"). Two subsequent fix attempts targeting Recharts'
// own tick-anchoring/index internals each surfaced a NEW failure mode
// against real data (see TECH_DEBT.md's superseded entries and
// LeadInXAxisTick.tsx's top-of-file comment for the full history). The
// user-directed pivot: never render the lead-in's date/label text as an
// X-axis tick at all - render a small marker instead. This test keeps the
// real long label text from the original bug report so it would still
// catch a regression back to rendering it as a tick label.
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

function xAxisTickLabelTexts(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
  ).map((el) => el.textContent ?? "");
}

function xAxisTickMarkers(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll(".recharts-xAxis-tick-labels circle"));
}

describe("MultiSeriesTrendChart: the lead-in's X-axis tick is a marker, never the long publish-date label (structural fix, 2026-09-25)", () => {
  installRechartsSizePolyfill();

  it("renders a marker (not text) at the publish-date lead-in's position - the real label never appears among the rendered tick texts", () => {
    const work: SeriesDatum = {
      workId: 1,
      title: "Lay Down Your Stones and Arrows",
      styleIndex: 0,
      // Spread months apart (not days) so every real tick clears Recharts'
      // OWN, unrelated minimum-tick-gap spacing given the ~12-year total
      // domain this publish-date lead-in creates - a fixture-scale detail
      // orthogonal to this fix (Recharts still declines to render two real
      // ticks that would overlap each other in pixel space; that's expected
      // and untouched here, not the bug under test).
      points: [
        { capturedOn: "2025-01-15", value: 700 },
        { capturedOn: "2025-09-01", value: 715 },
        { capturedOn: "2026-08-05", value: 721 },
      ],
      leadIn: {
        capturedOn: "2014-09-06",
        label: "Published 2014-09-06",
        isPublishDate: true,
      },
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[work]} />,
    );

    const labels = xAxisTickLabelTexts(container);
    // Every rendered text label is a real capture date's day-of-month tick
    // (D1's formatDayTick) - the lead-in's own label never appears among
    // them, long or otherwise.
    expect(labels).toEqual(["15", "01", "05"]);
    labels.forEach((label) => expect(label).not.toContain("Published"));

    // Every rendered real-point tick keeps the default centered anchor -
    // this fix never left-anchors anything, unlike the superseded approach.
    const anchors = Array.from(
      container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
    ).map((el) => el.getAttribute("text-anchor"));
    expect(anchors).toEqual(["middle", "middle", "middle"]);

    // Exactly one marker renders, for the lead-in slot.
    expect(xAxisTickMarkers(container)).toHaveLength(1);
  });

  it("still shows the real capture dates' ticks correctly, centered, when there's no lead-in at all (regression fence)", () => {
    const work: SeriesDatum = {
      workId: 2,
      title: "Another Work",
      styleIndex: 1,
      points: [
        { capturedOn: "2026-08-02", value: 5 },
        { capturedOn: "2026-08-05", value: 6 },
      ],
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[work]} />,
    );

    // D1's formatDayTick renders bare day-of-month, not the full ISO date.
    expect(xAxisTickLabelTexts(container)).toEqual(["02", "05"]);
    expect(xAxisTickMarkers(container)).toHaveLength(0);
    const firstLabel = Array.from(
      container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
    )[0];
    expect(firstLabel.getAttribute("text-anchor")).toBe("middle");
  });
});
