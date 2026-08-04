import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { graphqlClient } from "../lib/graphqlClient";
import { useStatsForUser, type PerWorkSeries } from "./useStatsForUser";

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
    };
    const missing: PerWorkSeries = {
      ao3WorkId: 2,
      title: "Work Two",
      fandoms: "",
      points: [],
      publishedOn: null,
    };

    expect(accurate.publishedOn).toBe("2020-06-01");
    expect(missing.publishedOn).toBeNull();
  });
});
