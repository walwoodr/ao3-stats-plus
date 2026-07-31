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
});
