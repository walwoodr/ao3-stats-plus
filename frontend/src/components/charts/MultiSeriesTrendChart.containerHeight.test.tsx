import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MultiSeriesTrendChart, type SeriesDatum } from "./MultiSeriesTrendChart";

// Chart-table-polish-batch item 3 (docs/plans/chart-table-polish-batch.md
// §4/§8 T3): MultiSeriesTrendChart gets the same 75vh-at-md+ treatment as
// TrendChart/RatioChart - see TrendChart.containerHeight.test.tsx's
// identical top-of-file comment for the full rationale.
const SERIES: SeriesDatum[] = [
  {
    workId: 1,
    title: "Work One",
    styleIndex: 0,
    points: [
      { capturedOn: "2026-01-01", value: 100 },
      { capturedOn: "2026-01-08", value: 220 },
    ],
  },
];

function findHeightWrapper(container: HTMLElement): Element | undefined {
  return Array.from(container.querySelectorAll("div")).find(
    (el) => el.className.includes("h-[300px]") && el.className.includes("md:h-[75vh]"),
  );
}

describe("MultiSeriesTrendChart: 75vh height at the md+ breakpoint (item 3)", () => {
  it("renders a wrapper element carrying both the compact-default and md: 75vh height classes", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={SERIES} />,
    );

    // See TrendChart.containerHeight.test.tsx's identical comment: `find`
    // returns undefined, not null, on no match.
    expect(findHeightWrapper(container)).toBeDefined();
  });

  it("passes height=\"100%\" to Recharts' ResponsiveContainer so it fills the wrapper's resolved height", () => {
    const { container } = render(
      <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={SERIES} />,
    );

    const responsiveContainer = container.querySelector(".recharts-responsive-container");
    expect(responsiveContainer).not.toBeNull();
    expect((responsiveContainer as HTMLElement).style.height).toBe("100%");
  });
});
