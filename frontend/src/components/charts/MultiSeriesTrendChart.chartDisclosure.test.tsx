import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Maintenance item 9 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): mirrors TrendChart.chartDisclosure.test.tsx for
// MultiSeriesTrendChart - the chart figure gets its own independent "Chart"
// disclosure, separate from SyncedDataTable's "Data table" one (which, for
// this chart, may itself default closed via `defaultOpen` - D-A - so the
// two controls' independence matters here more than anywhere else).
const SERIES: SeriesDatum[] = [
  {
    workId: 1,
    title: "Work A",
    styleIndex: 0,
    points: [{ capturedOn: "2026-01-01", value: 10 }],
  },
];

describe("MultiSeriesTrendChart: independent chart-collapse toggle (Maintenance item 9)", () => {
  it("wraps the figure in its own 'Chart' disclosure, distinct from the table's 'Data table' one", () => {
    render(<MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={SERIES} />);

    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.getByText("Data table")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^hits$/i })).toBeInTheDocument();
  });

  it("collapsing the chart does not close the table's own disclosure, and vice versa", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={SERIES} />,
    );

    const [chartDetails, tableDetails] = container.querySelectorAll("details");
    expect(chartDetails).toHaveProperty("open", true);
    expect(tableDetails).toHaveProperty("open", true);

    await user.click(screen.getByText("Chart"));

    expect(chartDetails).toHaveProperty("open", false);
    expect(tableDetails).toHaveProperty("open", true);

    await user.click(screen.getByText("Data table"));

    expect(chartDetails).toHaveProperty("open", false);
    expect(tableDetails).toHaveProperty("open", false);
  });

  it("keeps the chart disclosure independently open even when the table defaults closed (By-Work, D-A)", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={SERIES} defaultOpen={false} />,
    );

    const [chartDetails, tableDetails] = container.querySelectorAll("details");
    expect(chartDetails).toHaveProperty("open", true);
    expect(tableDetails).toHaveProperty("open", false);
  });
});
