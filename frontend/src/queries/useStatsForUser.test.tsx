import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { graphqlClient } from "../lib/graphqlClient";
import {
  useStatsForUser,
  type AggregateSeriesPoint,
  type PerWorkPoint,
  type PerWorkSeries,
  type WorkBookmark,
} from "./useStatsForUser";

// useStatsForUser wraps graphql-request in a TanStack Query hook keyed
// ["stats", username, token], per the plan. graphql-request itself is
// mocked so these are true unit tests of the hook's query-key/state
// behavior, not integration tests against a real backend.
vi.mock("../lib/graphqlClient", () => ({
  graphqlClient: { request: vi.fn() },
}));

function Harness({ username, token }: { username: string; token: string | undefined }) {
  const { data, error, isLoading } = useStatsForUser(username, token);

  if (isLoading) return <p>loading</p>;
  if (error) return <p>error: {(error as Error).message}</p>;
  return <p>hits: {data?.statsForUser.aggregateSeries[0]?.totalHits ?? "none"}</p>;
}

function renderWithClient(username: string, token: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness username={username} token={token} />
    </QueryClientProvider>,
  );
}

describe("useStatsForUser", () => {
  afterEach(() => {
    vi.mocked(graphqlClient.request).mockReset();
  });

  it("shows a loading state before the request resolves", () => {
    vi.mocked(graphqlClient.request).mockReturnValue(new Promise(() => {}));
    renderWithClient("someauthor", "tok_valid");

    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("renders data on success", async () => {
    vi.mocked(graphqlClient.request).mockResolvedValue({
      statsForUser: { aggregateSeries: [{ capturedOn: "2026-01-01", totalHits: 42 }] },
    });

    renderWithClient("someauthor", "tok_valid");

    await waitFor(() => expect(screen.getByText("hits: 42")).toBeInTheDocument());
  });

  it("renders an error state when the request rejects", async () => {
    vi.mocked(graphqlClient.request).mockRejectedValue(new Error("token mismatch"));

    renderWithClient("someauthor", "tok_invalid");

    await waitFor(() => expect(screen.getByText("error: token mismatch")).toBeInTheDocument());
  });

  it("does not fire the request when there is no token", () => {
    renderWithClient("someauthor", undefined);

    expect(graphqlClient.request).not.toHaveBeenCalled();
  });

  it("calls graphql-request with the username and token variables", () => {
    vi.mocked(graphqlClient.request).mockResolvedValue({
      statsForUser: { aggregateSeries: [] },
    });

    renderWithClient("someauthor", "tok_valid");

    expect(graphqlClient.request).toHaveBeenCalledWith(expect.anything(), {
      username: "someauthor",
      token: "tok_valid",
    });
  });

  // earliestPostYear is the synthetic zero-point baseline fact the
  // dashboard needs to build a leadIn - the query document has to actually
  // request it from the backend, or DashboardPage would have nothing to
  // synthesize a leadIn from no matter what it does with the response.
  it("requests earliestPostYear in the query document sent to the server", () => {
    vi.mocked(graphqlClient.request).mockResolvedValue({
      statsForUser: { aggregateSeries: [], earliestPostYear: null },
    });

    renderWithClient("someauthor", "tok_valid");

    const [query] = vi.mocked(graphqlClient.request).mock.calls[0];
    expect(query).toMatch(/earliestPostYear/);
  });

  // Per-work zero-basis dates (docs/plans/per-work-zero-basis-dates.md,
  // Testing task 1): each work's own publish date is the primary source
  // for its zero-basis leadIn, falling back to earliestPostYear only when
  // absent. That fallback source is already selected above; this is the
  // one field genuinely missing from the query today.
  it("selects publishedOn inside the perWorkSeries block of the query document", () => {
    vi.mocked(graphqlClient.request).mockResolvedValue({
      statsForUser: { aggregateSeries: [], perWorkSeries: [], earliestPostYear: null },
    });

    renderWithClient("someauthor", "tok_valid");

    const [query] = vi.mocked(graphqlClient.request).mock.calls[0];
    const perWorkSeriesBlock = String(query).match(/perWorkSeries\s*{([^}]*)}/s)?.[1] ?? "";
    expect(perWorkSeriesBlock).toMatch(/publishedOn/);
  });

  // Compile-time companion to the query-document test above: `PerWorkSeries`
  // itself must expose `publishedOn: string | null`, or WorkComparisonSection
  // has no typed field to read the fallback logic from even once the query
  // document is fixed. This is a static-shape assertion (esbuild's transpile
  // erases types and won't fail it at the `vitest run` level - it is caught
  // by `npx tsc -b`, per this project's verification discipline) rather than
  // a runtime one, since TypeScript's excess-property check only fires at
  // compile time.
  it("PerWorkSeries.publishedOn accepts a real ISO date or null (compile-time shape, verified via tsc -b)", () => {
    const accurate: PerWorkSeries = {
      ao3WorkId: 1,
      title: "Work One",
      fandoms: "",
      points: [],
      publishedOn: "2020-06-01",
      bookmarks: [],
    };
    const missing: PerWorkSeries = {
      ao3WorkId: 2,
      title: "Work Two",
      fandoms: "",
      points: [],
      publishedOn: null,
      bookmarks: [],
    };

    expect(accurate.publishedOn).toBe("2020-06-01");
    expect(missing.publishedOn).toBeNull();
  });

  // docs/plans/additional-metric-trend-charts.md (Testing task T-T1): the
  // account-level "Subscribers" metric tab reads totalUserSubscriptions off
  // each AggregateSeriesPoint - the backend already resolves it
  // (AggregateSeriesPointType), but the query document sent to the server
  // never asks for it today, so this is a genuine runtime RED (no tsc -b
  // needed) until the query is extended.
  it("selects totalUserSubscriptions inside the aggregateSeries block of the query document", () => {
    vi.mocked(graphqlClient.request).mockResolvedValue({
      statsForUser: { aggregateSeries: [], perWorkSeries: [], earliestPostYear: null },
    });

    renderWithClient("someauthor", "tok_valid");

    const [query] = vi.mocked(graphqlClient.request).mock.calls[0];
    const aggregateSeriesBlock = String(query).match(/aggregateSeries\s*{([^}]*)}/s)?.[1] ?? "";
    expect(aggregateSeriesBlock).toMatch(/totalUserSubscriptions/);
  });

  // Per-work new metrics (plan §1/§3.1-3.3): comments, the always-present
  // total bookmarks count, subscriptions, and the sparse enrichment-derived
  // publicBookmarks/privateBookmarks split all live on PerWorkPointType
  // (i.e. inside perWorkSeries's nested `points { ... }` block, one value
  // per snapshot) - not on PerWorkSeries itself. None of the five are
  // requested by the query today.
  it("selects comments/bookmarks/subscriptions/publicBookmarks/privateBookmarks inside the perWorkSeries points block", () => {
    vi.mocked(graphqlClient.request).mockResolvedValue({
      statsForUser: { aggregateSeries: [], perWorkSeries: [], earliestPostYear: null },
    });

    renderWithClient("someauthor", "tok_valid");

    const [query] = vi.mocked(graphqlClient.request).mock.calls[0];
    const pointsBlock = String(query).match(/points\s*{([^}]*)}/s)?.[1] ?? "";
    expect(pointsBlock).toMatch(/\bcomments\b/);
    expect(pointsBlock).toMatch(/\bbookmarks\b/);
    expect(pointsBlock).toMatch(/\bsubscriptions\b/);
    expect(pointsBlock).toMatch(/\bpublicBookmarks\b/);
    expect(pointsBlock).toMatch(/\bprivateBookmarks\b/);
  });

  // docs/plans/bookmark-notes-feed.md (Testing task T-03): the ONE real
  // data-layer change this plan makes is extending STATS_FOR_USER_QUERY with
  // a `bookmarks {...}` selection inside perWorkSeries - the backend field
  // already resolves (WorkBookmarkType/PerWorkSeriesType#bookmarks, non-null
  // list), so this is a genuine runtime RED (no tsc -b needed) until the
  // query document is extended, mirroring the plan's own "one field per
  // regex block" testing convention used above for points/aggregateSeries.
  it("selects a bookmarks block with bookmarkerName/noteHtml/bookmarkerTags/bookmarkedOn/collections inside the perWorkSeries block of the query document", () => {
    vi.mocked(graphqlClient.request).mockResolvedValue({
      statsForUser: { aggregateSeries: [], perWorkSeries: [], earliestPostYear: null },
    });

    renderWithClient("someauthor", "tok_valid");

    const [query] = vi.mocked(graphqlClient.request).mock.calls[0];
    const perWorkSeriesBlock =
      String(query).match(/perWorkSeries\s*{([^}]*bookmarks[^}]*})/s)?.[0] ?? "";
    const bookmarksBlock = perWorkSeriesBlock.match(/bookmarks\s*{([^}]*)}/s)?.[1] ?? "";
    expect(bookmarksBlock).toMatch(/\bbookmarkerName\b/);
    expect(bookmarksBlock).toMatch(/\bnoteHtml\b/);
    expect(bookmarksBlock).toMatch(/\bbookmarkerTags\b/);
    expect(bookmarksBlock).toMatch(/\bbookmarkedOn\b/);
    expect(bookmarksBlock).toMatch(/\bcollections\b/);
  });

  // Compile-time companion (same "caught by tsc -b, not vitest run"
  // discipline used throughout this file): WorkBookmark must expose all
  // five fields as nullable (matching the backend's `null: true` on every
  // field, per the plan's data-model section) - a null-heavy literal like
  // an anonymous/deleted bookmarker with no tags/collections/date must be
  // assignable.
  it("WorkBookmark accepts all-null optional fields (compile-time shape, verified via tsc -b)", () => {
    const populated: WorkBookmark = {
      bookmarkerName: "reader123",
      noteHtml: "<p>Loved this!</p>",
      bookmarkerTags: ["favorite"],
      bookmarkedOn: "2026-01-01",
      collections: ["Staff Picks"],
    };
    const allNull: WorkBookmark = {
      bookmarkerName: null,
      noteHtml: null,
      bookmarkerTags: [],
      bookmarkedOn: null,
      collections: [],
    };

    expect(populated.bookmarkerName).toBe("reader123");
    expect(allNull.bookmarkerName).toBeNull();
    expect(allNull.noteHtml).toBeNull();
    expect(allNull.bookmarkedOn).toBeNull();
  });

  // Compile-time companion: PerWorkSeries.bookmarks is a required, non-null
  // LIST field (the plan: "the list itself is non-null") - an empty array
  // for a never-enriched work, or a populated one, must both satisfy the
  // type without the field being optional.
  it("PerWorkSeries.bookmarks is a required WorkBookmark[] (compile-time shape, verified via tsc -b)", () => {
    const noBookmarksYet: PerWorkSeries = {
      ao3WorkId: 1,
      title: "Work One",
      fandoms: "",
      points: [],
      bookmarks: [],
    };
    const withBookmarks: PerWorkSeries = {
      ao3WorkId: 2,
      title: "Work Two",
      fandoms: "",
      points: [],
      bookmarks: [
        {
          bookmarkerName: "reader123",
          noteHtml: "<p>Loved this!</p>",
          bookmarkerTags: [],
          bookmarkedOn: "2026-01-01",
          collections: [],
        },
      ],
    };

    expect(noBookmarksYet.bookmarks).toEqual([]);
    expect(withBookmarks.bookmarks).toHaveLength(1);
  });

  // Compile-time companions to the two query-document tests above (same
  // "caught by tsc -b, not vitest run" discipline as the publishedOn case):
  // AggregateSeriesPoint/PerWorkPoint must actually declare these fields or
  // DashboardPage/WorkComparisonSection have nothing typed to read once the
  // query document itself is fixed.
  it("AggregateSeriesPoint.totalUserSubscriptions is a required number (compile-time shape, verified via tsc -b)", () => {
    const point: AggregateSeriesPoint = {
      capturedOn: "2026-01-01",
      totalHits: 100,
      totalKudos: 10,
      kudosToHitsRatio: 0.1,
      totalUserSubscriptions: 42,
    };

    expect(point.totalUserSubscriptions).toBe(42);
  });

  it("PerWorkPoint exposes the five new fields with the backend's non-null/nullable split (compile-time shape, verified via tsc -b)", () => {
    const enriched: PerWorkPoint = {
      capturedOn: "2026-01-01",
      hits: 10,
      kudos: 2,
      comments: 3,
      bookmarks: 5,
      subscriptions: 1,
      publicBookmarks: 4,
      privateBookmarks: 1,
    };
    const notYetEnriched: PerWorkPoint = {
      capturedOn: "2026-01-08",
      hits: 20,
      kudos: 4,
      comments: 6,
      bookmarks: 9,
      subscriptions: 2,
      // publicBookmarks/privateBookmarks are nullable - enrichment hasn't
      // run for this snapshot yet, per plan §3.3.
      publicBookmarks: null,
      privateBookmarks: null,
    };

    expect(enriched.publicBookmarks).toBe(4);
    expect(notYetEnriched.publicBookmarks).toBeNull();
    expect(notYetEnriched.privateBookmarks).toBeNull();
  });
});
