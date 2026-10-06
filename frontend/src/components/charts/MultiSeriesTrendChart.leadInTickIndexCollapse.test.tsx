import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Structural fix regression test (2026-09-25, third round - supersedes the
// index-based EdgeSafeXAxisTick approach from `ff1afc3`). The SECOND fix
// attempt identified "the edge tick to left-anchor" via Recharts' own
// render-call `index === 0` - the tick's position within whatever subset
// Recharts' internal overlap-avoidance filtering actually decided to
// RENDER, not its position in the true domain-ordered ticks array passed
// in. The real "Lay Down Your Stones and Arrows" Hits chart that surfaced
// this had exactly TWO ticks total (a lead-in plus one real capture), which
// Recharts' default `interval="preserveEnd"` collision-avoidance filtering
// collapsed down to rendering only the LATER tick - which then inherited
// `index === 0` regardless of whether it was really the domain's leftmost
// point, so the WRONG tick got left-anchored and overflowed off the right
// edge instead ("2026-" cut off).
//
// This third fix removes the possibility of that collapse entirely, rather
// than reacting to it after the fact: the lead-in's own `tickFormatter`
// output is always "" (see MultiSeriesTrendChart.tsx's axisTickFormatter),
// so Recharts' collision-avoidance math (getTicks.js's getTickSize, which
// measures each tick's width from `tickFormatter(value, index)`, NOT from
// whatever the custom `tick` renderer actually paints) always sees the
// lead-in slot as zero-width. A zero-width tick can never collide with a
// neighbor and can never get dropped by "doesn't fit" filtering - so the
// 2-tick collapse this file's polyfill reproduces literally cannot happen
// to the marker slot anymore, regardless of Recharts' filtering algorithm,
// and there is no longer an index-based "which one is index 0" question to
// get wrong at all, since nothing is conditionally anchored by index.
//
// Lives in its own file (not merged into the sibling leadInTickClipping.
// test.tsx) for the same reason as before: Recharts' text-measurement
// cache (`stringCache`, a module-level LRUCache) persists across renders
// within a single test file/module, so isolating this in its own file
// avoids stale cross-test cache pollution of the realistic width polyfill
// below (confirmed empirically during the original Implementation pass).
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
  // filtering never actually distinguishes a long label from a short one,
  // regardless of tick count. This approximates each measured label's width
  // using this project's own mono tick font metric (chartTimeAxis.ts's
  // estimateYAxisWidth uses the same ~7.3px/char approximation for the same
  // `var(--font-mono)` tick font), close enough to real layout to let
  // Recharts' actual filtering algorithm run authentically instead of
  // staying permanently dormant - the point of this file is to prove the
  // marker survives that REAL algorithm, not a jsdom no-op version of it.
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

function xAxisTickLabelTexts(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
  ).map((el) => el.textContent ?? "");
}

function xAxisTickMarkers(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll(".recharts-xAxis-tick-labels circle"));
}

// Chart-table-polish-batch item 6 (docs/plans/chart-table-polish-batch.md
// §4 item 6, §8 T6): completes the same marker-assertion inversion already
// applied to the sibling *.leadInAxisMarker.test.tsx/*.leadInTickClipping.
// test.tsx files - this file predates item 6 and was missed from that
// explicit file list, but asserts the IDENTICAL now-removed marker glyph
// feature. Item 6's removal is unconditional, so the lead-in slot renders
// nothing at all now; the real point's own tick survival/centering (the
// actual third-round regression this file guards) is unchanged.
describe("MultiSeriesTrendChart: a 2-tick chart (lead-in + one real point) never lets Recharts' collision filtering collapse or mis-anchor either tick (bug fix, 2026-09-25 third round)", () => {
  installRechartsMeasurementPolyfill();

  it("renders the real point's centered date tick and no marker at all for the lead-in slot (item 6), even under realistic text-measurement collision filtering", () => {
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

    // The real point's own tick always survives and is never mis-anchored -
    // under the superseded approach this sometimes inherited an incorrect
    // left anchor when it wrongly inherited "index 0" from Recharts'
    // filtered render pass. Now nothing is conditionally anchored by index
    // at all, so this is unconditionally "middle".
    const labels = xAxisTickLabelTexts(container);
    // D1's formatDayTick renders bare day-of-month, not the full ISO date.
    expect(labels).toEqual(["05"]);
    const realLabel = container.querySelector(
      ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
    );
    expect(realLabel?.getAttribute("text-anchor")).toBe("middle");

    // Item 6: the lead-in slot renders no marker at all (it can't be
    // dropped by "doesn't fit" collision filtering either, since Recharts
    // measures its tickFormatter output ("") as zero-width - but item 6
    // means there's nothing to drop or keep in the first place).
    expect(xAxisTickMarkers(container)).toHaveLength(0);
  });

  it("behaves identically for a SHORT lead-in label - no marker renders regardless of label length", () => {
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

    // D1's formatDayTick renders bare day-of-month, not the full ISO date.
    expect(xAxisTickLabelTexts(container)).toEqual(["05"]);
    const realLabel = container.querySelector(
      ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
    );
    expect(realLabel?.getAttribute("text-anchor")).toBe("middle");
    expect(xAxisTickMarkers(container)).toHaveLength(0);
  });
});
