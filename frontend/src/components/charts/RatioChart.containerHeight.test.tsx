import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RatioChart } from "./RatioChart";

// Chart-table-polish-batch item 3 (docs/plans/chart-table-polish-batch.md
// §4/§8 T3): RatioChart gets the same 75vh-at-md+ treatment as TrendChart -
// see that file's identical top-of-file comment for the full rationale
// (why no ResizeObserver polyfill is needed, and why the class string is
// asserted rather than a computed pixel height).
const POINTS = [
  { capturedOn: "2026-01-01", ratio: 0.1 },
  { capturedOn: "2026-01-08", ratio: 0.14 },
];

function findHeightWrapper(container: HTMLElement): Element | undefined {
  return Array.from(container.querySelectorAll("div")).find(
    (el) => el.className.includes("h-[300px]") && el.className.includes("md:h-[75vh]"),
  );
}

describe("RatioChart: 75vh height at the md+ breakpoint (item 3)", () => {
  it("renders a wrapper element carrying both the compact-default and md: 75vh height classes", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={POINTS} />);

    // See TrendChart.containerHeight.test.tsx's identical comment: `find`
    // returns undefined, not null, on no match.
    expect(findHeightWrapper(container)).toBeDefined();
  });

  it("passes height=\"100%\" to Recharts' ResponsiveContainer so it fills the wrapper's resolved height", () => {
    const { container } = render(<RatioChart title="Kudos-to-hits ratio" points={POINTS} />);

    const responsiveContainer = container.querySelector(".recharts-responsive-container");
    expect(responsiveContainer).not.toBeNull();
    expect((responsiveContainer as HTMLElement).style.height).toBe("100%");
  });
});
