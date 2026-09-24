import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ActivePointOverlay, type ActivePoint } from "./ActivePointOverlay";

// Testing task 4 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.2, §3 item 1 D2, §2.3): ActivePointOverlay.tsx must grow
// two new, independent optional props - `pinnedPoints` (item 3's point A,
// drawn as a solid/filled ring+line distinct from the existing hollow/
// translucent hover ring+line) and `brokenYAxis` (item 1's non-zero-origin
// break glyph, D2's "real visual truncation cue, not a text label"). Neither
// prop exists on the component yet, so every assertion below that depends on
// them fails today (the extra props are simply ignored by the current
// component - a real behavioral red, not a type-only one, since this test
// file is transpiled by esbuild without type-checking).
//
// This file's own choice of prop names (`pinnedPoints`, `brokenYAxis`) and
// testids (`pinned-point-ring`, `pinned-point-guide-line`,
// `y-axis-break-glyph`) is this Testing stage's own translation of §2.2's
// prose ("extend to optionally draw a SECOND, visually distinct overlay for
// the pinned point A ... and to draw item 1's axis-break glyph") into a
// concrete contract, mirroring the existing `active-point-ring`/
// `active-point-guide-line` testid convention already in this file's
// sibling component. Implementation must match this contract, or flag back
// if it's wrong.
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

const CHART_DATA = [
  { x: 0, y: 10 },
  { x: 1, y: 20 },
  { x: 2, y: 30 },
];

function renderOverlay(props: {
  activePoints?: ActivePoint[];
  pinnedPoints?: ActivePoint[];
  brokenYAxis?: boolean;
}) {
  return render(
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={CHART_DATA}>
        <CartesianGrid />
        <XAxis dataKey="x" type="number" domain={[0, 2]} />
        <YAxis domain={[0, 30]} />
        {/* A real <Line> is needed for Recharts to fully initialize its
            scale context in jsdom - the sibling chart components' own
            tests always render inside a real chart with at least one
            Line/data series; a bare axes-only chart left the scale hooks
            unresolved (`usePlotArea`/`useXAxisScale`/`useYAxisScale`
            returning null indefinitely), which was an artifact of this
            minimal harness, not a real product guard. */}
        <Line type="linear" dataKey="y" dot={false} isAnimationActive={false} />
        <ActivePointOverlay activePoints={props.activePoints ?? []} {...props} />
      </LineChart>
    </ResponsiveContainer>,
  );
}

describe("ActivePointOverlay: pinned-point overlay, distinct from the hover overlay (item 3, §2.2)", () => {
  installRechartsLayoutPolyfill();

  it("renders a distinct pinned-point ring, alongside (not instead of) the hover ring", async () => {
    const { container } = renderOverlay({
      activePoints: [{ x: 1, y: 20 }],
      pinnedPoints: [{ x: 0, y: 10 }],
    });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-testid="pinned-point-ring"]')).toHaveLength(1);
    });
  });

  it("gives the pinned ring a visually distinct (solid/filled) treatment from the hollow hover ring", async () => {
    const { container } = renderOverlay({
      activePoints: [{ x: 1, y: 20 }],
      pinnedPoints: [{ x: 0, y: 10 }],
    });

    await waitFor(() => {
      const hoverRing = container.querySelector('[data-testid="active-point-ring"]');
      const pinnedRing = container.querySelector('[data-testid="pinned-point-ring"]');
      expect(hoverRing).not.toBeNull();
      expect(pinnedRing).not.toBeNull();
      // The existing hover ring is unfilled (fill="none"); the pinned
      // overlay must be visually distinct - filled, per §2.2's "solid guide
      // line + filled ring vs the hover's translucent line + hollow ring".
      expect(hoverRing?.getAttribute("fill")).toBe("none");
      expect(pinnedRing?.getAttribute("fill")).not.toBe("none");
    });
  });

  it("draws a pinned guide line separate from the hover guide line", async () => {
    const { container } = renderOverlay({
      activePoints: [{ x: 1, y: 20 }],
      pinnedPoints: [{ x: 0, y: 10 }],
    });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="pinned-point-guide-line"]')).toHaveLength(1);
    });
  });

  it("renders nothing pinned when pinnedPoints is omitted (backward-compatible default)", async () => {
    const { container } = renderOverlay({ activePoints: [{ x: 1, y: 20 }] });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(1);
    });
    expect(container.querySelectorAll('[data-testid="pinned-point-ring"]')).toHaveLength(0);
  });

  it("renders one pinned ring per resolvable pinned point, skipping any that resolve to null (sparse-cell rule)", async () => {
    const { container } = renderOverlay({
      pinnedPoints: [
        { x: 0, y: 10 },
        { x: 1, y: 20 },
      ],
    });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="pinned-point-ring"]')).toHaveLength(2);
    });
  });
});

describe("ActivePointOverlay: y-axis break glyph (item 1, D2)", () => {
  installRechartsLayoutPolyfill();

  it("renders the break glyph when brokenYAxis is true", async () => {
    const { container } = renderOverlay({ brokenYAxis: true });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(1);
    });
  });

  it("renders no break glyph when brokenYAxis is false", async () => {
    const { container } = renderOverlay({ brokenYAxis: false });

    await waitFor(() => {
      // Something else in the chart must have resolved by now (the grid),
      // proving this isn't just "nothing rendered yet".
      expect(container.querySelector(".recharts-cartesian-grid")).not.toBeNull();
    });
    expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(0);
  });

  it("renders no break glyph when brokenYAxis is omitted (backward-compatible default)", async () => {
    const { container } = renderOverlay({ activePoints: [{ x: 1, y: 20 }] });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="active-point-ring"]')).toHaveLength(1);
    });
    expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(0);
  });
});

describe("ActivePointOverlay: guards on null scales (both new elements)", () => {
  // Deliberately WITHOUT the layout polyfill - ResponsiveContainer stays
  // 0x0 in jsdom (no ResizeObserver), so usePlotArea/useXAxisScale/
  // useYAxisScale resolve null. The existing component already guards this
  // for the hover overlay (`!plotArea || !xScale || !yScale`) - the pinned
  // overlay and break glyph must fail exactly as gracefully, not throw.
  it("renders neither the pinned ring nor the break glyph, without throwing, when scales are unresolved", () => {
    expect(() =>
      renderOverlay({ pinnedPoints: [{ x: 0, y: 10 }], brokenYAxis: true }),
    ).not.toThrow();

    const { container } = renderOverlay({ pinnedPoints: [{ x: 0, y: 10 }], brokenYAxis: true });
    expect(container.querySelectorAll('[data-testid="pinned-point-ring"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="y-axis-break-glyph"]')).toHaveLength(0);
  });
});
