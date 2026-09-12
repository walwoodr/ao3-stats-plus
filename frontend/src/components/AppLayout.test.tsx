import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./AppLayout";

// AppLayout wraps every route with semantic header/nav/main landmarks and
// moves focus to the main content on route change, per the plan.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<p>home content</p>} />
          <Route path="/install" element={<p>install content</p>} />
          <Route path="/u/:username" element={<p>dashboard content</p>} />
          <Route path="/u/:username/bookmarks" element={<p>bookmarks content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  it("renders a header landmark", () => {
    renderAt("/");
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  // Brand name must match what InstallPage/the bookmarklet itself show
  // ("AO3 Stats+") rather than the lowercase technical package/repo name -
  // two different names for the same product read as a mistake, not a
  // stylistic choice.
  it("shows the product's brand name, not the technical package name", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "AO3 Stats+" })).toBeInTheDocument();
  });

  it("renders a navigation landmark with links to Home and Install", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /install/i })).toBeInTheDocument();
  });

  it("renders a main landmark containing the routed content", () => {
    renderAt("/install");
    const main = screen.getByRole("main");
    expect(main).toContainElement(screen.getByText("install content"));
  });

  it("gives the main landmark a programmatically focusable tabIndex for route-change focus management", () => {
    renderAt("/");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus to the main landmark on mount (simulating a route change)", () => {
    renderAt("/");
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  // docs/plans/bookmark-notes-feed.md, task T-09: AppLayout currently has no
  // way to render username-scoped nav links (it renders one global "Install"
  // link only) - extended to add "Dashboard"/"Bookmarks" links, visible only
  // when the current path matches /u/:username*, via react-router's
  // useMatch. Not implemented yet - every test below is expected to fail.
  describe("username-scoped Dashboard/Bookmarks nav links", () => {
    it("does not render Dashboard/Bookmarks links on routes outside /u/:username*", () => {
      renderAt("/");

      expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /bookmarks/i })).not.toBeInTheDocument();
    });

    it("does not render them on /install either", () => {
      renderAt("/install");

      expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /bookmarks/i })).not.toBeInTheDocument();
    });

    it("renders Dashboard and Bookmarks links, with correct hrefs, on the dashboard route", () => {
      renderAt("/u/testauthor");

      const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
      const bookmarksLink = screen.getByRole("link", { name: /bookmarks/i });
      expect(dashboardLink).toHaveAttribute("href", "/u/testauthor");
      expect(bookmarksLink).toHaveAttribute("href", "/u/testauthor/bookmarks");
    });

    it("renders Dashboard and Bookmarks links, with correct hrefs, on the bookmarks route itself", () => {
      renderAt("/u/testauthor/bookmarks");

      const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
      const bookmarksLink = screen.getByRole("link", { name: /bookmarks/i });
      expect(dashboardLink).toHaveAttribute("href", "/u/testauthor");
      expect(bookmarksLink).toHaveAttribute("href", "/u/testauthor/bookmarks");
    });

    // Same link styling/focus-ring classes already used for "Install" (plan
    // §"Route & nav") - a visible, keyboard-focusable outline, not a
    // sighted-only :hover affordance.
    it("gives the Dashboard/Bookmarks links the same focus-visible outline classes as the Install link", () => {
      renderAt("/u/testauthor");

      const installLink = screen.getByRole("link", { name: /install/i });
      const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
      expect(dashboardLink.className).toContain("focus-visible:outline-2");
      expect(dashboardLink.className).toContain("focus-visible:outline-accent");
      expect(installLink.className).toContain("focus-visible:outline-2");
    });
  });
});
