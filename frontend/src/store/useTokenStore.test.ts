import { beforeEach, describe, expect, it } from "vitest";
import { useTokenStore } from "./useTokenStore";

// useTokenStore is a Zustand + persist(localStorage) store holding one
// read token per AO3 username. Persistence itself is exercised via the
// store's own localStorage-backed getState()/setState() round trip.
describe("useTokenStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTokenStore.setState({ tokensByUsername: {} });
  });

  it("has no token for a username it has never seen", () => {
    expect(useTokenStore.getState().getToken("someauthor")).toBeUndefined();
  });

  it("stores a token per username via setToken", () => {
    useTokenStore.getState().setToken("someauthor", "tok_123");
    expect(useTokenStore.getState().getToken("someauthor")).toBe("tok_123");
  });

  it("keeps tokens for different usernames independent", () => {
    useTokenStore.getState().setToken("authorA", "tok_a");
    useTokenStore.getState().setToken("authorB", "tok_b");

    expect(useTokenStore.getState().getToken("authorA")).toBe("tok_a");
    expect(useTokenStore.getState().getToken("authorB")).toBe("tok_b");
  });

  it("overwrites a previously stored token for the same username", () => {
    useTokenStore.getState().setToken("someauthor", "tok_old");
    useTokenStore.getState().setToken("someauthor", "tok_new");

    expect(useTokenStore.getState().getToken("someauthor")).toBe("tok_new");
  });

  it("clears a stored token for one username without affecting others", () => {
    useTokenStore.getState().setToken("authorA", "tok_a");
    useTokenStore.getState().setToken("authorB", "tok_b");

    useTokenStore.getState().clearToken("authorA");

    expect(useTokenStore.getState().getToken("authorA")).toBeUndefined();
    expect(useTokenStore.getState().getToken("authorB")).toBe("tok_b");
  });

  it("persists tokens to localStorage under a namespaced key", () => {
    useTokenStore.getState().setToken("persisted_author", "tok_persist");

    const raw = window.localStorage.getItem("ao3-stats-plus-token-store");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? "{}").state.tokensByUsername.persisted_author).toBe("tok_persist");
  });
});
