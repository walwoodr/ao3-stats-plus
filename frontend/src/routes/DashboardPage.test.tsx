import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ClientError } from "graphql-request";
import { GraphQLError } from "graphql";
import { DashboardPage } from "./DashboardPage";
import { useTokenFromUrl } from "../store/useTokenFromUrl";
import { useTokenStore } from "../store/useTokenStore";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
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
  // useTokenStore and useWorkComparisonStore are both real (unmocked)
  // Zustand stores persisted to localStorage - reset them between tests so
  // assertions below aren't polluted by state left over from a previous
  // test (docs/plans/work-comparison-picker-redesign.md §2 - the
  // comparison section now reads/writes useWorkComparisonStore for real
  // here too, not local useState).
  beforeEach(() => {
    useTokenStore.setState({ tokensByUsername: {} });
    window.localStorage.removeItem("ao3-stats-plus-work-comparison-store");
    useWorkComparisonStore.setState({ byUsername: {} });
  });

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

    it("clears the stored token, since it's backend-confirmed wrong", () => {
      useTokenStore.getState().setToken("someauthor", "tok_wrong");
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_wrong");
      mockStats({ error: makeClientError("token mismatch") });

      renderDashboard();

      expect(useTokenStore.getState().getToken("someauthor")).toBeUndefined();
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

    it("does not clear the stored token, since a network failure says nothing about it", () => {
      useTokenStore.getState().setToken("someauthor", "tok_valid");
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({ error: new TypeError("Failed to fetch") });

      renderDashboard();

      expect(useTokenStore.getState().getToken("someauthor")).toBe("tok_valid");
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
    // RatioChart removal (docs/plans/additional-metric-trend-charts.md
    // §3.0.1, T-T3, user-requested): the Kudos-to-hits ratio chart no longer
    // renders anywhere on DashboardPage - Option B's "pick one count metric"
    // toggle has no slot for a derived 0-1 proportion on a different
    // scale/chart type. RatioChart.tsx and its own test suite
    // (RatioChart.test.tsx) are untouched; this only asserts DashboardPage
    // stopped rendering it, on every metric tab.
    it("renders the Hits chart by default and never a Kudos-to-hits ratio chart, on any tab", async () => {
      const user = userEvent.setup();
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
      expect(screen.queryByRole("img", { name: /kudos.to.hits ratio/i })).not.toBeInTheDocument();

      for (const tabName of ["Kudos", "Subscribers"]) {
        await user.click(screen.getByRole("tab", { name: tabName }));
        expect(screen.queryByRole("img", { name: /kudos.to.hits ratio/i })).not.toBeInTheDocument();
      }
    });
  });

  // earliestPostYear (a synthetic "before you had any stats, you were at
  // zero" zero-point fact from the user's first ingest) drives a leadIn
  // synthesized as { capturedOn: "<year>-01-01", value: 0 } for each
  // account-level metric chart - account-level only, never per-work, and
  // only when the synthetic date would actually sort before the first real
  // snapshot. (The Subscribers tab's own leadIn is covered by
  // DashboardPage.metricToggle.test.tsx; this stays focused on Hits/Kudos,
  // the two metrics that pre-date the toggle.)
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

    it("builds a 0/0 leadIn and passes it to both the Hits and Kudos account-level charts", async () => {
      const user = userEvent.setup();
      mockWithEarliestPostYear({ earliestPostYear: 2020, aggregateSeries: TWO_POINT_SERIES });

      renderDashboard();

      const hitsFigure = screen.getByRole("img", { name: /total hits/i });
      // real points + one synthetic leadIn marker on the currently-shown chart
      expect(within(hitsFigure).getAllByTestId(/trend-point-marker-/)).toHaveLength(
        TWO_POINT_SERIES.length + 1,
      );
      const hitsLabel = within(hitsFigure).getAllByTestId(/trend-point-marker-/)[0].textContent;
      expect(hitsLabel).toMatch(/before/i);
      expect(hitsLabel).toMatch(/\b0\b/);

      await user.click(screen.getByRole("tab", { name: "Kudos" }));

      const kudosFigure = screen.getByRole("img", { name: /total kudos/i });
      expect(within(kudosFigure).getAllByTestId(/trend-point-marker-/)).toHaveLength(
        TWO_POINT_SERIES.length + 1,
      );
      const kudosLabel = within(kudosFigure).getAllByTestId(/trend-point-marker-/)[0].textContent;
      expect(kudosLabel).toMatch(/before/i);
      expect(kudosLabel).toMatch(/\b0\b/);
    });

    // Superseded by docs/plans/per-work-zero-basis-dates.md: the parent
    // per-work-comparison-graph.md plan's Q5 originally kept per-work
    // baselines out of scope (comparison charts got no leadIn at all,
    // distinct from the aggregate "Total hits" chart above). This plan
    // deliberately reverses that - each selected work now gets its own
    // zero-basis leadIn (own publishedOn, or the earliestPostYear fallback
    // exercised here since Work A has no publishedOn) - so this integration
    // test now asserts DashboardPage correctly threads earliestPostYear
    // through to WorkComparisonSection's per-work leadIn derivation, rather
    // than the old absence invariant. Derivation itself (branches, guards)
    // is covered in depth by WorkComparisonSection.leadIn.test.tsx; this
    // stays as an end-to-end wiring smoke test.
    it("passes a leadIn to the per-work comparison charts, per the zero-basis dates feature", () => {
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

      // WorkComparisonSection's comparison charts (title "Hits"/"Kudos", not
      // "Work A hits" - see WorkComparisonSection.test.tsx) now receive a
      // leadIn for Work A (no publishedOn -> falls back to the
      // earliestPostYear baseline) alongside its 2 real points.
      const comparisonHitsFigure = screen.getByRole("img", { name: /^hits$/i });
      const markers = within(comparisonHitsFigure).getAllByTestId(/multi-series-point-marker-/);
      expect(markers).toHaveLength(3);
      // Both the sr-only marker and the sr-only table row echo the same
      // "estimated baseline" wording - checking the marker text directly
      // (rather than a bare getByText) avoids ambiguity between the two.
      expect(markers.some((marker) => /estimated baseline/i.test(marker.textContent ?? ""))).toBe(
        true,
      );
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

  // Q1 (resolved: replace, not coexist) - PerWorkTrends' single-work
  // <select> dropdown is removed entirely; WorkComparisonSection takes its
  // place, behind the SAME `perWorkSeries.length > 0` guard PerWorkTrends
  // used. The aggregate metric toggle above it is unaffected by this
  // section's own tests (RatioChart removal is covered above, by the
  // "populated multi-point history" describe block).
  describe("PerWorkTrends replacement (WorkComparisonSection)", () => {
    const ONE_WORK_PER_WORK_SERIES = [
      {
        ao3WorkId: 111,
        title: "Work A",
        fandoms: "Fandom One",
        points: [
          { capturedOn: "2026-01-01", hits: 5, kudos: 1 },
          { capturedOn: "2026-01-08", hits: 8, kudos: 2 },
        ],
      },
    ];

    // Superseded by docs/plans/work-comparison-picker-redesign.md: the
    // grouped-checkbox picker this test originally guarded is itself being
    // replaced by the Autocomplete combobox - this now asserts the NEW
    // control renders (and the old checkbox/fieldset markup does not),
    // rather than re-asserting the picker this redesign replaces.
    it("renders WorkComparisonSection's Autocomplete combobox picker, not the old grouped-checkbox <fieldset>", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({
        data: {
          statsForUser: {
            kudosToHitsRatio: 0.12,
            aggregateSeries: [
              { capturedOn: "2026-01-01", totalHits: 10, totalKudos: 1, kudosToHitsRatio: 0.1 },
              { capturedOn: "2026-01-08", totalHits: 20, totalKudos: 3, kudosToHitsRatio: 0.15 },
            ],
            perWorkSeries: ONE_WORK_PER_WORK_SERIES,
            earliestPostYear: null,
          },
        },
      });

      renderDashboard();

      expect(screen.getByRole("combobox", { name: /works to compare/i })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "Work A" })).not.toBeInTheDocument();
    });

    it("still guards the section behind perWorkSeries.length > 0 (no picker when there is no per-work history)", () => {
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

      expect(screen.queryByRole("group", { name: /works to compare/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("img", { name: /^hits$/i })).not.toBeInTheDocument();
    });

    // Renamed from "...TrendChart x2 + RatioChart..." (T-T3): the aggregate
    // section is now the [Hits | Kudos | Subscribers] metric toggle over one
    // TrendChart, with no ratio chart anywhere - this still confirms the
    // aggregate toggle and the new comparison section coexist correctly.
    it("still renders the aggregate metric toggle (no RatioChart) alongside the new comparison section", () => {
      vi.mocked(useTokenFromUrl).mockReturnValue("tok_valid");
      mockStats({
        data: {
          statsForUser: {
            kudosToHitsRatio: 0.12,
            aggregateSeries: [
              { capturedOn: "2026-01-01", totalHits: 10, totalKudos: 1, kudosToHitsRatio: 0.1 },
              { capturedOn: "2026-01-08", totalHits: 20, totalKudos: 3, kudosToHitsRatio: 0.15 },
            ],
            perWorkSeries: ONE_WORK_PER_WORK_SERIES,
            earliestPostYear: null,
          },
        },
      });

      renderDashboard();

      expect(screen.getByRole("img", { name: /total hits/i })).toBeInTheDocument();
      expect(screen.queryByRole("img", { name: /kudos.to.hits ratio/i })).not.toBeInTheDocument();
      expect(screen.getByRole("tablist", { name: "Metric" })).toBeInTheDocument();
      expect(screen.getByRole("tablist", { name: "Per-work metric" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /works to compare/i })).toBeInTheDocument();
    });
  });
});
