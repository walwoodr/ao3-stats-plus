import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { useTokenStore } from "./useTokenStore";
import { useTokenFromUrl } from "./useTokenFromUrl";

// useTokenFromUrl implements the DashboardPage-mount corner cases from the
// plan: capture ?token= from the URL, persist it per-username, strip it via
// a replace-navigation, and fall back to a previously stored token when the
// param is absent.
function Harness({ username }: { username: string }) {
  const token = useTokenFromUrl(username);
  const location = useLocation();

  return (
    <div>
      <span data-testid="token">{token ?? "none"}</span>
      <span data-testid="search">{location.search}</span>
    </div>
  );
}

function renderAt(path: string, username = "someauthor") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/u/:username" element={<Harness username={username} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useTokenFromUrl", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTokenStore.setState({ tokensByUsername: {} });
  });

  it("captures the token from the ?token= query param", async () => {
    renderAt("/u/someauthor?token=tok_from_url");

    expect(await screen.findByTestId("token")).toHaveTextContent("tok_from_url");
  });

  it("stores the captured token per-username", async () => {
    renderAt("/u/someauthor?token=tok_from_url");
    await screen.findByTestId("token");

    expect(useTokenStore.getState().getToken("someauthor")).toBe("tok_from_url");
  });

  it("strips the token param from the URL via a replace-navigation", async () => {
    renderAt("/u/someauthor?token=tok_from_url");

    const search = await screen.findByTestId("search");
    expect(search).toHaveTextContent("");
  });

  it("falls back to a stored token when the URL has no ?token= param", async () => {
    useTokenStore.getState().setToken("someauthor", "tok_stored");

    renderAt("/u/someauthor");

    expect(await screen.findByTestId("token")).toHaveTextContent("tok_stored");
  });

  it("returns no token when neither the URL nor storage has one", async () => {
    renderAt("/u/someauthor");

    expect(await screen.findByTestId("token")).toHaveTextContent("none");
  });

  it("does not touch a different username's stored token", async () => {
    useTokenStore.getState().setToken("otherauthor", "tok_other");

    renderAt("/u/someauthor?token=tok_from_url", "someauthor");
    await screen.findByTestId("token");

    expect(useTokenStore.getState().getToken("otherauthor")).toBe("tok_other");
  });
});
