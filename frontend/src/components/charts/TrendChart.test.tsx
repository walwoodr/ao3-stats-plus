import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// TrendChart plots one or more numeric series against real (irregularly
// spaced) capture dates, per the plan: a visible marker per snapshot (never
// implying daily granularity between sparse points), a single-point series
// renders one labeled marker rather than an error/blank state, and there's
// an accessible data-table alternative so the trend isn't color-only.
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

  it("provides an accessible data table with one row per snapshot", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

    const table = screen.getByRole("table", { name: /total hits/i });
    const rows = within(table).getAllByRole("row");
    // header row + one row per data point
    expect(rows).toHaveLength(SPARSE_POINTS.length + 1);
  });

  it("does not fabricate rows for the irregular gap between sparse points", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

    const table = screen.getByRole("table", { name: /total hits/i });
    expect(within(table).getByText("2026-02-20")).toBeInTheDocument();
    expect(within(table).queryByText("2026-01-20")).not.toBeInTheDocument();
  });

  it("renders the value for every point in the accessible table", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

    const table = screen.getByRole("table", { name: /total hits/i });
    SPARSE_POINTS.forEach((point) => {
      expect(within(table).getByText(String(point.value))).toBeInTheDocument();
    });
  });

  it("renders a single labeled marker for a single-point history, not an error or blank state", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={[SPARSE_POINTS[0]]} />);

    expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /total hits/i });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });

  it("does not encode data using color alone (each marker gets a text/shape attribute)", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

    const markers = screen.getAllByTestId(/trend-point-marker-/);
    expect(markers.length).toBe(SPARSE_POINTS.length);
    markers.forEach((marker) => {
      expect(marker).toHaveAttribute("aria-label");
    });
  });
});
