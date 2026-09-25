import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Bug fix regression test (2026-09-25 Preview finding, item 4/D7): a real
// production-build preview against a real per-work publish-date lead-in
// ("Lay Down Your Stones and Arrows", published 2014-09-06, a real
// chronological-axis leftmost point per item 4) found the lead-in's X-axis
// tick label rendering left-clipped: "Published 2014-09-06" rendered as
// "ublished 2014-09-06". Recharts center-anchors tick labels by default, so
// a label sitting at the domain's true leftmost edge has half its width
// pushed past the chart's own left boundary. Deliberately uses the real
// label text/date from the screenshot (not a short label that wouldn't have
// overflowed) so this test actually would have caught the bug.
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

function xAxisTickLabelFor(container: HTMLElement, text: string): Element {
  const label = Array.from(
    container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
  ).find((el) => el.textContent === text);
  if (!label) throw new Error(`expected an X-axis tick label with text "${text}"`);
  return label;
}

describe("MultiSeriesTrendChart: leftmost X-axis lead-in tick label doesn't get clipped (bug fix, 2026-09-25)", () => {
  installRechartsSizePolyfill();

  it("left-anchors (not center-anchors) the leftmost tick, so a long publish-date lead-in label starts within the chart instead of overflowing its left edge", () => {
    const work: SeriesDatum = {
      workId: 1,
      title: "Lay Down Your Stones and Arrows",
      styleIndex: 0,
      points: [
        { capturedOn: "2026-08-02", value: 720 },
        { capturedOn: "2026-08-03", value: 721 },
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

    const leadInLabel = xAxisTickLabelFor(container, "Published 2014-09-06");
    // The bug: a center ("middle") anchor pushes roughly half the label's
    // width to the LEFT of its x position - for this 21-character label at
    // the domain's leftmost edge, that reliably went negative (off-canvas),
    // producing the observed "ublished 2014-09-06" clip.
    expect(leadInLabel.getAttribute("text-anchor")).toBe("start");

    // A later, non-leftmost tick keeps the original centered look - this
    // fix is scoped to the domain-edge tick only, not every tick.
    const laterLabel = xAxisTickLabelFor(container, "2026-08-05");
    expect(laterLabel.getAttribute("text-anchor")).toBe("middle");
  });

  it("still shows the real capture dates' ticks correctly when there's no lead-in at all (regression fence)", () => {
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

    const firstLabel = xAxisTickLabelFor(container, "2026-08-02");
    expect(firstLabel.getAttribute("text-anchor")).toBe("start");
  });
});
