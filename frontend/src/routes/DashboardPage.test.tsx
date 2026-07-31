import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
            earliestPostYear: null,
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
            earliestPostYear: null,
          },
        },
      });

      renderDashboard();

      expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /kudos.to.hits ratio/i })).toBeInTheDocument();
    });
  });

  // earliestPostYear (a synthetic "before you had any stats, you were at
  // zero" zero-point fact from the user's first ingest) drives a leadIn
  // synthesized as { capturedOn: "<year>-01-01", value: 0 } for the hits/
  // kudos charts and { capturedOn: "<year>-01-01", ratio: 0 } for the
  // ratio chart - account-level charts only, never per-work, and only when
  // the synthetic date would actually sort before the first real snapshot.
  describe("with earliestPostYear present and valid", () => {
    const TWO_POINT_SERIES = [
      { capturedOn: "2026-01-01", totalHits: 10, totalKudos: 1, kudosToHitsRatio: 0.1 },
      { capturedOn: "2026-01-08", totalHits: 20, totalKudos: 3, kudosToHitsRatio: 0.15 },
    ];

    function mockWithEarliestPostYear(overrides: {
      earliestPostYear: number | null;
      aggregateSeries: typeof TWO_POINT_SERIES;
      perWorkSeries?: Array<{
        ao3WorkId: number;
        title: string;
        fandoms: string;
        points: { capturedOn: string; hits: number; kudos: number }[];
      }>;
    }) {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({
        data: {
          statsForUser: {
            kudosToHitsRatio: 0.12,
            aggregateSeries: overrides.aggregateSeries,
            perWorkSeries: overrides.perWorkSeries ?? [],
            earliestPostYear: overrides.earliestPostYear,
          },
        },
      });
    }

    it("builds a 0/0/0 leadIn and passes it to all three account-level charts", () => {
      mockWithEarliestPostYear({ earliestPostYear: 2020, aggregateSeries: TWO_POINT_SERIES });

      renderDashboard();

      const hitsFigure = screen.getByRole("img", { name: /total hits/i });
      const kudosFigure = screen.getByRole("img", { name: /total kudos/i });
      const ratioFigure = screen.getByRole("img", { name: /kudos.to.hits ratio/i });

      // real points + one synthetic leadIn marker on each account chart
      expect(within(hitsFigure).getAllByTestId(/trend-point-marker-/)).toHaveLength(
        TWO_POINT_SERIES.length + 1,
      );
      expect(within(kudosFigure).getAllByTestId(/trend-point-marker-/)).toHaveLength(
        TWO_POINT_SERIES.length + 1,
      );
      expect(within(ratioFigure).getAllByTestId(/ratio-point-marker-/)).toHaveLength(
        TWO_POINT_SERIES.length + 1,
      );

      const hitsLabel = within(hitsFigure)
        .getAllByTestId(/trend-point-marker-/)[0]
        .getAttribute("aria-label");
      const kudosLabel = within(kudosFigure)
        .getAllByTestId(/trend-point-marker-/)[0]
        .getAttribute("aria-label");
      const ratioLabel = within(ratioFigure)
        .getAllByTestId(/ratio-point-marker-/)[0]
        .getAttribute("aria-label");

      expect(hitsLabel).toMatch(/before/i);
      expect(hitsLabel).toMatch(/\b0\b/);
      expect(kudosLabel).toMatch(/before/i);
      expect(kudosLabel).toMatch(/\b0\b/);
      expect(ratioLabel).toMatch(/before/i);
      expect(ratioLabel).toMatch(/\b0\b/);
    });

    it("does not pass a leadIn to per-work charts", () => {
      mockWithEarliestPostYear({
        earliestPostYear: 2020,
        aggregateSeries: TWO_POINT_SERIES,
        perWorkSeries: [
          {
            ao3WorkId: 111,
            title: "Work A",
            fandoms: "Fandom One",
            points: [
              { capturedOn: "2026-01-01", hits: 5, kudos: 1 },
              { capturedOn: "2026-01-08", hits: 8, kudos: 2 },
            ],
          },
        ],
      });

      renderDashboard();

      const perWorkHitsFigure = screen.getByRole("img", { name: /work a hits/i });
      expect(within(perWorkHitsFigure).getAllByTestId(/trend-point-marker-/)).toHaveLength(2);
      expect(within(perWorkHitsFigure).queryByText(/estimated baseline/i)).not.toBeInTheDocument();
    });

    it("renders the charts (not the 'not enough history' message) for a single real snapshot with a valid leadIn", () => {
      mockWithEarliestPostYear({
        earliestPostYear: 2020,
        aggregateSeries: [TWO_POINT_SERIES[0]],
      });

      renderDashboard();

      expect(screen.queryByText(/only have one|not enough history yet/i)).not.toBeInTheDocument();
      const hitsFigure = screen.getByRole("img", { name: /total hits/i });
      // one synthetic + one real point is a drawable two-point trend
      expect(within(hitsFigure).getAllByTestId(/trend-point-marker-/)).toHaveLength(2);
    });
  });

  describe("with earliestPostYear null or invalid", () => {
    it("still shows the 'not enough history' message for a single snapshot when earliestPostYear is null", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({
        data: {
          statsForUser: {
            kudosToHitsRatio: 0.1,
            aggregateSeries: [
              { capturedOn: "2026-01-01", totalHits: 10, totalKudos: 1, kudosToHitsRatio: 0.1 },
            ],
            perWorkSeries: [],
            earliestPostYear: null,
          },
        },
      });

      renderDashboard();

      expect(screen.getByText(/only have one|not enough history yet/i)).toBeInTheDocument();
    });

    it("suppresses the leadIn when the synthetic date wouldn't sort before the first real snapshot", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({
        data: {
          statsForUser: {
            kudosToHitsRatio: 0.1,
            aggregateSeries: [
              { capturedOn: "2025-06-01", totalHits: 10, totalKudos: 1, kudosToHitsRatio: 0.1 },
            ],
            perWorkSeries: [],
            // 2026-01-01 does not sort before 2025-06-01, so no leadIn
            // should be built even though earliestPostYear is present.
            earliestPostYear: 2026,
          },
        },
      });

      renderDashboard();

      expect(screen.getByText(/only have one|not enough history yet/i)).toBeInTheDocument();
      const hitsFigure = screen.getByRole("img", { name: /total hits/i });
      expect(within(hitsFigure).getAllByTestId(/trend-point-marker-/)).toHaveLength(1);
      expect(within(hitsFigure).queryByText(/estimated baseline/i)).not.toBeInTheDocument();
    });
  });
});
