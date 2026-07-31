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
      expect(marker.textContent).not.toBe("");
    });
  });

  // leadIn mirrors TrendChart's mechanism: the synthetic ratio is a FIXED
  // baseline of exactly 0, matching TrendChart's hits/kudos zero-baseline
  // convention, never derived from real hits/kudos (there are none yet at
  // that point). These tests guard the synthetic value against drift.
  describe("with a leadIn synthetic baseline point", () => {
    const LEAD_IN = { capturedOn: "2014-01-01", ratio: 0 };

    it("adds no synthetic marker or table row when leadIn is omitted", () => {
      render(<RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} />);

      expect(screen.getAllByTestId(/ratio-point-marker-/)).toHaveLength(SPARSE_RATIO_POINTS.length);
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

    it("adds exactly one synthetic marker when leadIn is provided", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      expect(screen.getAllByTestId(/ratio-point-marker-/)).toHaveLength(
        SPARSE_RATIO_POINTS.length + 1,
      );
    });

    it("adds exactly one synthetic row to the accessible table", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      expect(within(table).getAllByRole("row")).toHaveLength(SPARSE_RATIO_POINTS.length + 2);
    });

    it("renders the synthetic ratio as exactly 0, never derived", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      const rows = within(table).getAllByRole("row");
      const syntheticRow = rows[1];

      expect(within(syntheticRow).getByText("0")).toBeInTheDocument();
    });

    it("labels the synthetic row as an estimated baseline rather than a bare capture date", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      const rows = within(table).getAllByRole("row");
      const syntheticRow = rows[1];

      expect(syntheticRow.textContent).toMatch(/before/i);
      expect(syntheticRow.textContent).toMatch(/2014/);
      expect(syntheticRow.textContent).toMatch(/estimated baseline/i);
      expect(within(table).queryByText("2014-01-01")).not.toBeInTheDocument();
    });

    it("orders the synthetic row before the first real point", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /kudos-to-hits ratio/i });
      const rows = within(table).getAllByRole("row");

      expect(rows[1].textContent).toMatch(/before/i);
      expect(rows[2].textContent).toMatch(SPARSE_RATIO_POINTS[0].capturedOn);
    });

    it("gives the synthetic marker a text label that identifies it as an estimate with ratio 0", () => {
      render(
        <RatioChart title="Kudos-to-hits ratio" points={SPARSE_RATIO_POINTS} leadIn={LEAD_IN} />,
      );

      const markers = screen.getAllByTestId(/ratio-point-marker-/);
      const label = markers[0].textContent ?? "";

      expect(label).toMatch(/before/i);
      expect(label).toMatch(/2014/);
      expect(label).toMatch(/estimated baseline/i);
      expect(label).toMatch(/\b0\b/);
      expect(label).toMatch(/kudos-to-hits ratio/i);
    });
  });
});
