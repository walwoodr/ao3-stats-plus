import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Regression test (2026-09-25 SECOND Preview finding). The FIRST fix
// (MultiSeriesTrendChart.leadInTickClipping.test.tsx) identified "the edge
// tick to left-anchor" via Recharts' own render-call `index === 0` - the
// tick's position within whatever subset Recharts' internal overlap-
// avoidance filtering actually decided to RENDER, not its position in the
// true domain-ordered ticks array passed in. That first test's chart has
// FOUR ticks total (a lead-in plus three real points), which - as this
// file's own polyfill below demonstrates is necessary to expose at all -
// Recharts never filters down far enough to reveal this.
//
// The real "Lay Down Your Stones and Arrows" Hits chart that surfaced this
// second bug had exactly TWO ticks total (a lead-in plus one real capture -
// the per-work chart shape from the original bug report). Recharts' default
// `interval="preserveEnd"` collision-avoidance filtering can drop a long
// lead-in label from rendering entirely (it doesn't fit within the axis's
// left boundary under Recharts' own center-anchor assumption) while always
// force-keeping the last/rightmost tick. That lone surviving tick then
// inherits `index === 0` in Recharts' filtered render call regardless of
// whether it's really the domain's leftmost point - so the WRONG (later)
// tick got left-anchored and overflowed off the right edge instead
// ("2026-" with the rest cut off), exactly as confirmed via live DOM
// inspection against real production data (see EdgeSafeXAxisTick.tsx's
// root-cause comment). Uses the real label/dates from that report so this
// test would have caught the exact production failure.
//
// This lives in its OWN file (not added to the sibling
// leadInTickClipping.test.tsx) deliberately: Recharts' text-measurement
// cache (`stringCache`, a module-level LRUCache) persists across renders
// within a single test file/module, so if any test in the same file had
// already measured "Published 2014-09-06" or "2026-08-05" at this project's
// tick font BEFORE this file's getBoundingClientRect stub took effect, the
// stub would be silently bypassed by that stale (jsdom-default 0-width)
// cache entry. Isolating this in its own file gives it a fresh module
// registry (Vitest's default `test.isolate`), avoiding that cross-test
// cache pollution - confirmed empirically during Implementation: the same
// assertions below flaked when first drafted as a second `describe` block
// inside the existing file, for exactly this reason.
function installRechartsMeasurementPolyfill() {
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
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  // jsdom never lays out real text - Element.getBoundingClientRect always
  // returns a 0-width rect there - so without this stub, Recharts' tick
  // filtering never actually drops anything, regardless of tick count, and
  // this bug would never reproduce in a jsdom test at all. This
  // approximates each measured label's width using this project's own mono
  // tick font metric (chartTimeAxis.ts's estimateYAxisWidth uses the same
  // ~7.3px/char approximation for the same `var(--font-mono)` tick font),
  // close enough to real layout to let Recharts' actual filtering algorithm
  // run authentically instead of staying permanently dormant.
  const APPROX_MONO_CHAR_WIDTH_PX = 7.3;

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
    Element.prototype.getBoundingClientRect = function stubbedGetBoundingClientRect(this: Element) {
      if (this.id === "recharts_measurement_span") {
        const width = (this.textContent ?? "").length * APPROX_MONO_CHAR_WIDTH_PX;
        return {
          width,
          height: 15,
          top: 0,
          left: 0,
          right: width,
          bottom: 15,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
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
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });
}

function xAxisTickLabelFor(container: HTMLElement, text: string): Element {
  const label = Array.from(
    container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
  ).find((el) => el.textContent === text);
  if (!label) throw new Error(`expected an X-axis tick label with text "${text}"`);
  return label;
}

describe("MultiSeriesTrendChart: the true domain-leftmost tick is identified by its own x-value, not Recharts' render index (bug fix, 2026-09-25 second finding)", () => {
  installRechartsMeasurementPolyfill();

  it("does not mis-anchor the later tick as left-anchored when Recharts' own collision-avoidance collapses a 2-tick chart down to rendering just one of them", () => {
    const work: SeriesDatum = {
      workId: 3,
      title: "Lay Down Your Stones and Arrows",
      styleIndex: 0,
      points: [{ capturedOn: "2026-08-05", value: 721 }],
      leadIn: {
        capturedOn: "2014-09-06",
        label: "Published 2014-09-06",
        isPublishDate: true,
      },
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[work]} />,
    );

    const renderedLabels = Array.from(
      container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
    ).map((el) => el.textContent);

    // Under this polyfill's realistic text measurement, Recharts' own
    // preserveEnd collision avoidance reliably drops the long lead-in label
    // and keeps only the later real point - exercising the exact collapse
    // shape from the production bug report. Asserted directly (not just
    // "at least one tick") so a future Recharts version behaving
    // differently fails loudly here rather than silently testing nothing.
    expect(renderedLabels).toEqual(["2026-08-05"]);

    // The bug: the sole survivor is the LATER (non-domain-minimum) tick, so
    // it must render center-anchored, not left-anchored - a left anchor on
    // this later tick is exactly what pushed "2026-" off the chart's right
    // edge in production.
    const laterLabel = xAxisTickLabelFor(container, "2026-08-05");
    expect(laterLabel.getAttribute("text-anchor")).toBe("middle");
  });

  it("still left-anchors the true domain-leftmost tick when both ticks survive Recharts' filtering (regression fence: a short lead-in label doesn't trigger the collapse at all)", () => {
    const work: SeriesDatum = {
      workId: 4,
      title: "A Work With A Short Lead-In Label",
      styleIndex: 0,
      points: [{ capturedOn: "2026-08-05", value: 721 }],
      leadIn: {
        capturedOn: "2014-09-06",
        label: "2014",
        isPublishDate: true,
      },
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[work]} />,
    );

    const renderedLabels = Array.from(
      container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
    ).map((el) => el.textContent);
    expect(renderedLabels).toEqual(["2014", "2026-08-05"]);

    expect(xAxisTickLabelFor(container, "2014").getAttribute("text-anchor")).toBe("start");
    expect(xAxisTickLabelFor(container, "2026-08-05").getAttribute("text-anchor")).toBe("middle");
  });
});
