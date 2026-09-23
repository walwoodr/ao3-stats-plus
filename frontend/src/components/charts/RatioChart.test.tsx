import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// Testing task T7 (docs/plans/chart-synced-data-table.md §10): mirror of
// TrendChart.test.tsx's rewrite for the ratio series - see that file's
// top-of-file comment for the full rationale (D1 Tooltip removal, D3/D5
// transposed visible table replacing the sr-only marker spans/table, §2.4's
// table-outside-role=img fix). RatioChart still plots the kudos-to-hits
// ratio over time with the same irregular-gap/single-point/non-color-only
// guarantees as TrendChart.
const SPARSE_RATIO_POINTS = [
  { capturedOn: "2026-01-03", ratio: 0.1 },
  { capturedOn: "2026-01-04", ratio: 0.14 },
  { capturedOn: "2026-02-20", ratio: 0 },
];

// See TrendChart.test.tsx's identical helper/comment: Recharts renders
// nothing (Tooltip's always-present wrapper div included) without a real
// measured size, so the "no Tooltip" check needs this scoped polyfill to be
// meaningful rather than trivially true.
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

describe("RatioChart", () => {
  it("renders a chart region labeled with the title", () => {
    render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

    expect(screen.getByRole("img", { name: /kudos-to-hits ratio/i })).toBeInTheDocument();
  });

  describe("no Recharts Tooltip popover (real layout required)", () => {
    installRechartsSizePolyfill();

    it("renders no Recharts Tooltip popover element", () => {
      const { container } = render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />,
      );

      expect(container.querySelector(".recharts-tooltip-wrapper")).toBeNull();
    });
  });

  describe("visible synced data table (D3/D5)", () => {
    it("renders a table named by the title, as a SIBLING of the role=img figure, not nested inside it", () => {
      render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

      const figure = screen.getByRole("img", { name: /kudos-to-hits ratio/i });
      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });

      expect(figure.contains(table)).toBe(false);
    });

    it("transposes dates to COLUMNS and the single ratio series to one ROW", () => {
      render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      expect(within(table).getAllByRole("columnheader")).toHaveLength(
        SPARSE_RATIO_POINTS.length + 1,
      );
      expect(within(table).getAllByRole("rowheader")).toHaveLength(1);
    });

    it("renders a zero ratio explicitly rather than blank/omitted", () => {
      render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      expect(within(table).getByText("0")).toBeInTheDocument();
    });

    it("renders a single date column for a single-point history", () => {
      render(<RatioChart title="Kudos-to-hits ratio" points={[SPARSE_RATIO_POINTS[0]]} />);

      expect(screen.getByRole("img", { name: /kudos-to-hits ratio/i })).toBeInTheDocument();
      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
    });
  });

  it("does not render the old sr-only per-point marker spans", () => {
    render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

    expect(screen.queryAllByTestId(/ratio-point-marker-/)).toHaveLength(0);
  });

  describe("with a leadIn synthetic baseline point", () => {
    const LEAD_IN = { capturedOn: "2014-01-01", ratio: 0 };

    it("adds no synthetic column when leadIn is omitted", () => {
      render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      expect(within(table).queryByText(/estimated baseline/i)).not.toBeInTheDocument();
    });

    it("produces identical output whether leadIn is omitted or explicitly undefined", () => {
      const { container, rerender } = render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />,
      );
      const omittedHtml = container.innerHTML;

      rerender(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={undefined} />,
      );

      expect(container.innerHTML).toBe(omittedHtml);
    });

    it("adds exactly one synthetic column to the visible table", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      expect(within(table).getAllByRole("columnheader")).toHaveLength(
        SPARSE_RATIO_POINTS.length + 2,
      );
    });

    it("renders the synthetic column's cell as exactly 0, never derived", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      const dataRow = within(table).getAllByRole("row")[1];
      const cells = within(dataRow).getAllByRole("cell");
      expect(cells[0].textContent).toBe("0");
    });

    it("labels the synthetic column's header as an estimated baseline, never a raw ISO date", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      const columnHeaders = within(table).getAllByRole("columnheader");
      const syntheticHeader = columnHeaders[1];

      expect(syntheticHeader.textContent).toMatch(/before/i);
      expect(syntheticHeader.textContent).toMatch(/2014/);
      expect(syntheticHeader.textContent).toMatch(/estimated baseline/i);
      expect(within(table).queryByText("2014-01-01")).not.toBeInTheDocument();
    });

    it("orders the synthetic column before the first real point", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      const columnHeaders = within(table).getAllByRole("columnheader");

      expect(columnHeaders[1].textContent).toMatch(/before/i);
      expect(columnHeaders[2].textContent).toMatch(SPARSE_RATIO_POINTS[0].capturedOn);
    });
  });

  describe("with no points and no leadIn", () => {
    it("renders without throwing", () => {
      expect(() => render(<RatioChart title="Kudos-to-hits ratio" points={[]} />)).not.toThrow();
    });

    it("shows an empty-state message instead of a chart region", () => {
      render(<RatioChart title="Kudos-to-hits ratio" points={[]} />);

      expect(screen.queryByRole("img", { name: /kudos-to-hits ratio/i })).not.toBeInTheDocument();
      expect(screen.getByText(/no data/i)).toBeInTheDocument();
    });
  });
});
