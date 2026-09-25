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

describe("TrendChart: the account-level lead-in's X-axis tick is a marker, never long text (structural fix, 2026-09-25)", () => {
  installRechartsSizePolyfill();

  it("renders no axis tick text for the lead-in slot at all - only real points get date text", () => {
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
    // Every rendered text label is a real point's own date - no lead-in
    // text (long or short) ever appears among them.
    expect(labels).toEqual(["2026-07-30", "2026-07-31", "2026-08-02"]);
    labels.forEach((label) => {
      expect(label).not.toContain("Published");
      expect(label).not.toBe("2014");
    });

    // Exactly one marker renders, for the lead-in slot.
    const markers = xAxisTickMarkers(container);
    expect(markers).toHaveLength(1);
    expect(markers[0].getAttribute("fill")).toBe("#9F1239"); // colors.accent (light mode)
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

    expect(xAxisTickLabelTexts(container)).toEqual(["2026-07-30", "2026-08-02"]);
    expect(xAxisTickMarkers(container)).toHaveLength(0);
  });
});
