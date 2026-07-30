import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ClientError } from "graphql-request";
import { GraphQLError } from "graphql";
import { DashboardPage } from "./DashboardPage";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useStatsForUser } from "../queries/useStatsForUser";

// graphql-request throws ClientError for a real GraphQL-level rejection from
// the server (e.g. a backend-confirmed bad token), as opposed to a plain
// fetch/network failure (e.g. CORS) which has no `.response`. See
// DashboardPage's error-message branching, which relies on this shape
// distinction to avoid mislabeling a CORS/network failure as "bad token".
function makeClientError(message: string): ClientError {
  return new ClientError(
    {
      status: 401,
      headers: new Headers(),
      body: JSON.stringify({ errors: [{ message }] }),
      errors: [new GraphQLError(message)],
    },
    { query: "query StatsForUser" },
  );
}

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

  describe("when the token is invalid/mismatched (backend-confirmed ClientError)", () => {
    it("explains the mismatch and keeps the entry form available", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_wrong");
      mockStats({ error: makeClientError("token mismatch") });

      renderDashboard();

      expect(
        screen.getAllByText(/doesn't match|invalid token|not authorized/i).length,
      ).toBeGreaterThan(0);
      expect(screen.getByLabelText(/read token/i)).toBeInTheDocument();
    });
  });

  // Regression test: a plain network/CORS failure (e.g. a TypeError with no
  // `.response`, exactly what fetch throws for a CORS rejection) was
  // previously rendered with the same "doesn't match this username" copy as
  // a real backend-confirmed bad token, which sent a user with a perfectly
  // valid token chasing the wrong problem (see the FRONTEND_ORIGINS/CORS
  // incident documented in README.md).
  describe("when the stats query fails with a plain network/CORS error (no .response)", () => {
    it("explains it may be a connectivity/config issue rather than blaming the token", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ error: new TypeError("Failed to fetch") });

      renderDashboard();

      expect(
        screen.getAllByText(/couldn't reach the server|network or configuration/i).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText(/doesn't match this username/i)).not.toBeInTheDocument();
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
