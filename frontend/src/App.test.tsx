import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Toolchain smoke test - confirms Vitest + React Testing Library + React
// Router are wired together correctly. Real feature tests belong to the
// Testing stage.
describe("App", () => {
  afterEach(() => {
    // App.tsx uses a real BrowserRouter (reads window.location at mount,
    // per react-router-dom's createBrowserHistory) - restore "/" so a route
    // pushed by one test never leaks into the next.
    window.history.pushState({}, "", "/");
  });

  it("renders the home page heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /ao3 stats\+/i })).toBeInTheDocument();
  });

  // docs/plans/bookmark-notes-feed.md, task T-09: a new route,
  // /u/:username/bookmarks, nested inside the existing AppLayout route. The
  // route does not exist yet, so this currently renders nothing inside
  // <Routes> (no fallback/404 route is configured) - a genuine RED, not a
  // false negative from some other missing piece.
  it("registers the /u/:username/bookmarks route (renders BookmarkFeedPage's no-token state)", () => {
    window.history.pushState({}, "", "/u/testauthor/bookmarks");
    render(<App />);

    expect(screen.getByLabelText(/read token/i)).toBeInTheDocument();
  });
});
