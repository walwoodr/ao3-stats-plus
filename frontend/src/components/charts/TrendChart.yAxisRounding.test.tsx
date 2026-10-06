import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Bug fix regression test (2026-09-25 Preview finding, item 1): a real
// production-build preview against real dashboard data (38 works, 6 real
// snapshots, hits growing to 131,069) found the Y-axis top tick rendering as
// a raw unrounded decimal ("141,823.44"/"141,554.52" depending on exact
// snapshot values) beside otherwise-clean round ticks ("0 / 40,000 / 80,000 /
// 120,000"), and getting left-clipped to a nonsensical "1,823.44" because the
// longer string overflowed the space Recharts allocated for the shorter
// round labels around it. Deliberately uses the REAL, non-round magnitudes
// from that screenshot (not small clean round numbers - see
// chartTimeAxis.test.ts's identical rationale for its own nice-ceiling
// describe block) so this test actually would have caught the bug.
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

describe("TrendChart: Y-axis top tick is a clean rounded number, not a raw decimal (bug fix, 2026-09-25)", () => {
  installRechartsSizePolyfill();

  it("renders the top Y-axis tick as a whole number for the real 'Total hits' dashboard magnitudes (dataMax=131069)", () => {
    const points = [
      { capturedOn: "2026-07-30", value: 130536 },
      { capturedOn: "2026-07-31", value: 130597 },
      { capturedOn: "2026-08-02", value: 130911 },
      { capturedOn: "2026-08-03", value: 131069 },
    ];
    const leadIn = { capturedOn: "2026-01-01", value: 0 };

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} leadIn={leadIn} />,
    );

    const texts = yAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    const topTick = texts[texts.length - 1];

    // The bug: this used to render "141,554.52" - a decimal, inconsistent
    // with the round "0 / 40,000 / 80,000 / 120,000" ticks beside it.
    expect(topTick).not.toContain(".");
    expect(topTick).toBe("150,000");
  });

  it("renders the top Y-axis tick as a clean number for a small-but-not-round per-work magnitude (dataMax=721)", () => {
    // Mirrors the real per-work "Hits" comparison chart from the same
    // Preview finding (pinned_compare.png): raw ceiling was 778.68.
    const points = [
      { capturedOn: "2026-08-02", value: 720 },
      { capturedOn: "2026-08-03", value: 721 },
    ];
    const leadIn = { capturedOn: "2014-09-06", value: 0 };

    const { container } = render(
      <TrendChart title="Hits" valueLabel="Hits" points={points} leadIn={leadIn} />,
    );

    const texts = yAxisTickTexts(container);
    const topTick = texts[texts.length - 1];

    expect(topTick).not.toContain(".");
    expect(topTick).toBe("780");
  });
});

// Chart-table-polish-batch item 2 (docs/plans/chart-table-polish-batch.md
// §4/§8 T2, OD-1): the bug-fix tests above only prove the domain CEILING is
// a clean rounded number - they don't prove every intermediate tick
// Recharts generates along the way is also decimal-free. A small-max
// domain (1, 2, 3) is the case that actually exposes the gap: Recharts'
// default tick-value generator can legitimately propose fractional
// intermediate ticks (e.g. 0, 1.25, 2.5, ...) for a small ceiling, which a
// tickFormatter alone can't fix (it would just round two different numeric
// ticks to the same displayed label). `allowDecimals={false}` is the
// public recharts@3.10.0 API this batch's plan specifies for forcing the
// tick *generator* itself to integer steps.
describe("TrendChart: Y-axis ticks are always whole numbers, never decimals (item 2, OD-1 - count chart)", () => {
  installRechartsSizePolyfill();

  it("renders only integer tick labels for a small-max (1, 2, 3) domain - no '.' in any tick", () => {
    const points = [
      { capturedOn: "2026-01-01", value: 1 },
      { capturedOn: "2026-01-02", value: 2 },
      { capturedOn: "2026-01-03", value: 3 },
    ];

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} />,
    );

    const texts = yAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => expect(text).not.toContain("."));
  });

  it("renders comma-grouped integer labels for a large, non-round magnitude - no decimal anywhere on the axis", () => {
    const points = [
      { capturedOn: "2026-07-30", value: 130536 },
      { capturedOn: "2026-07-31", value: 130597 },
      { capturedOn: "2026-08-02", value: 130911 },
      { capturedOn: "2026-08-03", value: 141823 },
    ];

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} />,
    );

    const texts = yAxisTickTexts(container);
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => expect(text).not.toContain("."));
    // At least one tick should show real comma grouping at this magnitude -
    // guards against a fix that merely strips decimals but regresses the
    // pre-existing thousands-separator formatting (formatNumber).
    expect(texts.some((text) => /\d,\d{3}/.test(text))).toBe(true);
  });

  // Regression fence, not a red-today assertion: this specific fixture's
  // ticks already happen not to collide before Implementation (confirmed by
  // running this suite) - it earns its place once allowDecimals={false}
  // lands by catching a future regression back to formatter-only rounding,
  // the exact failure mode this item's plan detail (§4 item 2) warns about.
  it("never duplicates a visible tick label by rounding two distinct fractional ticks to the same integer", () => {
    // A domain shape where naive formatter-only rounding (without
    // allowDecimals) would plausibly collide: dataMax=3 with a lead-in's 0
    // floor spans a narrow [0, ~3.5] range, exactly the regime where
    // Recharts' default tick step can be sub-1.
    const points = [{ capturedOn: "2026-01-01", value: 3 }];
    const leadIn = { capturedOn: "2020-01-01", value: 0 };

    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={points} leadIn={leadIn} />,
    );

    const texts = yAxisTickTexts(container);
    const uniqueTexts = new Set(texts);
    expect(uniqueTexts.size).toBe(texts.length);
  });
});
