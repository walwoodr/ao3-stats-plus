import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrendChart } from "./TrendChart";

// Maintenance item 9 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): the chart figure gets its own independent "Chart" disclosure,
// separate from SyncedDataTable's "Data table" one - collapsing either must
// never affect the other.
const POINTS = [
  { capturedOn: "2026-01-03", value: 100 },
  { capturedOn: "2026-01-04", value: 140 },
];

describe("TrendChart: independent chart-collapse toggle (Maintenance item 9)", () => {
  it("wraps the figure in its own 'Chart' disclosure, distinct from the table's 'Data table' one", () => {
    render(<TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />);

    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.getByText("Data table")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
  });

  it("collapsing the chart does not close the table's own disclosure, and vice versa", async () => {
    // jsdom doesn't hide a closed <details>' content from role queries the
    // way a real browser does (verified independently), so this asserts on
    // each <details>' own `open` property - the same convention
    // SyncedDataTable.test.tsx's T5 disclosure tests already use - rather
    // than on visibility-via-role-query.
    const user = userEvent.setup();
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
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
});
