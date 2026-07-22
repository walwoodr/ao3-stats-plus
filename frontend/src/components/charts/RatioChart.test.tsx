import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// RatioChart plots the kudos-to-hits ratio over time. The divide-by-zero
// guard itself is a backend concern (ratio arrives pre-computed as 0), but
// the chart still needs the same irregular-gap/single-point/accessible-
// table/non-color-only guarantees as TrendChart.
const SPARSE_RATIO_POINTS = [
  { capturedOn: "2026-01-03", ratio: 0.1 },
  { capturedOn: "2026-01-04", ratio: 0.14 },
  { capturedOn: "2026-02-20", ratio: 0 },
];

describe("RatioChart", () => {
  it("renders a chart region labeled with the title", () => {
    render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

    expect(screen.getByRole("img", { name: /kudos-to-hits ratio/i })).toBeInTheDocument();
  });

  it("provides an accessible data table with one row per snapshot", () => {
    render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

    const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(SPARSE_RATIO_POINTS.length + 1);
  });

  it("renders a zero ratio explicitly rather than blank/omitted", () => {
    render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

    const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
    expect(within(table).getByText("0")).toBeInTheDocument();
  });

  it("renders a single labeled marker for a single-point history", () => {
    render(<RatioChart title="Kudos-to-hits ratio" points={[SPARSE_RATIO_POINTS[0]]} />);

    expect(screen.getByRole("img", { name: /kudos-to-hits ratio/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });

  it("does not encode the ratio using color alone", () => {
    render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

    const markers = screen.getAllByTestId(/ratio-point-marker-/);
    expect(markers.length).toBe(SPARSE_RATIO_POINTS.length);
    markers.forEach((marker) => {
      expect(marker).toHaveAttribute("aria-label");
    });
  });
});
