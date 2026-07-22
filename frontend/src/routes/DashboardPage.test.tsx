import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useStatsForUser } from "../queries/useStatsForUser";

// DashboardPage composes DashboardHeader/EmptyState/AggregateTrends/
// PerWorkTrends/ErrorBanner around useTokenFromUrl + useStatsForUser. Both
// are mocked here so this is a true unit test of DashboardPage's own
// state-branching logic, not an integration test of the whole stack.
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

describe("DashboardPage", () => {
  describe("with no token available", () => {
    it("renders the empty state with a manual token-entry form", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue(undefined);
      mockStats({ isLoading: false });

      renderDashboard();

      expect(screen.getByText(/connect|no token|enter your token/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/read token/i)).toBeInTheDocument();
    });

    it("does not render chart regions", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue(undefined);
      mockStats({ isLoading: false });

      renderDashboard();

      expect(screen.queryByRole("img", { name: /total hits/i })).not.toBeInTheDocument();
    });
  });

  describe("while the stats query is loading", () => {
    it("renders a loading skeleton announced to assistive tech", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ isLoading: true });

      renderDashboard();

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("when the token is invalid/mismatched", () => {
    it("explains the mismatch and keeps the entry form available", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_wrong");
      mockStats({ error: new Error("token mismatch") });

      renderDashboard();

      expect(screen.getByText(/doesn't match|invalid token|not authorized/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/read token/i)).toBeInTheDocument();
    });
  });

  describe("with a single-point history", () => {
    it("explains there isn't much history yet while still showing the single-point chart", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({
        data: {
          statsForUser: {
            kudosToHitsRatio: 0.1,
            aggregateSeries: [
              { capturedOn: "2026-01-01", totalHits: 10, totalKudos: 1, kudosToHitsRatio: 0.1 },
            ],
            perWorkSeries: [],
          },
        },
      });

      renderDashboard();

      expect(screen.getByText(/only have one|not enough history yet/i)).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
    });
  });

  describe("with a populated multi-point history", () => {
    it("renders the aggregate trend charts", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({
        data: {
          statsForUser: {
            kudosToHitsRatio: 0.12,
            aggregateSeries: [
              { capturedOn: "2026-01-01", totalHits: 10, totalKudos: 1, kudosToHitsRatio: 0.1 },
              { capturedOn: "2026-01-08", totalHits: 20, totalKudos: 3, kudosToHitsRatio: 0.15 },
            ],
            perWorkSeries: [],
          },
        },
      });

      renderDashboard();

      expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /kudos.to.hits ratio/i })).toBeInTheDocument();
    });
  });
});
