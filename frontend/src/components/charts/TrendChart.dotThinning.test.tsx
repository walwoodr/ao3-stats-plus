import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TrendChart, type TrendPoint } from "./TrendChart";
import { maxDotsFor } from "../../lib/chartDotDensity";
import type { Breakpoint } from "../../lib/useBreakpoint";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4 item 7/§5/§7/§8 T7): above 30 real points, TrendChart thins its
// on-line data-point dots to ~1 per 20px of plot width (hardcoded per
// breakpoint via useBreakpoint/chartDotDensity), while every point - dotted
// or not - stays hoverable/clickable (chart<->table sync is resolved at
// the <LineChart onMouseMove> level, never per-dot). jsdom's default
// matchMedia stub (src/test/setup.ts) reports `(min-width: 768px)` as
// non-matching, so these tests exercise the "base" tier
// (maxDotsFor("base")) unless a test explicitly mocks matchMedia for "md".
function installRechartsLayoutPolyfill() {
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
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

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
    HTMLElement.prototype.getBoundingClientRect = function stubbedRect() {
      return {
        left: 0,
        top: 0,
        right: 600,
        bottom: 240,
        width: 600,
        height: 240,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      } as DOMRect;
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
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });
}

function dailyPoints(count: number): TrendPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    const iso = date.toISOString().slice(0, 10);
    return { capturedOn: iso, value: i + 1 };
  });
}

// The "value" line's own real-point dots are plain circles (r=3.5, fill
// colors.ink in light mode), rendered into Recharts' own
// `.recharts-line-dots` group (verified against the installed
// recharts@3.10.0 DOM output - NOT nested under a `.recharts-line` class,
// which this fixture's single Line also doesn't carry since it has no
// leadIn) - distinct from the lead-in's accent circles and from the
// (removed by item 6) axis-tick markers.
function valueDotCircles(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('.recharts-line-dots circle[r="3.5"]'));
}

describe("TrendChart: data-point dot thinning above 30 points (item 7)", () => {
  installRechartsLayoutPolyfill();

  it("renders exactly maxDotsFor('base') dots (not one per point) for a 45-point series", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={dailyPoints(45)} />,
    );

    expect(valueDotCircles(container)).toHaveLength(maxDotsFor("base"));
  });

  // Renamed from the original "<=30-point series (regression fence)" title:
  // 10 points is well under maxDotsFor("base") (14) on its own, so this case
  // was already passing for a reason unrelated to the plan's >30 engagement
  // gate (chart-table-polish-batch.md §4 item 7/§5) - it proves nothing
  // about that gate, only that a small series under ANY breakpoint's max-dots
  // value is left unthinned. The real gate boundary is covered by the
  // "explicit >30 engagement gate" describe block below.
  it("still renders one dot per point for a 10-point series, well under any breakpoint's max-dots value", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={dailyPoints(10)} />,
    );

    expect(valueDotCircles(container)).toHaveLength(10);
  });

  it("keeps every point hoverable/clickable even though most don't have a visible dot - hovering the chart still tints a table column", async () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={dailyPoints(45)} />,
    );

    const table = screen.getByRole("table", { name: /total hits/i });
    expect(
      within(table)
        .getAllByRole("cell", {})
        .some((cell) => /bg-accent\/10/.test(cell.className)),
    ).toBe(false);

    const wrapper = container.querySelector(".recharts-wrapper");
    expect(wrapper).not.toBeNull();
    if (wrapper) {
      fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 120 });
    }

    // Not asserting exactly WHICH column activates (same convention as
    // TrendChart.sync.test.tsx's own EXTERNAL-UNVERIFIED note on Recharts'
    // mouse-coordinate resolution) - the load-bearing claim here is that
    // hovering a dense, mostly-dot-less chart still resolves SOME active
    // column, proving sync is resolved at the chart level, not per-dot.
    await waitFor(() => {
      expect(
        within(table)
          .getAllByRole("cell", {})
          .some((cell) => /bg-accent\/10/.test(cell.className)),
      ).toBe(true);
    });
  });
});

// Mirrors useBreakpoint.test.ts's own matchMedia-mock convention (duplicated
// here rather than shared, matching this file's existing per-file-duplication
// convention for installRechartsLayoutPolyfill) - lets a test force the "md"
// tier instead of relying on jsdom's default (always-non-matching) stub.
// Query-aware (NOT a blanket "every query matches" stub): useChartColors
// also calls window.matchMedia, for "(prefers-color-scheme: dark)" - a
// blanket-true mock would silently flip the chart into dark mode too and
// break color-keyed dot assertions with an unrelated false failure.
function installMatchMediaMock(mdMatches: boolean) {
  const MD_QUERY = "(min-width: 768px)";
  window.matchMedia = (query: string) =>
    ({
      matches: query === MD_QUERY ? mdMatches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

// Plan §4 item 7 / §5 corner cases (chart-table-polish-batch.md): "`>30`
// gate: thinning engages only when `pointCount > 30`." / "Exactly 30 / 31
// points: ... item 7 gates are strict (`> 30`); 30 shows ... all dots, 31 ...
// (on base) thins dots. Boundary tests at 30 and 31." The removed-above
// 10-point case does NOT prove this gate (10 is under maxDotsFor("base")=14
// for an unrelated reason) - these do, because 30 exceeds maxDotsFor("base")
// (14) while still being <= the plan's 30-point threshold, so a correct
// implementation must show all 30 even though a naive
// `pointCount > maxDots` check (with no reference to 30 at all) would thin
// it. Expected count is `min(maxDotsFor(bp), pointCount)` once thinning
// actually engages (pointCount > 30) - not a blind "fewer than pointCount"
// assumption - because on "md" (maxDots 35) a 31-point series is still under
// maxDots and must show all 31.
describe("TrendChart: item 7's explicit >30 engagement gate (boundary tests at 30 and 31 points)", () => {
  installRechartsLayoutPolyfill();

  afterEach(() => {
    delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
  });

  function expectedDotCount(pointCount: number, breakpoint: Breakpoint): number {
    const maxDots = maxDotsFor(breakpoint);
    return pointCount <= 30 ? pointCount : Math.min(maxDots, pointCount);
  }

  it.each<[Breakpoint, number]>([
    ["base", 30],
    ["base", 31],
    ["md", 30],
    ["md", 31],
  ])(
    "renders %s expected dots for a %i-point series (the >30 gate, not breakpoint max-dots alone, decides whether thinning engages)",
    (breakpoint, pointCount) => {
      installMatchMediaMock(breakpoint === "md");

      const { container } = render(
        <TrendChart title="Total hits" valueLabel="Hits" points={dailyPoints(pointCount)} />,
      );

      expect(valueDotCircles(container)).toHaveLength(expectedDotCount(pointCount, breakpoint));
    },
  );
});
