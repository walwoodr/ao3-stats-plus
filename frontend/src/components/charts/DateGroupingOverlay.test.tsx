import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DateGroupingOverlay, type DateGroupingOverlayRow } from "./DateGroupingOverlay";
import { toEpoch } from "../../lib/chartTimeAxis";

// Testing task T2 (docs/plans/date-hierarchy-grouping.md §10, §5):
// DateGroupingOverlay.tsx does not exist yet - every test below fails at
// the import, a genuine red for this whole file. This mirrors
// ActivePointOverlay.test.tsx's own harness (same ResizeObserver/
// offsetWidth/offsetHeight polyfill, same "a real <Line> is needed for
// Recharts to fully initialize its scale context in jsdom" precedent) -
// see that file's identical comment for the full rationale.
//
// The `rows` prop shape and the testids used below (`month-span-line`,
// `month-span-label`, `year-rule-line`, `year-label`) are this Testing
// stage's own concrete translation of §5.1/§5.2's prose into a callable
// contract, mirroring ActivePointOverlay.test.tsx's own precedent for doing
// exactly this. Implementation must match this contract, or flag back if
// it's wrong. Per the plan's §0 architecture rationale and this project's
// five-round tick-machinery history, this component must NEVER read from
// or alter `selectDisplayedTicks`/`interval={0}`/LeadInXAxisTick - it only
// consumes `usePlotArea`/`useXAxisScale` (the same public hooks
// ActivePointOverlay already uses) and the full `rows` array (every point,
// independent of which ~6 are sampled as day ticks).
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

// Mirrors the plan's own happy-path hard case (§1): a 2014 estimated-
// baseline lead-in plus a Jul/Aug 2026 cluster - 3 months (Sep 2014, Jul
// 2026, Aug 2026) across 2 years, with Aug 2026 deliberately a single-point
// month (the "still gets a label, never blank" case).
const LEAD_IN: DateGroupingOverlayRow = { capturedOn: "2014-09-06", xEpoch: toEpoch("2014-09-06") };
const JUL_1: DateGroupingOverlayRow = { capturedOn: "2026-07-01", xEpoch: toEpoch("2026-07-01") };
const JUL_2: DateGroupingOverlayRow = { capturedOn: "2026-07-15", xEpoch: toEpoch("2026-07-15") };
const AUG_1: DateGroupingOverlayRow = { capturedOn: "2026-08-10", xEpoch: toEpoch("2026-08-10") };
const HAPPY_PATH_ROWS = [LEAD_IN, JUL_1, JUL_2, AUG_1];

function renderOverlay(rows: DateGroupingOverlayRow[], domain?: [number, number]) {
  const epochs = rows.map((r) => r.xEpoch);
  const resolvedDomain = domain ?? [Math.min(...epochs), Math.max(...epochs)];
  const chartData = rows.map((r) => ({ xEpoch: r.xEpoch, y: 10 }));

  return render(
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData}>
        <CartesianGrid />
        <XAxis dataKey="xEpoch" type="number" scale="time" domain={resolvedDomain} />
        <YAxis domain={[0, 20]} />
        {/* A real <Line> is needed for Recharts to fully initialize its
            scale context in jsdom - see ActivePointOverlay.test.tsx's
            identical comment. */}
        <Line type="linear" dataKey="y" dot={false} isAnimationActive={false} />
        <DateGroupingOverlay rows={rows} />
      </LineChart>
    </ResponsiveContainer>,
  );
}

describe("DateGroupingOverlay: guards on null scales (pre-layout render)", () => {
  // Deliberately WITHOUT the layout polyfill - ResponsiveContainer stays
  // 0x0 in jsdom, so usePlotArea/useXAxisScale resolve null - the same
  // guard ActivePointOverlay already has for its own scale hooks.
  it("renders no marks and does not throw when scales are unresolved", () => {
    expect(() => renderOverlay(HAPPY_PATH_ROWS)).not.toThrow();

    const { container } = renderOverlay(HAPPY_PATH_ROWS);
    expect(container.querySelectorAll('[data-testid="month-span-line"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="year-rule-line"]')).toHaveLength(0);
  });
});

describe("DateGroupingOverlay: aria-hidden decorative marker group (§6)", () => {
  installRechartsLayoutPolyfill();

  it("renders its marks inside a g[aria-hidden=true] group", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const group = container.querySelector('g[aria-hidden="true"][data-testid="date-grouping-overlay"]');
      expect(group).not.toBeNull();
      expect(group?.querySelector('[data-testid="month-span-line"]')).not.toBeNull();
    });
  });
});

describe("DateGroupingOverlay: month span marks (§5.2, every month present)", () => {
  installRechartsLayoutPolyfill();

  it("draws exactly one month-span-line and one month-span-label per distinct month present", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="month-span-line"]')).toHaveLength(3);
      expect(container.querySelectorAll('[data-testid="month-span-label"]')).toHaveLength(3);
    });
  });

  it("labels each month span with its abbreviation (Sep, Jul, Aug - not a full date)", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const labels = Array.from(
        container.querySelectorAll('[data-testid="month-span-label"]'),
      ).map((el) => el.textContent);
      expect(labels).toEqual(["Sep", "Jul", "Aug"]);
    });
  });

  it("still draws a label for a single-point month (Sep 2014, Aug 2026 - never blank)", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const labels = Array.from(
        container.querySelectorAll('[data-testid="month-span-label"]'),
      ).map((el) => el.textContent);
      // Sep (lead-in-only) and Aug (single real point) both single-point
      // months in this fixture - both must still have produced a label.
      expect(labels).toContain("Sep");
      expect(labels).toContain("Aug");
    });
  });

  it("collapses a single-point month's span line to one x (x1 === x2), rather than omitting the line", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const lines = container.querySelectorAll('[data-testid="month-span-line"]');
      // Sep 2014 (index 0, lead-in-only) is a single-point month.
      const sepLine = lines[0];
      expect(sepLine.getAttribute("x1")).toBe(sepLine.getAttribute("x2"));
    });
  });

  it("draws a Jul 2026 span line whose two endpoints differ (multi-point month, not collapsed)", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const lines = container.querySelectorAll('[data-testid="month-span-line"]');
      const julLine = lines[1];
      expect(julLine.getAttribute("x1")).not.toBe(julLine.getAttribute("x2"));
    });
  });
});

describe("DateGroupingOverlay: year rule + label marks (§5.2)", () => {
  installRechartsLayoutPolyfill();

  it("draws exactly one year-rule-line per year TRANSITION (2 distinct years -> 1 rule)", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="year-rule-line"]')).toHaveLength(1);
    });
  });

  it("draws one year-label per distinct year present, including the first (which gets no rule)", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const labels = Array.from(container.querySelectorAll('[data-testid="year-label"]')).map(
        (el) => el.textContent,
      );
      expect(labels).toEqual(["2014", "2026"]);
    });
  });

  it("gives the year rule a dashed stroke (reads as a boundary, not the plotted line)", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const rule = container.querySelector('[data-testid="year-rule-line"]');
      expect(rule?.getAttribute("stroke-dasharray")).toBeTruthy();
    });
  });

  it("draws no year rule at all for single-year data (no transition to mark)", async () => {
    const { container } = renderOverlay([JUL_1, JUL_2, AUG_1]);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid="month-span-line"]')).toHaveLength(2);
    });
    expect(container.querySelectorAll('[data-testid="year-rule-line"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="year-label"]')).toHaveLength(1);
  });
});

describe("DateGroupingOverlay: positions derived from real in-domain epochs (§0.2, load-bearing)", () => {
  installRechartsLayoutPolyfill();

  it("places a later month's span line strictly to the right of (greater x than) an earlier month's, proving pixel positions track the real scale rather than array index", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const lines = container.querySelectorAll('[data-testid="month-span-line"]');
      const sepX = Number(lines[0].getAttribute("x1"));
      const julX = Number(lines[1].getAttribute("x1"));
      const augX = Number(lines[2].getAttribute("x1"));
      expect(sepX).toBeLessThan(julX);
      expect(julX).toBeLessThan(augX);
    });
  });

  it("places the year rule at the midpoint between the two straddling points' pixels, not at a synthesized Jan-1 boundary", async () => {
    const { container } = renderOverlay(HAPPY_PATH_ROWS);

    await waitFor(() => {
      const rule = container.querySelector('[data-testid="year-rule-line"]');
      const leadInLine = container.querySelectorAll('[data-testid="month-span-line"]')[0];
      const julLine = container.querySelectorAll('[data-testid="month-span-line"]')[1];

      const ruleX = Number(rule?.getAttribute("x1"));
      const leadInX = Number(leadInLine.getAttribute("x1"));
      const julStartX = Number(julLine.getAttribute("x1"));

      // Strictly between the last 2014 point's pixel and the first 2026
      // point's pixel - never coinciding with either, and never off to one
      // side (which a synthesized boundary date could produce).
      expect(ruleX).toBeGreaterThan(leadInX);
      expect(ruleX).toBeLessThan(julStartX);
    });
  });
});

describe("DateGroupingOverlay: bounds guard (§5.2, defense against extrapolation)", () => {
  installRechartsLayoutPolyfill();

  it("skips a month/year mark whose computed x falls outside the declared plot domain", async () => {
    // The XAxis domain below deliberately EXCLUDES the lead-in's epoch (it
    // sits far to the left of domainMin) while DateGroupingOverlay still
    // receives it in `rows` (mirrors how the real chart's overlay reads
    // every row independent of the declared axis domain/ticks) - per §0.2,
    // d3 scales don't clamp, so xScale(leadInEpoch) extrapolates to a
    // pixel left of plotArea.x. The guard must skip drawing that mark
    // rather than let it render off-canvas.
    const narrowDomain: [number, number] = [JUL_1.xEpoch, AUG_1.xEpoch];
    const { container } = renderOverlay(HAPPY_PATH_ROWS, narrowDomain);

    await waitFor(() => {
      // Only Jul and Aug's marks are within the declared domain - Sep
      // 2014's month-span mark and the 2014->2026 year rule/label must be
      // silently skipped, not drawn at a clipped/off-canvas position.
      expect(container.querySelectorAll('[data-testid="month-span-line"]')).toHaveLength(2);
      const monthLabels = Array.from(
        container.querySelectorAll('[data-testid="month-span-label"]'),
      ).map((el) => el.textContent);
      expect(monthLabels).not.toContain("Sep");
    });
  });
});

describe("DateGroupingOverlay: empty rows", () => {
  installRechartsLayoutPolyfill();

  it("renders no marks and does not throw for an empty rows array", async () => {
    expect(() => renderOverlay([], [0, 1])).not.toThrow();

    const { container } = renderOverlay([], [0, 1]);
    await waitFor(() => {
      expect(container.querySelector(".recharts-cartesian-grid")).not.toBeNull();
    });
    expect(container.querySelectorAll('[data-testid="month-span-line"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="year-rule-line"]')).toHaveLength(0);
  });
});
