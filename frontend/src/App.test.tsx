import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Toolchain smoke test - confirms Vitest + React Testing Library + React
// Router are wired together correctly. Real feature tests belong to the
// Testing stage.
describe("App", () => {
  it("renders the home page heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /ao3-stats-plus/i })).toBeInTheDocument();
  });
});
