import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfoBox } from "./InfoBox";

// Maintenance (2026-10-14 - Preview feedback on item 3, batch fix/
// maintenance-2026-10-13): the shared "info box" visual treatment used
// wherever a chart's graph is omitted in favor of an explanatory message
// (TrendChart.tsx, MultiSeriesTrendChart.tsx) - an icon ("i" in a circle)
// plus the message, blue background/border/icon, per direct user
// instruction.
describe("InfoBox", () => {
  it("renders the given message", () => {
    render(
      <InfoBox message="Graph has been omitted. All data points for the current graph are 0." />,
    );

    expect(
      screen.getByText("Graph has been omitted. All data points for the current graph are 0."),
    ).toBeInTheDocument();
  });

  it("renders a decorative, aria-hidden icon alongside the message", () => {
    const { container } = render(<InfoBox message="Example message." />);

    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("applies the blue background/border treatment to the box as a whole", () => {
    render(<InfoBox message="Example message." />);

    const box = screen.getByText("Example message.").closest("div");
    expect(box?.className).toMatch(/bg-blue-50/);
    expect(box?.className).toMatch(/border-blue-300/);
  });

  it("colors the icon blue too", () => {
    const { container } = render(<InfoBox message="Example message." />);

    const iconWrapper = container.querySelector("svg")?.closest("span");
    expect(iconWrapper?.className).toMatch(/text-blue-500/);
  });
});
