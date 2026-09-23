import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Testing tasks 5 + 6 (docs/plans/per-work-zero-basis-dates.md, section 7):
// the visible dashed lead-in line + zero dot, and the accessible-layer
// (sr-only markers/table, visible-axis tickFormatter) representation of
// each work's zero-basis point. New file, not an extension of the existing
// MultiSeriesTrendChart.test.tsx, both for CODE_STANDARDS.md's file-length
// budget and so the ResizeObserver polyfill below (needed only for the
// "visible chart" assertions in this file) stays scoped away from that
// file's simpler, layout-independent assertions (role=img, legend text,
// sr-only markers/table).
//
// A few tests below are explicitly commented as "regression fences" rather
// than red-today assertions: negative corner cases (e.g. "no dashed line
// for a work without a leadIn") that already hold before any implementation
// exists, simply because nothing draws one yet. They still earn their place
// once the feature lands (catching a future regression), but per this
// stage's "confirm every new test fails" discipline they're called out by
// name rather than silently counted alongside the genuinely-red ones.
//
// MASTER.md's ink-soft/card contrast (WCAG 1.4.11, >=3:1 for non-text
// graphical objects) was computed directly from colorTokens.ts's real hex
// pairs during Testing, per the plan's instruction to confirm (not
// re-derive) this: light #7A6B72 on #FFFFFF is ~5.03:1, dark #B7A8AF on
// #2B232A is ~6.71:1 (relative-luminance WCAG formula). Both comfortably
// clear 3:1 in both modes - nothing marginal to flag.
//
// Recharts' ResponsiveContainer measures its DOM node via ResizeObserver
// and renders nothing (0x0) without it - jsdom has no real layout engine
// and this project's test setup (src/test/setup.ts) doesn't polyfill
// ResizeObserver, since no pre-existing test needed to inspect real SVG
// output. Confirmed via a throwaway probe render: without this polyfill,
// zero <path>/<circle> elements appear inside the aria-hidden chart region
// at all (only the unrelated small legend glyph <svg> does); with it, real
// Recharts <path>/<circle> elements with genuine stroke/fill attributes
// appear, matching what a real browser lays out. Scoped to this describe
// block only (beforeAll/afterAll) rather than added to the shared setup
// file, so it can't change behavior for any other test in the suite.
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

const WORK_WITH_LEAD: SeriesDatum = {
  workId: 1,
  title: "Work A",
  styleIndex: 0,
  points: [{ capturedOn: "2026-01-01", value: 10 }],
  leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01" },
};

const WORK_NO_LEAD: SeriesDatum = {
  workId: 2,
  title: "Work B",
  styleIndex: 1,
  points: [{ capturedOn: "2026-01-01", value: 5 }],
};

describe("MultiSeriesTrendChart: visible dashed lead-in line + zero dot", () => {
  installRechartsSizePolyfill();

  it("renders a dashed, inkSoft-stroked lead line for a work with a leadIn", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_WITH_LEAD]} />,
    );

    const leadPath = container.querySelector('path[stroke-dasharray="4 4"]');
    expect(leadPath).not.toBeNull();
    expect(leadPath?.getAttribute("stroke")).toBe(LIGHT_COLOR_TOKENS.inkSoft);
  });

  // Regression fence, not a red-today assertion (already holds
  // pre-implementation - see the "no zero dot" test below for the same
  // note).
  it("does not render a dashed 4 4 lead line for a work without a leadIn", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_NO_LEAD]} />,
    );

    expect(container.querySelector('path[stroke-dasharray="4 4"]')).toBeNull();
  });

  // The lead line is explicitly NOT the work's own series color/dash slot
  // (plan: "Explicitly not the work's own series color or dash slot") -
  // Work A's own slot (styleIndex 0) is solid wine (LIGHT_COLOR_TOKENS.
  // series[0]), so the lead segment must use a visibly distinct stroke.
  it("uses inkSoft for the lead line, never the work's own series color", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_WITH_LEAD]} />,
    );

    const leadPath = container.querySelector('path[stroke-dasharray="4 4"]');
    expect(leadPath).not.toBeNull();
    expect(leadPath?.getAttribute("stroke")).not.toBe(LIGHT_COLOR_TOKENS.series[0]);
  });

  it("renders one muted inkSoft zero dot per work with a leadIn", () => {
    const twoLeadIns: SeriesDatum = {
      workId: 3,
      title: "Work C",
      styleIndex: 2,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: { capturedOn: "2019-01-01", label: "Published 2019-01-01" },
    };

    const { container } = render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[WORK_WITH_LEAD, twoLeadIns]}
      />,
    );

    const inkSoftCircles = Array.from(container.querySelectorAll("circle")).filter(
      (circle) => circle.getAttribute("fill") === LIGHT_COLOR_TOKENS.inkSoft,
    );
    expect(inkSoftCircles).toHaveLength(2);
  });

  // Regression fence, not a red-today assertion: with no series carrying a
  // leadIn, this already holds pre-implementation (nothing paints an
  // inkSoft circle at all yet) - kept as a named test so a future change
  // that starts drawing zero dots unconditionally gets caught.
  it("renders no zero dot at all when no series has a leadIn", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_NO_LEAD]} />,
    );

    const inkSoftCircles = Array.from(container.querySelectorAll("circle")).filter(
      (circle) => circle.getAttribute("fill") === LIGHT_COLOR_TOKENS.inkSoft,
    );
    expect(inkSoftCircles).toHaveLength(0);
  });

  // Axis-label/precision treatment: the visible (aria-hidden) XAxis
  // tickFormatter and the sr-only table's date cell both consult the same
  // capturedOn -> label map (plan: "The sr-only table's date cell and the
  // categorical XAxis tickFormatter use this map"), so a zero-basis-only
  // slot's visible tick reads the same synthetic-baseline wording as the
  // accessible layer, never a bare fabricated ISO date.
  it("shows the zero-basis label (not the raw ISO date) on the visible chart's axis tick for a fallback slot", () => {
    const fallbackWork: SeriesDatum = {
      workId: 4,
      title: "Work D",
      styleIndex: 3,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
    };

    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[fallbackWork]} />,
    );

    const hiddenChart = container.querySelector('[aria-hidden="true"]');
    expect(hiddenChart?.textContent).toMatch(/Before 2018 \(estimated baseline\)/);
    expect(hiddenChart?.textContent).not.toMatch(/2018-01-01/);
  });
});

// Testing task T8 update (docs/plans/chart-synced-data-table.md §10): this
// describe block used to cover the sr-only per-work marker spans and the
// old sr-only one-row-per-date table - both are removed entirely per §2.4
// (see MultiSeriesTrendChart.test.tsx's "does not render the old sr-only
// per-work marker spans" test for that removal, not duplicated here). What
// remains genuinely specific to zero-basis injection is how each work's
// leadIn surfaces as a COLUMN (not a row - the table is transposed, D3) in
// the now-visible synced table, so these tests are rewritten to that shape
// rather than dropped outright.
describe("MultiSeriesTrendChart: the visible synced table gains zero-basis columns", () => {
  it("adds a zero-basis column whose header shows the leadIn label, not a raw ISO date", () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_WITH_LEAD]} />);

    const table = screen.getByRole("table", { name: /hits/i });
    expect(
      within(table).getByRole("columnheader", { name: "Published 2020-01-01" }),
    ).toBeInTheDocument();
    expect(within(table).queryByText("2020-01-01")).not.toBeInTheDocument();
  });

  it("shows 0 in the zero-basis column's cell for the work it belongs to, and '—' for a work with no point/leadIn there", () => {
    render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[WORK_WITH_LEAD, WORK_NO_LEAD]}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const rows = within(table).getAllByRole("row");
    // header row, Work A's row, Work B's row (column order: zero-basis
    // column first, per §5.2's "never surface a raw ISO date" ordering).
    const workARow = rows[1];
    const workBRow = rows[2];
    const workACells = within(workARow).getAllByRole("cell");
    const workBCells = within(workBRow).getAllByRole("cell");

    expect(workACells[0].textContent).toBe("0");
    expect(workBCells[0].textContent).toBe("—");
  });

  it("labels a shared fallback zero-basis column with a Before-<year> wording, not the fabricated Jan-1 date", () => {
    const fallbackA: SeriesDatum = {
      workId: 5,
      title: "Work E",
      styleIndex: 4,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
    };
    const fallbackB: SeriesDatum = {
      workId: 6,
      title: "Work F",
      styleIndex: 5,
      points: [{ capturedOn: "2026-01-01", value: 2 }],
      leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
    };

    render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[fallbackA, fallbackB]} />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    expect(
      within(table).getByRole("columnheader", { name: "Before 2018 (estimated baseline)" }),
    ).toBeInTheDocument();
    expect(within(table).queryByText("2018-01-01")).not.toBeInTheDocument();
  });

  // Corner case (plan section 4): when a fallback slot happens to equal
  // another work's real capture date, the shared column is NOT "zero-basis-
  // only" - its header must show the raw ISO date (a real capture exists
  // there), not mislabel a real capture as a baseline.
  it("prefers the raw ISO date over a baseline label when a fallback slot coincides with another work's real capture date", () => {
    const fallbackWork: SeriesDatum = {
      workId: 7,
      title: "Work G",
      styleIndex: 0,
      points: [{ capturedOn: "2026-01-01", value: 1 }],
      leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
    };
    const realPointOnSameSlot: SeriesDatum = {
      workId: 8,
      title: "Work H",
      styleIndex: 1,
      points: [{ capturedOn: "2018-01-01", value: 99 }],
    };

    render(
      <MultiSeriesTrendChart
        title="Hits"
        valueLabel="Hits"
        series={[fallbackWork, realPointOnSameSlot]}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    expect(within(table).getByRole("columnheader", { name: "2018-01-01" })).toBeInTheDocument();
    expect(within(table).queryByText("Before 2018 (estimated baseline)")).not.toBeInTheDocument();
  });
});
