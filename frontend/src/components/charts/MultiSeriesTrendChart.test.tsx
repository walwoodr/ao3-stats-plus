import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";

// MultiSeriesTrendChart is the N-series sibling of TrendChart (which stays
// single/lead-series only, untouched - see the plan's "New vs. extended"
// section). It reuses the same accessibility skeleton (figure role=img,
// aria-hidden Recharts block, sr-only per-point markers, sr-only data
// table) plus a visible legend mapping each work's title to its
// (shape, dash, color) glyph in words - shape+dash is the guaranteed
// non-color channel (decision A), color is redundant reinforcement only.
//
// Legend wording is derived from the real SERIES_STYLE_SLOTS table (not
// hardcoded here) so this test pins the *format*
// ("<dashLabel> <colorRole> line, <shape> marker") without duplicating
// seriesStyles.test.ts's ownership of the exact per-slot words.
function legendDescription(styleIndex: number): string {
  const slot = SERIES_STYLE_SLOTS[styleIndex];
  return `${slot.dashLabel} ${slot.colorRole} line, ${slot.shape} marker`;
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
    render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    expect(screen.getByRole("img", { name: /^hits$/i })).toBeInTheDocument();
  });

  it("hides the Recharts plot from assistive tech via aria-hidden", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  describe("visible legend", () => {
    it("renders one legend entry per selected work, mapping title to its worded glyph", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      expect(
        screen.getByText(new RegExp(`Work A.*${legendDescription(0)}`, "i")),
      ).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(`Work B.*${legendDescription(1)}`, "i")),
      ).toBeInTheDocument();
    });

    it("gives each work a distinct worded style description", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      expect(legendDescription(WORK_A.styleIndex)).not.toBe(legendDescription(WORK_B.styleIndex));
    });
  });

  describe("sr-only per-work markers", () => {
    it("labels each real point '<title> — <capturedOn>: <value> <metric>'", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      const markers = screen.getAllByTestId(/multi-series-point-marker-/);
      const texts = markers.map((m) => m.textContent);

      expect(texts).toContain("Work A — 2026-01-01: 10 Hits");
      expect(texts).toContain("Work A — 2026-01-08: 20 Hits");
      expect(texts).toContain("Work B — 2026-01-08: 5 Hits");
    });

    it("does not render a marker for a work's missing date (no fabricated zero point)", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      const markers = screen.getAllByTestId(/multi-series-point-marker-/);
      expect(markers.some((m) => m.textContent?.includes("Work B — 2026-01-01"))).toBe(false);
    });
  });

  describe("sr-only wide accessible data table", () => {
    it("has one date column plus one column per selected work", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      const table = screen.getByRole("table", { name: /hits/i });
      const headerCells = within(table).getAllByRole("columnheader");

      expect(headerCells.map((c) => c.textContent)).toEqual(["Date", "Work A", "Work B"]);
    });

    it("has one row per union date across all selected works", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      const table = screen.getByRole("table", { name: /hits/i });
      // header + 2 union dates (2026-01-01, 2026-01-08)
      expect(within(table).getAllByRole("row")).toHaveLength(3);
    });

    it("renders an explicit '—' for a work with no point at a given union date, not a blank cell", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      const table = screen.getByRole("table", { name: /hits/i });
      const rows = within(table).getAllByRole("row");
      const firstDataRow = rows[1]; // 2026-01-01

      expect(within(firstDataRow).getByText("2026-01-01")).toBeInTheDocument();
      expect(within(firstDataRow).getByText("10")).toBeInTheDocument();
      expect(within(firstDataRow).getByText("—")).toBeInTheDocument();
    });

    it("renders real values for every work that has a point at a given date", () => {
      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[WORK_A, WORK_B]} />,
      );

      const table = screen.getByRole("table", { name: /hits/i });
      const rows = within(table).getAllByRole("row");
      const secondDataRow = rows[2]; // 2026-01-08

      expect(within(secondDataRow).getByText("20")).toBeInTheDocument();
      expect(within(secondDataRow).getByText("5")).toBeInTheDocument();
      expect(within(secondDataRow).queryByText("—")).not.toBeInTheDocument();
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
    it("still renders a lone labeled marker rather than an error", () => {
      const singlePointWork: SeriesDatum = {
        workId: 3,
        title: "Work C",
        styleIndex: 2,
        points: [{ capturedOn: "2026-02-01", value: 7 }],
      };

      render(
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={[singlePointWork]} />,
      );

      expect(screen.getByText("Work C — 2026-02-01: 7 Hits")).toBeInTheDocument();
    });
  });
});
