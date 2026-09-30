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
import { useStatsForUser, type PerWorkSeries } from "../queries/useStatsForUser";
import { leafColumnHeaders } from "../components/charts/syncedDataTableTestSupport";

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
              {
                capturedOn: "2026-01-01",
                totalHits: 10,
                totalKudos: 1,
                kudosToHitsRatio: 0.1,
                totalUserSubscriptions: 0,
              },
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
              {
                capturedOn: "2026-01-01",
                totalHits: 10,
                totalKudos: 1,
                kudosToHitsRatio: 0.1,
                totalUserSubscriptions: 0,
              },
              {
                capturedOn: "2026-01-08",
                totalHits: 20,
                totalKudos: 3,
                kudosToHitsRatio: 0.15,
                totalUserSubscriptions: 0,
              },
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
      {
        capturedOn: "2026-01-01",
        totalHits: 10,
        totalKudos: 1,
        kudosToHitsRatio: 0.1,
        totalUserSubscriptions: 0,
      },
      {
        capturedOn: "2026-01-08",
        totalHits: 20,
        totalKudos: 3,
        kudosToHitsRatio: 0.15,
        totalUserSubscriptions: 0,
      },
    ];

    // perWorkSeries uses the real PerWorkSeries type directly (not a local,
    // narrower duplicate) so its shape can't drift out of sync with
    // useStatsForUser.ts's actual GraphQL contract again (TECH_DEBT.md,
    // 2026-08-09 - a local duplicate here was exactly what let PerWorkPoint
    // tighten to required fields without this file's own type catching up).
    function mockWithEarliestPostYear(overrides: {
      earliestPostYear: number | null;
      aggregateSeries: typeof TWO_POINT_SERIES;
      perWorkSeries?: PerWorkSeries[];
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

    // docs/plans/date-range-slider-month-granularity.md D5 (LOCKED, §10):
    // the three account-level TrendChart instances stop being passed the
    // `leadIn` prop by default - the synthetic 0/0 baseline no longer
    // reaches either chart, even when earliestPostYear/hasLeadIn would
    // otherwise make it eligible. Renamed from "builds a 0/0 leadIn and
    // passes it..." (its exact former assertions are now the ones a fresh
    // DashboardPage.leadInDefault.test.tsx guards against regressing).
    it("does NOT pass a leadIn to the Hits or Kudos account-level charts by default (D5, LOCKED)", async () => {
      const user = userEvent.setup();
      mockWithEarliestPostYear({ earliestPostYear: 2020, aggregateSeries: TWO_POINT_SERIES });

      renderDashboard();

      // corner + real points only - no synthetic leadIn column.
      const hitsTable = screen.getByRole("table", { name: /total hits/i });
      expect(leafColumnHeaders(hitsTable)).toHaveLength(TWO_POINT_SERIES.length + 1);

      await user.click(screen.getByRole("tab", { name: "Kudos" }));

      const kudosTable = screen.getByRole("table", { name: /total kudos/i });
      expect(leafColumnHeaders(kudosTable)).toHaveLength(TWO_POINT_SERIES.length + 1);
    });

    // Superseded again by docs/plans/date-range-slider-month-granularity.md
    // D2 (LOCKED): the per-work comparison charts' own default window is
    // now the real-capture span, which HIDES every work's zero-basis
    // leadIn by default (previously always shown once per-work-zero-basis-
    // dates.md shipped it). Derivation/widened-range branches are covered
    // in depth by WorkComparisonSection.leadIn.test.tsx; this integration
    // test now asserts the default-hidden wiring end to end instead of the
    // old always-shown one.
    it("does NOT pass a leadIn to the per-work comparison chart by default (D2, LOCKED)", () => {
      mockWithEarliestPostYear({
        earliestPostYear: 2020,
        aggregateSeries: TWO_POINT_SERIES,
        perWorkSeries: [
          {
            ao3WorkId: 111,
            title: "Work A",
            fandoms: "Fandom One",
            points: [
              {
                capturedOn: "2026-01-01",
                hits: 5,
                kudos: 1,
                comments: 0,
                bookmarks: 0,
                subscriptions: 0,
              },
              {
                capturedOn: "2026-01-08",
                hits: 8,
                kudos: 2,
                comments: 0,
                bookmarks: 0,
                subscriptions: 0,
              },
            ],
            bookmarks: [],
          },
        ],
      });

      renderDashboard();

      // WorkComparisonSection's comparison charts (title "Hits"/"Kudos", not
      // "Work A hits" - see WorkComparisonSection.test.tsx) default to
      // Work A's own real-capture span, which sits at/after its estimated-
      // baseline zero-basis month - no leadIn column by default.
      const comparisonHitsTable = screen.getByRole("table", { name: /^hits$/i });
      const columnHeaders = leafColumnHeaders(comparisonHitsTable);
      // corner + Work A's 2 real points only.
      expect(columnHeaders).toHaveLength(3);
      expect(
        columnHeaders.some((header) =>
          /estimated baseline/i.test(header.getAttribute("aria-label") ?? ""),
        ),
      ).toBe(false);
    });

    // docs/plans/date-range-slider-month-granularity.md §10 ("Corner cases
    // (account-level)"): with the lead-in no longer passed by default, a
    // single real snapshot is a lone dot, not a drawable trend - the
    // `notEnoughHistory` gate is now `aggregateSeries.length === 1`
    // unconditionally, dropping the old `!hasLeadIn &&` guard. This inverts
    // the pre-D5 test of the same scenario ("renders the charts... for a
    // single real snapshot with a valid leadIn").
    it("shows the 'not enough history' message for a single real snapshot even when earliestPostYear would make a leadIn valid (new gate, D5)", () => {
      mockWithEarliestPostYear({
        earliestPostYear: 2020,
        aggregateSeries: [TWO_POINT_SERIES[0]],
      });

      renderDashboard();

      expect(screen.getByText(/only have one|not enough history yet/i)).toBeInTheDocument();
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
              {
                capturedOn: "2026-01-01",
                totalHits: 10,
                totalKudos: 1,
                kudosToHitsRatio: 0.1,
                totalUserSubscriptions: 0,
              },
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
              {
                capturedOn: "2025-06-01",
                totalHits: 10,
                totalKudos: 1,
                kudosToHitsRatio: 0.1,
                totalUserSubscriptions: 0,
              },
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
      const hitsTable = screen.getByRole("table", { name: /total hits/i });
      // corner + one real point only - no leadIn column. leafColumnHeaders
      // scopes to the day tier + corner only (the year/month grouping cells
      // - always present even for a single date, dateHierarchy.ts's "never
      // collapsed" rule - are ALSO real columnheaders otherwise).
      expect(leafColumnHeaders(hitsTable)).toHaveLength(2);
      expect(within(hitsTable).queryByText(/estimated baseline/i)).not.toBeInTheDocument();
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
          {
            capturedOn: "2026-01-01",
            hits: 5,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-01-08",
            hits: 8,
            kudos: 2,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
        bookmarks: [],
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
              {
                capturedOn: "2026-01-01",
                totalHits: 10,
                totalKudos: 1,
                kudosToHitsRatio: 0.1,
                totalUserSubscriptions: 0,
              },
              {
                capturedOn: "2026-01-08",
                totalHits: 20,
                totalKudos: 3,
                kudosToHitsRatio: 0.15,
                totalUserSubscriptions: 0,
              },
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
              {
                capturedOn: "2026-01-01",
                totalHits: 10,
                totalKudos: 1,
                kudosToHitsRatio: 0.1,
                totalUserSubscriptions: 0,
              },
              {
                capturedOn: "2026-01-08",
                totalHits: 20,
                totalKudos: 3,
                kudosToHitsRatio: 0.15,
                totalUserSubscriptions: 0,
              },
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
              {
                capturedOn: "2026-01-01",
                totalHits: 10,
                totalKudos: 1,
                kudosToHitsRatio: 0.1,
                totalUserSubscriptions: 0,
              },
              {
                capturedOn: "2026-01-08",
                totalHits: 20,
                totalKudos: 3,
                kudosToHitsRatio: 0.15,
                totalUserSubscriptions: 0,
              },
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
