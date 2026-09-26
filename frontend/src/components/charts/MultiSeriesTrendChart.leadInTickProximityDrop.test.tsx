import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Round 5 regression test (2026-09-25) - the FOURTH failure mode found
// against real Preview data on this same x-axis tick bug (see
// LeadInXAxisTick.tsx's top-of-file comment for rounds 1-3, and
// TECH_DEBT.md for round 4's `f9b58e6`). Round 4's fix (zero-width
// tickFormatter output for a lead-in slot) correctly fixed the SINGLE
// lead-in case, but real Preview testing comparing two works with far-apart
// publish-date lead-ins (one from 2014, one from late 2025) found the
// non-domain-minimum lead-in's marker still silently dropped.
//
// Root cause, confirmed directly in the installed recharts@3.10.0 source
// (node_modules/recharts/es6/cartesian/getTicks.js's getTicksEnd): even a
// zero-width tick is still excluded if its own coordinate falls within
// `minTickGap` (default 5px, CartesianAxis.js) of an ALREADY-KEPT
// neighboring tick - a proximity buffer reserved purely from that
// neighbor's own position, independent of the candidate's own (zero) size.
// This fixture reproduces that exactly: Work B's own publish-date lead-in
// sits only 14 real days before Work B's own first real capture, but the
// two works' overall shared domain spans ~12 years (Work A's 2014 lead-in
// to Work A's 2026 capture) - so on a several-hundred-pixel-wide chart,
// that 14-day gap collapses to a pixel gap well under 5px, and Work B's
// lead-in (not the domain minimum - Work A's 2014 lead-in is earlier) used
// to fall inside the reserved buffer around Work B's kept real-point tick
// and get dropped. Work A's own lead-in, being the domain minimum with nothing
// earlier to collide with, survived even before this round's fix - which is
// exactly why this bug was easy to miss in the single-lead-in case rounds
// 1-4 tested against.
//
// The round-5 fix (chartTimeAxis.ts's selectDisplayedTicks + `interval={0}`
// on every XAxis) removes Recharts' own tick-filtering from the picture
// entirely, so this class of drop can no longer happen regardless of pixel
// proximity - confirmed red against pre-round-5 code, green after.
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

describe("MultiSeriesTrendChart: two far-apart publish-date lead-ins both survive (round 5 fix, 2026-09-25)", () => {
  installRechartsSizePolyfill();

  it("renders BOTH works' lead-in markers, not just the domain-minimum one", () => {
    const oldWork: SeriesDatum = {
      workId: 10,
      title: "Old Work",
      styleIndex: 0,
      points: [{ capturedOn: "2026-08-01", value: 500 }],
      leadIn: {
        capturedOn: "2014-09-06",
        label: "Published 2014-09-06",
        isPublishDate: true,
      },
    };
    const newWork: SeriesDatum = {
      workId: 11,
      title: "New Work",
      styleIndex: 1,
      // Only 14 real days after its own lead-in - tiny relative to the
      // ~12-year shared domain oldWork's 2014 lead-in creates, so this gap
      // collapses to well under Recharts' 5px minTickGap default.
      points: [{ capturedOn: "2025-11-15", value: 50 }],
      leadIn: {
        capturedOn: "2025-11-01",
        label: "Published 2025-11-01",
        isPublishDate: true,
      },
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[oldWork, newWork]} />,
    );

    // Both lead-ins are publish dates, so both are real, distinct positions
    // on the shared axis - neither should be silently dropped.
    expect(xAxisTickMarkers(container)).toHaveLength(2);

    // Both works' own real capture dates still render as ordinary centered
    // text ticks - the bug this round fixes is specific to the lead-in
    // slots, not the real points that sit next to them.
    const labels = xAxisTickLabelTexts(container);
    // D1's formatDayTick renders bare day-of-month, not the full ISO date.
    expect(labels).toContain("01");
    expect(labels).toContain("15");
  });
});
