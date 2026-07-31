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

  // Same brand name as AppLayout's header link and InstallPage's heading
  // ("AO3 Stats+"), not the lowercase technical package/repo name.
  it("uses the product's brand name, not the technical package name", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("AO3 Stats+");
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
