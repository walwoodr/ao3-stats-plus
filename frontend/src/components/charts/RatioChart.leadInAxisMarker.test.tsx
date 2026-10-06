import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// Structural fix regression test (2026-09-25, third round) - mirrors
// TrendChart.leadInAxisMarker.test.tsx's identical rationale exactly (see
// that file's top-of-file comment / LeadInXAxisTick.tsx for the full
// root-cause history). RatioChart shares the same XAxis/tick wiring as
// TrendChart, so the same regression applies here.
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

// Chart-table-polish-batch item 6 (docs/plans/chart-table-polish-batch.md
// §4 item 6, §8 T6): INVERTS this file's pre-batch "exactly one marker"
// assertion - see TrendChart.leadInAxisMarker.test.tsx's identical
// top-of-file comment for the full rationale.
describe("RatioChart: no marker is ever drawn on an x-axis tick - the lead-in slot renders bare (item 6)", () => {
  installRechartsSizePolyfill();

  it("renders no axis tick text AND no marker for the lead-in slot - only real points get date text", () => {
    const points = [
      { capturedOn: "2026-07-30", ratio: 0.5 },
      { capturedOn: "2026-07-31", ratio: 0.6 },
      { capturedOn: "2026-08-02", ratio: 0.55 },
    ];
    const leadIn = { capturedOn: "2014-09-06", ratio: 0 };

    const { container } = render(
      <RatioChart title="Kudos-to-hits" points={points} leadIn={leadIn} />,
    );

    const labels = xAxisTickLabelTexts(container);
    // D1's formatDayTick renders bare day-of-month, not the full ISO date.
    expect(labels).toEqual(["30", "31", "02"]);
    labels.forEach((label) => {
      expect(label).not.toContain("Published");
      expect(label).not.toBe("2014");
    });

    // Item 6: zero markers render anywhere, including the lead-in's slot.
    expect(xAxisTickMarkers(container)).toHaveLength(0);
  });

  it("leaves every real point's tick centered - no special-casing beyond the lead-in slot", () => {
    const points = [
      { capturedOn: "2026-07-30", ratio: 0.1 },
      { capturedOn: "2026-08-02", ratio: 0.2 },
      { capturedOn: "2026-08-09", ratio: 0.3 },
    ];
    const leadIn = { capturedOn: "2014-09-06", ratio: 0 };

    const { container } = render(
      <RatioChart title="Kudos-to-hits" points={points} leadIn={leadIn} />,
    );

    const anchors = Array.from(
      container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
    ).map((el) => el.getAttribute("text-anchor"));
    expect(anchors).toEqual(["middle", "middle", "middle"]);
  });

  it("still renders normal centered date ticks with no marker when there's no lead-in at all (regression fence)", () => {
    const points = [
      { capturedOn: "2026-07-30", ratio: 0.1 },
      { capturedOn: "2026-08-02", ratio: 0.2 },
    ];

    const { container } = render(<RatioChart title="Kudos-to-hits" points={points} />);

    // D1's formatDayTick renders bare day-of-month, not the full ISO date.
    expect(xAxisTickLabelTexts(container)).toEqual(["30", "02"]);
    expect(xAxisTickMarkers(container)).toHaveLength(0);
  });
});
