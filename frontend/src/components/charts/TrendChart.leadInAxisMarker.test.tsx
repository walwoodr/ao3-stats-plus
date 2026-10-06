import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Structural fix regression test (2026-09-25, third round - supersedes the
// text-anchor-based EdgeSafeXAxisTick approach from `026890f`/`ff1afc3`).
// Three prior attempts to reconcile a long lead-in axis-tick label (e.g.
// "Published 2014-09-06") with Recharts' own center-anchored tick-overlap-
// avoidance filtering each surfaced a NEW failure mode against real
// production data - see TECH_DEBT.md's superseded entries and
// LeadInXAxisTick.tsx's top-of-file comment for the full root-cause
// history. The user-directed pivot: stop rendering the lead-in's date/label
// text as an X-axis tick at all, and render a small marker there instead -
// this test asserts that outcome directly, using the REAL long label text
// from the original bug report so it would have caught the original bug.
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
// assertions. The 2026-09-25 structural fix (comment above) deliberately
// replaced the lead-in's long axis-tick TEXT with a small marker glyph -
// item 6 now removes that marker glyph entirely too (never a dot on any
// x-axis tick, lead-in or otherwise), leaving the lead-in's slot fully
// bare (no text, no marker). The dashed connector and its on-line anchor
// dot (drawn by the "lead" Line itself, not LeadInXAxisTick) are untouched
// - see the plan's §3 "Lead-in convention" scope note.
describe("TrendChart: no marker is ever drawn on an x-axis tick - the lead-in slot renders bare (item 6)", () => {
  installRechartsSizePolyfill();

  it("renders no axis tick text AND no marker for the lead-in slot - only real points get date text", () => {
    const points = [
      { capturedOn: "2026-07-30", value: 130536 },
      { capturedOn: "2026-07-31", value: 130597 },
      { capturedOn: "2026-08-02", value: 130911 },
    ];
    // A long, multi-word estimated-baseline label - the exact shape that
    // broke every prior text-anchor-based fix attempt.
    const leadIn = { capturedOn: "2014-09-06", value: 0 };

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} leadIn={leadIn} />,
    );

    const labels = xAxisTickLabelTexts(container);
    // Every rendered text label is a real point's own day-of-month tick
    // (D1's formatDayTick, date-hierarchy-grouping.md §2.2) - no lead-in
    // text (long or short) ever appears among them.
    expect(labels).toEqual(["30", "31", "02"]);
    labels.forEach((label) => {
      expect(label).not.toContain("Published");
      expect(label).not.toBe("2014");
    });

    // Item 6: zero markers render anywhere, including the lead-in's slot.
    expect(xAxisTickMarkers(container)).toHaveLength(0);
  });

  it("leaves every real point's tick centered and unaffected - no special-casing beyond the lead-in slot", () => {
    const points = [
      { capturedOn: "2026-07-30", value: 10 },
      { capturedOn: "2026-08-02", value: 20 },
      { capturedOn: "2026-08-09", value: 30 },
    ];
    const leadIn = { capturedOn: "2014-09-06", value: 0 };

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} leadIn={leadIn} />,
    );

    const anchors = Array.from(
      container.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"),
    ).map((el) => el.getAttribute("text-anchor"));
    // Every real tick keeps Recharts' default centered anchor - this fix
    // never left-anchors, or otherwise special-cases, any real point's tick.
    expect(anchors).toEqual(["middle", "middle", "middle"]);
  });

  it("still renders normal centered date ticks with no marker when there's no lead-in at all (regression fence)", () => {
    const points = [
      { capturedOn: "2026-07-30", value: 10 },
      { capturedOn: "2026-08-02", value: 20 },
    ];

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} />,
    );

    // D1's formatDayTick renders bare day-of-month, not the full ISO date.
    expect(xAxisTickLabelTexts(container)).toEqual(["30", "02"]);
    expect(xAxisTickMarkers(container)).toHaveLength(0);
  });
});
