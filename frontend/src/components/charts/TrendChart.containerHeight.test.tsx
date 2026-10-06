import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

// Chart-table-polish-batch item 3 (docs/plans/chart-table-polish-batch.md
// §4/§8 T3): the chart grows to 75vh tall at the project's `md` (>=768px)
// breakpoint, keeping today's compact 300px height below it. Per the
// plan's own jsdom test note (§4 item 3): "75vh" is a wrapper CSS class,
// not a prop jsdom resolves - this asserts the literal class string, not a
// computed pixel height, matching WorkComparisonSection.test.tsx's existing
// convention for `md:grid`. No ResizeObserver polyfill is needed here:
// Recharts' ResponsiveContainer unconditionally renders its own outer
// `.recharts-responsive-container` div with the literal `height` prop
// echoed into its inline style, even before any resize measurement occurs
// (verified against the installed recharts@3.10.0 source).
const POINTS = [
  { capturedOn: "2026-01-01", value: 100 },
  { capturedOn: "2026-01-08", value: 220 },
];

function findHeightWrapper(container: HTMLElement): Element | undefined {
  return Array.from(container.querySelectorAll("div")).find(
    (el) => el.className.includes("h-[300px]") && el.className.includes("md:h-[75vh]"),
  );
}

describe("TrendChart: 75vh height at the md+ breakpoint (item 3)", () => {
  it("renders a wrapper element carrying both the compact-default and md: 75vh height classes", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
    );

    // `find` returns undefined (not null) when no match exists, so this
    // must assert definedness explicitly - `.not.toBeNull()` alone would
    // trivially pass on a missing wrapper, since undefined !== null.
    expect(findHeightWrapper(container)).toBeDefined();
  });

  it("passes height=\"100%\" to Recharts' ResponsiveContainer so it fills whatever height the wrapper above resolves to, rather than a fixed pixel height", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
    );

    const responsiveContainer = container.querySelector(".recharts-responsive-container");
    expect(responsiveContainer).not.toBeNull();
    expect((responsiveContainer as HTMLElement).style.height).toBe("100%");
  });

  it("still renders the chart's figure/table structure unaffected by the height wrapper (no structural regression)", () => {
    const { container } = render(
      <TrendChart title="Total hits" valueLabel="Hits" points={POINTS} />,
    );

    expect(container.querySelector('[role="img"]')).not.toBeNull();
    expect(container.querySelector("table")).not.toBeNull();
  });
});
