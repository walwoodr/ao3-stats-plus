import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Chart-table-polish-batch item 2 (docs/plans/chart-table-polish-batch.md
// §4/§8 T2, OD-1): MultiSeriesTrendChart is one of the two count charts
// (alongside TrendChart) that must switch its Y-axis to whole-number-only
// ticks - see TrendChart.yAxisRounding.test.tsx's identical top-of-file
// rationale for why a tickFormatter alone is insufficient and
// `allowDecimals={false}` is required.
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

function yAxisTickTexts(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value"),
  ).map((el) => el.textContent ?? "");
}

describe("MultiSeriesTrendChart: Y-axis ticks are always whole numbers, never decimals (item 2, OD-1 - count chart)", () => {
  installRechartsSizePolyfill();

  it("renders only integer tick labels for a small-max (1, 2, 3) per-work domain - no '.' in any tick", () => {
    const series: SeriesDatum[] = [
      {
        workId: 1,
        title: "Work One",
        styleIndex: 0,
        points: [
          { capturedOn: "2026-01-01", value: 1 },
          { capturedOn: "2026-01-02", value: 2 },
          { capturedOn: "2026-01-03", value: 3 },
        ],
      },
    ];

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={series} />,
    );

    const texts = yAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => expect(text).not.toContain("."));
  });

  it("renders comma-grouped integer labels across multiple series at a large, non-round magnitude", () => {
    const series: SeriesDatum[] = [
      {
        workId: 1,
        title: "Work One",
        styleIndex: 0,
        points: [
          { capturedOn: "2026-07-30", value: 130536 },
          { capturedOn: "2026-08-02", value: 141823 },
        ],
      },
      {
        workId: 2,
        title: "Work Two",
        styleIndex: 1,
        points: [
          { capturedOn: "2026-07-30", value: 10 },
          { capturedOn: "2026-08-02", value: 20 },
        ],
      },
    ];

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={series} />,
    );

    const texts = yAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => expect(text).not.toContain("."));
    expect(texts.some((text) => /\d,\d{3}/.test(text))).toBe(true);
  });

  it("stays integer-only even with a lead-in's 0 floor folded into the small-max domain", () => {
    const series: SeriesDatum[] = [
      {
        workId: 1,
        title: "Work One",
        styleIndex: 0,
        points: [{ capturedOn: "2026-01-01", value: 3 }],
        leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01", isPublishDate: true },
      },
    ];

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={series} />,
    );

    const texts = yAxisTickTexts(container);
    const uniqueTexts = new Set(texts);
    texts.forEach((text) => expect(text).not.toContain("."));
    expect(uniqueTexts.size).toBe(texts.length);
  });
});
