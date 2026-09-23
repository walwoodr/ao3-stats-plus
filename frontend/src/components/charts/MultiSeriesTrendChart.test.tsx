import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";

// Testing task T8 (docs/plans/chart-synced-data-table.md §10): rewrite for
// the hover-tooltip -> synced-data-table replacement. MultiSeriesTrendChart
// is the N-series sibling of TrendChart - it reuses the same
// accessibility-skeleton changes as T6/T7 (no <Tooltip>, visible transposed
// table OUTSIDE role="img"), but here the table's ROWS are the selected
// works (not a single degenerate row) and each row header carries the
// (shape, color) identity description that used to live in the removed
// sr-only table's column headers (D5). buildChartData itself (the union-
// date/lead-* dataKey logic) is UNCHANGED by this feature - see
// MultiSeriesTrendChart.buildChartData.test.ts, which is untouched.
function legendDescription(styleIndex: number): string {
  const slot = SERIES_STYLE_SLOTS[styleIndex];
  return `${slot.colorRole} ${slot.shape} marker`;
}

// See TrendChart.test.tsx's identical helper/comment: needed only for the
// "no Tooltip" check, which requires real Recharts layout to be meaningful.
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

const WORK_A: SeriesDatum = {
  workId: 1,
  title: "Work A",
  styleIndex: 0,
  points: [
    { capturedOn: "2026-01-01", value: 10 },
    { capturedOn: "2026-01-08", value: 20 },
  ],
};

const WORK_B: SeriesDatum = {
  workId: 2,
  title: "Work B",
  styleIndex: 1,
  // No point on 2026-01-01 - added to the comparison after Work A's first
  // snapshot, the common "ragged history" corner case.
  points: [{ capturedOn: "2026-01-08", value: 5 }],
};

describe("MultiSeriesTrendChart", () => {
  it("renders a chart region labeled with the title", () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

    expect(screen.getByRole("img", { name: /^hits$/i })).toBeInTheDocument();
  });

  it("hides the Recharts plot from assistive tech via aria-hidden", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  describe("no Recharts Tooltip popover (real layout required)", () => {
    installRechartsSizePolyfill();

    it("renders no Recharts Tooltip popover element", () => {
      const { container } = render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      expect(container.querySelector(".recharts-tooltip-wrapper")).toBeNull();
    });
  });

  describe("visible legend", () => {
    it("renders one legend entry per selected work, showing its title", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      // Scoped to the legend's own <ul> - the same work title is now also
      // rendered in the visible synced table's row headers (D5), so an
      // unscoped query would be ambiguous (multiple exact "Work A"/"Work B"
      // matches on the page). Matches the same scoping mechanism the
      // sibling test below already uses for this exact reason.
      const legend = screen.getByRole("list");
      expect(within(legend).getByText("Work A")).toBeInTheDocument();
      expect(within(legend).getByText("Work B")).toBeInTheDocument();
    });

    it("does not render the worded style description in the visible legend", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      // Scoped to the legend's own <ul> - the worded description does still
      // exist elsewhere on the page (the visible synced table's row
      // headers), so an unscoped query would find it there instead and give
      // a false pass.
      const legend = screen.getByRole("list");
      expect(
        within(legend).queryByText(new RegExp(legendDescription(0), "i")),
      ).not.toBeInTheDocument();
      expect(
        within(legend).queryByText(new RegExp(legendDescription(1), "i")),
      ).not.toBeInTheDocument();
    });

    it("gives each work a distinct worded style description (format still pinned for the visible table's row headers)", () => {
      expect(legendDescription(WORK_A.styleIndex)).not.toBe(legendDescription(WORK_B.styleIndex));
    });
  });

  // The old sr-only per-work marker spans are removed entirely (§2.4) -
  // their content (per-work, per-date values) is now carried by the one
  // visible transposed table below, not duplicated in a separate sr-only
  // surface.
  it("does not render the old sr-only per-work marker spans", () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

    expect(screen.queryAllByTestId(/multi-series-point-marker-/)).toHaveLength(0);
  });

  describe("visible synced data table (D3/D5)", () => {
    it("renders a table named by the title, as a SIBLING of the role=img figure, not nested inside it", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      const figure = screen.getByRole("img", { name: /^hits$/i });
      const table = screen.getByRole("table", { name: /hits/i });

      expect(figure.contains(table)).toBe(false);
    });

    it("has one date column-header per union date, plus the corner cell", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      const table = screen.getByRole("table", { name: /hits/i });
      const columnHeaders = within(table).getAllByRole("columnheader");
      // corner + 2026-01-01 + 2026-01-08.
      expect(columnHeaders).toHaveLength(3);
    });

    it("has one row-header per selected work, carrying its title", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      const table = screen.getByRole("table", { name: /hits/i });
      const rowHeaders = within(table).getAllByRole("rowheader");
      expect(rowHeaders).toHaveLength(2);
      expect(rowHeaders[0].textContent).toContain("Work A");
      expect(rowHeaders[1].textContent).toContain("Work B");
    });

    // The worded (shape, color) description no longer renders in the
    // visible legend (removed per 2026-08-09 TECH_DEBT.md) and no longer
    // lives in a sr-only column header - it moves to each work's ROW header
    // in the now-visible table (D5), the only surface carrying it now.
    it("carries each work's (shape, color) style description in its row header, for screen-reader users", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      const table = screen.getByRole("table", { name: /hits/i });
      const rowHeaders = within(table).getAllByRole("rowheader");

      expect(rowHeaders[0].textContent).toContain(legendDescription(WORK_A.styleIndex));
      expect(rowHeaders[1].textContent).toContain(legendDescription(WORK_B.styleIndex));
    });

    it("renders an explicit '—' for a work with no point at a given union date, not a blank cell", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      const table = screen.getByRole("table", { name: /hits/i });
      const rows = within(table).getAllByRole("row");
      // Work B's row (index 2: header row, Work A row, Work B row).
      const workBRow = rows[2];

      expect(within(workBRow).getByText("—")).toBeInTheDocument();
      expect(within(workBRow).getByText("5")).toBeInTheDocument();
    });

    it("renders real values for every work that has a point at a given date", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />);

      const table = screen.getByRole("table", { name: /hits/i });
      expect(within(table).getByText("10")).toBeInTheDocument();
      expect(within(table).getByText("20")).toBeInTheDocument();
      expect(within(table).getByText("5")).toBeInTheDocument();
    });
  });

  describe("with 0 series selected", () => {
    it("renders without throwing", () => {
      expect(() =>
        render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[]} />),
      ).not.toThrow();
    });

    it("shows the 'select at least one work' empty state instead of a chart region", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[]} />);

      expect(screen.queryByRole("img", { name: /^hits$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/select at least one work to compare/i)).toBeInTheDocument();
    });
  });

  describe("a work with a single point", () => {
    it("still renders a lone value in the table rather than an error", () => {
      const singlePointWork: SeriesDatum = {
        workId: 3,
        title: "Work C",
        styleIndex: 2,
        points: [{ capturedOn: "2026-02-01", value: 7 }],
      };

      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[singlePointWork]} />);

      const table = screen.getByRole("table", { name: /hits/i });
      expect(within(table).getByText("7")).toBeInTheDocument();
    });
  });

  // Testing task 9 (docs/plans/usds-dataviz-color-scheme.md): the full
  // 10-work cap-raise state - corner case "7th-10th work selected" from that
  // plan's section 4, exercising style slots 6-9 (the 4 new shapes) for the
  // first time in the transposed table's row headers.
  describe("10-series state (full cap-raise)", () => {
    const TEN_WORKS: SeriesDatum[] = Array.from({ length: 10 }, (_, i) => ({
      workId: i + 1,
      title: `Work ${i + 1}`,
      styleIndex: i,
      points: [{ capturedOn: "2026-01-01", value: (i + 1) * 10 }],
    }));

    it("renders all 10 works' titles in the visible legend", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={TEN_WORKS} />);

      TEN_WORKS.forEach((work) => {
        expect(screen.getAllByText(new RegExp(work.title, "i")).length).toBeGreaterThan(0);
      });
    });

    it("gives all 10 works a distinct worded style description in the visible table's row headers", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={TEN_WORKS} />);

      const table = screen.getByRole("table", { name: /hits/i });
      const rowHeaders = within(table).getAllByRole("rowheader");
      const descriptions = rowHeaders.map((h) => h.textContent);
      expect(new Set(descriptions).size).toBe(10);
    });

    it("has one date column plus 10 work rows in the visible table", () => {
      render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={TEN_WORKS} />);

      const table = screen.getByRole("table", { name: /hits/i });
      // corner + one shared date column (all 10 works share 2026-01-01).
      expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
      expect(within(table).getAllByRole("rowheader")).toHaveLength(10);
    });
  });
});
