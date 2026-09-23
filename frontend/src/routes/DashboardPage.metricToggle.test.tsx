import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useTokenStore } from "../store/useTokenStore";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import { useStatsForUser } from "../queries/useStatsForUser";

// Account-level metric toggle (docs/plans/additional-metric-trend-charts.md
// §3.0, Testing task T-T2): the aggregate trend region becomes a single
// role="tablist" [Hits | Kudos | Subscribers] over ONE TrendChart, replacing
// today's always-all-three-charts stack (Hits + Kudos + RatioChart). Split
// into its own file (mirrors WorkComparisonSection's .leadIn/.caption/
// .persistence split) to keep DashboardPage.test.tsx under its 500-line
// budget - this file owns everything toggle-specific; DashboardPage.test.tsx
// keeps the state-machine/error-branching suite plus its own light
// ratio-removal assertions (T-T3).
vi.mock("../store/useTokenFromUrl");
vi.mock("../queries/useStatsForUser");

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/u/someauthor"]}>
      <Routes>
        <Route path="/u/:username" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockStats(overrides: Partial<ReturnType<typeof useStatsForUser>>) {
  vi.mocked(useStatsForUser).mockReturnValue({
    data: undefined,
    error: null,
    isLoading: false,
    ...overrides,
  } as ReturnType<typeof useStatsForUser>);
}

const TWO_POINT_SERIES = [
  {
    capturedOn: "2026-01-01",
    totalHits: 10,
    totalKudos: 1,
    kudosToHitsRatio: 0.1,
    totalUserSubscriptions: 3,
  },
  {
    capturedOn: "2026-01-08",
    totalHits: 20,
    totalKudos: 3,
    kudosToHitsRatio: 0.15,
    totalUserSubscriptions: 5,
  },
];

function mockPopulated(earliestPostYear: number | null = null) {
  vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
  mockStats({
    data: {
      statsForUser: {
        kudosToHitsRatio: 0.12,
        aggregateSeries: TWO_POINT_SERIES,
        perWorkSeries: [],
        earliestPostYear,
      },
    },
  });
}

beforeEach(() => {
  useTokenStore.setState({ tokensByUsername: {} });
  window.localStorage.removeItem("ao3-stats-plus-work-comparison-store");
  useWorkComparisonStore.setState({ byUsername: {} });
});

describe("DashboardPage: account-level metric toggle", () => {
  it("renders a role=tablist with Hits/Kudos/Subscribers tabs", () => {
    mockPopulated();
    renderDashboard();

    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Hits", "Kudos", "Subscribers"]);
  });

  it("defaults to the Hits tab selected, showing the Total hits chart", () => {
    mockPopulated();
    renderDashboard();

    expect(screen.getByRole("tab", { name: "Hits" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
  });

  it("shows only one chart figure at a time, not all three simultaneously", () => {
    mockPopulated();
    renderDashboard();

    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("switching to the Kudos tab swaps the visible chart to Total kudos", async () => {
    const user = userEvent.setup();
    mockPopulated();
    renderDashboard();

    await user.click(screen.getByRole("tab", { name: "Kudos" }));

    expect(screen.getByRole("tab", { name: "Kudos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: /total kudos/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /total hits/i })).not.toBeInTheDocument();
  });

  it("switching to the Subscribers tab renders a chart built from totalUserSubscriptions", async () => {
    const user = userEvent.setup();
    mockPopulated();
    renderDashboard();

    await user.click(screen.getByRole("tab", { name: "Subscribers" }));

    // The point values now live in the visible synced table's cells (a
    // sibling of the aria-hidden figure, not the old sr-only per-point
    // marker spans that used to sit inside it - docs/plans/chart-synced-
    // data-table.md §2.4).
    const table = screen.getByRole("table", { name: /subscribers/i });
    const cells = within(table).getAllByRole("cell");
    expect(cells).toHaveLength(TWO_POINT_SERIES.length);
    expect(cells[0].textContent).toMatch(/3/);
    expect(cells[1].textContent).toMatch(/5/);
  });

  it("the Subscribers chart carries the same account-level zero-basis leadIn as Hits/Kudos", async () => {
    const user = userEvent.setup();
    mockPopulated(2020);
    renderDashboard();

    await user.click(screen.getByRole("tab", { name: "Subscribers" }));

    const table = screen.getByRole("table", { name: /subscribers/i });
    const columnHeaders = within(table).getAllByRole("columnheader");
    // corner cell + the synthetic leadIn column + one per real point.
    expect(columnHeaders).toHaveLength(TWO_POINT_SERIES.length + 2);
    expect(columnHeaders[1].textContent).toMatch(/before/i);
    const cells = within(table).getAllByRole("cell");
    expect(cells[0].textContent).toBe("0");
  });

  it("the Subscribers chart exposes an accessible sr-only data table", async () => {
    const user = userEvent.setup();
    mockPopulated();
    renderDashboard();

    await user.click(screen.getByRole("tab", { name: "Subscribers" }));

    expect(screen.getByRole("table", { name: /subscribers/i })).toBeInTheDocument();
  });

  it("switching metric tabs keeps the same underlying data - switching back to Hits restores it unchanged", async () => {
    const user = userEvent.setup();
    mockPopulated();
    renderDashboard();

    await user.click(screen.getByRole("tab", { name: "Kudos" }));
    await user.click(screen.getByRole("tab", { name: "Hits" }));

    expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /total hits/i });
    expect(within(table).getAllByRole("cell")).toHaveLength(TWO_POINT_SERIES.length);
  });

  describe("keyboard nav / ARIA", () => {
    it("only the selected tab has tabIndex 0 (roving tabindex)", () => {
      mockPopulated();
      renderDashboard();

      expect(screen.getByRole("tab", { name: "Hits" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("tab", { name: "Kudos" })).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tab", { name: "Subscribers" })).toHaveAttribute("tabindex", "-1");
    });

    it("ArrowRight then Enter selects the next tab via the keyboard", async () => {
      const user = userEvent.setup();
      mockPopulated();
      renderDashboard();

      screen.getByRole("tab", { name: "Hits" }).focus();
      await user.keyboard("{ArrowRight}{Enter}");

      expect(screen.getByRole("tab", { name: "Kudos" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("img", { name: /total kudos/i })).toBeInTheDocument();
    });
  });
});
