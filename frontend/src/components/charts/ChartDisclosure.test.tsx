import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartDisclosure } from "./ChartDisclosure";

// Maintenance item 9 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): a standalone, chart-shape-agnostic <details>/<summary>
// wrapper - reused by TrendChart/RatioChart/MultiSeriesTrendChart so the
// chart figure gets its OWN collapse control, independent of
// SyncedDataTable's own "Data table" disclosure. Mirrors SyncedDataTable's
// disclosure test shape (T5) for the analogous "Chart" control.
describe("ChartDisclosure", () => {
  it("renders a native <details>/<summary> disclosure wrapping its children", () => {
    const { container } = render(
      <ChartDisclosure>
        <div data-testid="chart-content">chart</div>
      </ChartDisclosure>,
    );

    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("details > summary")).not.toBeNull();
    expect(screen.getByTestId("chart-content")).toBeInTheDocument();
  });

  it("defaults to open (no stated reason to default any chart closed)", () => {
    const { container } = render(
      <ChartDisclosure>
        <div>chart</div>
      </ChartDisclosure>,
    );

    expect(container.querySelector("details")).toHaveProperty("open", true);
  });

  it("carries the accessible label 'Chart', distinct from the table's 'Data table' summary", () => {
    render(
      <ChartDisclosure>
        <div>chart</div>
      </ChartDisclosure>,
    );

    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.queryByText("Data table")).not.toBeInTheDocument();
  });

  it("is keyboard-operable: activating the summary toggles visibility, independent of any other disclosure", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChartDisclosure>
        <div>chart</div>
      </ChartDisclosure>,
    );

    const details = container.querySelector("details");
    expect(details).toHaveProperty("open", true);

    const summary = container.querySelector("summary") as HTMLElement;
    summary.focus();
    await user.keyboard("{Enter}");

    expect(details).toHaveProperty("open", false);
  });
});
