import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Recharts' ResponsiveContainer renders NOTHING (not even its children, so
// not even a <Tooltip>'s always-present-but-hidden wrapper div) until it
// measures a positive size via ResizeObserver - jsdom has no real layout
// engine and doesn't provide ResizeObserver, so without this polyfill the
// "no Tooltip" check below would trivially "pass" today for the wrong
// reason (nothing in the aria-hidden chart renders at all, Tooltip
// included) rather than because the feature actually removed it. Verified
// directly against the installed recharts@3.10.0 source
// (node_modules/recharts/es6/component/ResponsiveContainer.js's
// isAcceptableSize bail-out and TooltipBoundingBox.js's always-rendered,
// visibility:hidden-when-inactive wrapper div) - not an unverifiable
// external-system assumption, but scoped to its own describe block (rather
// than the shared setup file) since only this one assertion needs real
// Recharts SVG layout, mirroring MultiSeriesTrendChart.leadIn.test.tsx's
// identical polyfill/scoping choice.
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

// Testing task T6 (docs/plans/chart-synced-data-table.md §10): rewrite for
// the hover-tooltip -> synced-data-table replacement. TrendChart still
// plots one numeric series against real (irregularly spaced) capture
// dates, but per D1 the Recharts <Tooltip> popover is REMOVED entirely, and
// per D3/D5 the old sr-only per-point marker spans and the old sr-only
// one-row-per-point <table> are both gone, replaced by ONE visible,
// transposed (dates as COLUMNS, the single "Hits" series as one ROW) table
// rendered as a SIBLING of the aria-hidden chart, OUTSIDE the
// `role="img"` figure (§2.4's fix for the latent nesting/AT-exposure
// finding). Every test below is red today because TrendChart.tsx hasn't
// been rewired yet - it still renders the old <Tooltip>, the old sr-only
// marker spans, and the old sr-only per-point-row table nested inside the
// figure.
const SPARSE_POINTS = [
  { capturedOn: "2026-01-03", value: 100 },
  { capturedOn: "2026-01-04", value: 140 },
  { capturedOn: "2026-02-20", value: 300 },
];

describe("TrendChart", () => {
  it("renders a chart region labeled with the title", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

    expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
  });

  // D1: the Recharts hover-tooltip popover is replaced, not supplemented -
  // no <Tooltip> element should exist in the rendered tree at all (the
  // plan's default position; see TrendChart.sync.test.tsx for the fallback
  // contingency this would trigger if the active-index state turns out to
  // require a zero-UI <Tooltip> to stay alive). Needs the real-layout
  // polyfill above - see its comment for why.
  describe("no Recharts Tooltip popover (real layout required)", () => {
    installRechartsSizePolyfill();

    it("renders no Recharts Tooltip popover element", () => {
      const { container } = render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />,
      );

      expect(container.querySelector(".recharts-tooltip-wrapper")).toBeNull();
    });
  });

  describe("visible synced data table (D3/D5)", () => {
    it("renders a table named by the title, as a SIBLING of the role=img figure, not nested inside it", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

      const figure = screen.getByRole("img", { name: /total hits/i });
      const table = screen.getByRole("table", { name: /total hits/i });

      expect(figure.contains(table)).toBe(false);
    });

    it("transposes dates to COLUMNS and the single series to one ROW", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

      const table = screen.getByRole("table", { name: /total hits/i });
      // one date column-header per point + the corner cell.
      expect(within(table).getAllByRole("columnheader")).toHaveLength(
        SPARSE_POINTS.length + 1,
      );
      // exactly one series row (single-series is the degenerate N=1 case).
      expect(within(table).getAllByRole("rowheader")).toHaveLength(1);
    });

    it("labels each date column with the real capturedOn date", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

      const table = screen.getByRole("table", { name: /total hits/i });
      SPARSE_POINTS.forEach((point) => {
        expect(
          within(table).getByRole("columnheader", { name: point.capturedOn }),
        ).toBeInTheDocument();
      });
    });

    it("does not fabricate a column for the irregular gap between sparse points", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

      const table = screen.getByRole("table", { name: /total hits/i });
      expect(within(table).getByText("2026-02-20")).toBeInTheDocument();
      expect(within(table).queryByText("2026-01-20")).not.toBeInTheDocument();
    });

    it("renders the value for every point in the single row's cells", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

      const table = screen.getByRole("table", { name: /total hits/i });
      SPARSE_POINTS.forEach((point) => {
        expect(within(table).getByText(String(point.value))).toBeInTheDocument();
      });
    });

    it("renders a single date column for a single-point history, not an error or blank state", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={[SPARSE_POINTS[0]]} />);

      expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
      const table = screen.getByRole("table", { name: /total hits/i });
      expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
    });
  });

  // The old sr-only per-point marker spans and the old one-row-per-point
  // sr-only table are both removed (§2.4) - their accessible content now
  // lives entirely in the one visible table above, not duplicated.
  it("does not render the old sr-only per-point marker spans", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

    expect(screen.queryAllByTestId(/trend-point-marker-/)).toHaveLength(0);
  });

  describe("with a leadIn synthetic baseline point", () => {
    const LEAD_IN = { capturedOn: "2014-01-01", value: 0 };

    it("adds no synthetic column when leadIn is omitted", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

      const table = screen.getByRole("table", { name: /total hits/i });
      expect(within(table).queryByText(/estimated baseline/i)).not.toBeInTheDocument();
    });

    it("produces identical output whether leadIn is omitted or explicitly undefined", () => {
      const { container, rerender } = render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />,
      );
      const omittedHtml = container.innerHTML;

      rerender(
        <TrendChart
          title="Total hits"
          valueLabel="Hits"
          points={SPARSE_POINTS}
          leadIn={undefined}
        />,
      );

      expect(container.innerHTML).toBe(omittedHtml);
    });

    it("adds exactly one synthetic column to the visible table", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      // corner + one synthetic + one per real point.
      expect(within(table).getAllByRole("columnheader")).toHaveLength(
        SPARSE_POINTS.length + 2,
      );
    });

    // Risk #3 (plan §5.2): the lead-in/zero-basis label that used to live in
    // the removed tooltip's formatTooltipLabel now lives in the synthetic
    // lead-in COLUMN's header, never a raw ISO date.
    it("labels the synthetic column's header as an estimated baseline, never a raw ISO date", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      const columnHeaders = within(table).getAllByRole("columnheader");
      const syntheticHeader = columnHeaders[1]; // corner is index 0

      expect(syntheticHeader.textContent).toMatch(/before/i);
      expect(syntheticHeader.textContent).toMatch(/2014/);
      expect(syntheticHeader.textContent).toMatch(/estimated baseline/i);
      expect(within(table).queryByText("2014-01-01")).not.toBeInTheDocument();
    });

    it("gives the synthetic column's cell a value of exactly 0", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      const dataRow = within(table).getAllByRole("row")[1];
      const cells = within(dataRow).getAllByRole("cell");
      expect(cells[0].textContent).toBe("0");
    });

    it("orders the synthetic column before the first real point", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      const columnHeaders = within(table).getAllByRole("columnheader");

      expect(columnHeaders[1].textContent).toMatch(/before/i);
      expect(columnHeaders[2].textContent).toMatch(SPARSE_POINTS[0].capturedOn);
    });

    it("still renders correctly for a single real point plus a leadIn (a drawable two-point trend)", () => {
      render(
        <TrendChart
          title="Total hits"
          valueLabel="Hits"
          points={[SPARSE_POINTS[0]]}
          leadIn={LEAD_IN}
        />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      // corner + synthetic + one real point.
      expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    });
  });

  // No current caller mounts this with empty points and no leadIn
  // (DashboardPage only mounts it once aggregateSeries.length > 0), but the
  // component is reusable and has Storybook stories, so it must degrade to
  // an empty state rather than throwing when chartData ends up empty.
  describe("with no points and no leadIn", () => {
    it("renders without throwing", () => {
      expect(() =>
        render(<TrendChart title="Total hits" valueLabel="Hits" points={[]} />),
      ).not.toThrow();
    });

    it("shows an empty-state message instead of a chart region", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={[]} />);

      expect(screen.queryByRole("img", { name: /total hits/i })).not.toBeInTheDocument();
      expect(screen.getByText(/no data/i)).toBeInTheDocument();
    });
  });
});
