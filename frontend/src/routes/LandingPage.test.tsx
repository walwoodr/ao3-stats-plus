import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  it("renders a top-level heading introducing the product", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("links to the bookmarklet install instructions", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const installLink = screen.getByRole("link", { name: /install|bookmarklet|get started/i });
    expect(installLink).toHaveAttribute("href", "/install");
  });
});
