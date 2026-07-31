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

  it("does not encode data using color alone (each marker gets a text label)", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

    const markers = screen.getAllByTestId(/trend-point-marker-/);
    expect(markers.length).toBe(SPARSE_POINTS.length);
    markers.forEach((marker) => {
      expect(marker.textContent).not.toBe("");
    });
  });

  // leadIn is the optional synthetic "before you had any stats, you were at
  // zero" baseline point, connected to the first real snapshot with a
  // dashed line. It must be invisible when omitted, and when present it
  // must be clearly labeled as an ESTIMATE (not presented as if it were a
  // real captured date) everywhere the real points are accessible.
  describe("with a leadIn synthetic baseline point", () => {
    const LEAD_IN = { capturedOn: "2014-01-01", value: 0 };

    it("adds no synthetic marker or table row when leadIn is omitted", () => {
      render(<TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} />);

      expect(screen.getAllByTestId(/trend-point-marker-/)).toHaveLength(SPARSE_POINTS.length);
      const table = screen.getByRole("table", { name: /total hits/i });
      expect(within(table).queryByText(/estimated baseline/i)).not.toBeInTheDocument();
    });

    it("produces identical output whether leadIn is omitted or explicitly undefined", () => {
      // Reuses one render tree (via rerender) rather than two separate
      // render() calls, so useId's per-root counter can't introduce an
      // incidental id mismatch unrelated to the leadIn prop itself.
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

    it("adds exactly one synthetic marker when leadIn is provided", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      expect(screen.getAllByTestId(/trend-point-marker-/)).toHaveLength(SPARSE_POINTS.length + 1);
    });

    it("adds exactly one synthetic row to the accessible table", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      // header row + one row per real point + one synthetic row
      expect(within(table).getAllByRole("row")).toHaveLength(SPARSE_POINTS.length + 2);
    });

    it("labels the synthetic row as an estimated baseline rather than a bare capture date", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      const rows = within(table).getAllByRole("row");
      // first data row (after the header) is the synthetic baseline
      const syntheticRow = rows[1];

      expect(syntheticRow.textContent).toMatch(/before/i);
      expect(syntheticRow.textContent).toMatch(/2014/);
      expect(syntheticRow.textContent).toMatch(/estimated baseline/i);
      expect(within(syntheticRow).getByText("0")).toBeInTheDocument();
      // the raw ISO date must not leak through as if it were a real snapshot
      expect(within(table).queryByText("2014-01-01")).not.toBeInTheDocument();
    });

    it("orders the synthetic row before the first real point", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const table = screen.getByRole("table", { name: /total hits/i });
      const rows = within(table).getAllByRole("row");

      expect(rows[1].textContent).toMatch(/before/i);
      expect(rows[2].textContent).toMatch(SPARSE_POINTS[0].capturedOn);
    });

    it("gives the synthetic marker a text label that identifies it as an estimate", () => {
      render(
        <TrendChart title="Total hits" valueLabel="Hits" points={SPARSE_POINTS} leadIn={LEAD_IN} />,
      );

      const markers = screen.getAllByTestId(/trend-point-marker-/);
      const syntheticMarker = markers[0];
      const label = syntheticMarker.textContent ?? "";

      expect(label).toMatch(/before/i);
      expect(label).toMatch(/2014/);
      expect(label).toMatch(/estimated baseline/i);
      expect(label).toMatch(/0/);
      expect(label).toMatch(/Hits/);
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

      expect(screen.getAllByTestId(/trend-point-marker-/)).toHaveLength(2);
      const table = screen.getByRole("table", { name: /total hits/i });
      // header + synthetic + one real point
      expect(within(table).getAllByRole("row")).toHaveLength(3);
    });
  });

  // No caller currently renders TrendChart with empty points and no leadIn
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
