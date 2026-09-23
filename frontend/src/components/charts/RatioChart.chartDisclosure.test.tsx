import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatioChart } from "./RatioChart";

// Maintenance item 9 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): mirrors TrendChart.chartDisclosure.test.tsx for RatioChart -
// the chart figure gets its own independent "Chart" disclosure, separate
// from SyncedDataTable's "Data table" one.
const POINTS = [
  { capturedOn: "2026-01-03", ratio: 0.1 },
  { capturedOn: "2026-01-04", ratio: 0.14 },
];

describe("RatioChart: independent chart-collapse toggle (Maintenance item 9)", () => {
  it("wraps the figure in its own 'Chart' disclosure, distinct from the table's 'Data table' one", () => {
    render(<RatioChart title="Kudos/hits" points={POINTS} />);

    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.getByText("Data table")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /kudos\/hits/i })).toBeInTheDocument();
  });

  it("collapsing the chart does not close the table's own disclosure, and vice versa", async () => {
    const user = userEvent.setup();
    const { container } = render(<RatioChart title="Kudos/hits" points={POINTS} />);

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
});
