import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { graphqlClient } from "../lib/graphqlClient";
import { useStatsForUser } from "./useStatsForUser";

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
});
