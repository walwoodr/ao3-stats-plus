import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonLegend, type ComparisonLegendEntry } from "./ComparisonLegend";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Testing task 8 (docs/plans/usds-dataviz-color-scheme.md, section 7): no
// prior ComparisonLegend test file existed - this is a new spec.
//
// Per direct user instruction (2026-08-09 TECH_DEBT.md, "Remove worded
// description from legend"), the legend no longer renders a worded style
// description ("slate-blue circle marker") next to each work's title - it
// shows only the glyph and the title. The (shape, color) identity mapping
// isn't lost for screen-reader users: it moved to
// MultiSeriesTrendChart's sr-only accessible data table (see that file's
// test suite), which is where MASTER.md's Multi-Series Comparison Charts
// section documents it as living now. `legendDescription` is kept here only
// to assert the wording is genuinely absent from this component's output.
function legendDescription(styleIndex: number): string {
  const slot = SERIES_STYLE_SLOTS[styleIndex];
  return `${slot.colorRole} ${slot.shape} marker`;
}

function entry(
  overrides: Partial<ComparisonLegendEntry> & { workId: number },
): ComparisonLegendEntry {
  return { title: `Work ${overrides.workId}`, styleIndex: 0, ...overrides };
}

describe("ComparisonLegend", () => {
  it("renders one legend entry per work, showing its title", () => {
    const entries = [
      entry({ workId: 1, title: "Work A", styleIndex: 0 }),
      entry({ workId: 2, title: "Work B", styleIndex: 1 }),
    ];

    render(<ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />);

    expect(screen.getByText("Work A")).toBeInTheDocument();
    expect(screen.getByText("Work B")).toBeInTheDocument();
  });

  it("does not render a worded style description next to the title", () => {
    const entries = [
      entry({ workId: 1, title: "Work A", styleIndex: 0 }),
      entry({ workId: 2, title: "Work B", styleIndex: 1 }),
    ];

    render(<ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />);

    expect(screen.queryByText(new RegExp(legendDescription(0), "i"))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(legendDescription(1), "i"))).not.toBeInTheDocument();
  });

  it("never mentions dash/dashed/line-style wording anywhere in the legend (dash is gone as a channel)", () => {
    const entries = [entry({ workId: 1, title: "Work A", styleIndex: 0 })];

    const { container } = render(
      <ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />,
    );

    expect(container.textContent).not.toMatch(/\bline\b|\bdash\w*\b|\bdotted\b|\bsolid\b/i);
  });

  it("renders a glyph per entry, aria-hidden so the accessible name is the title text next to it", () => {
    const entries = [entry({ workId: 1, title: "Work A", styleIndex: 0 })];

    const { container } = render(
      <ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />,
    );

    const glyph = container.querySelector('svg[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
  });

  it("renders a distinct glyph per slot for all 10 slots (full cap-raise state)", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ workId: i + 1, title: `Work ${i + 1}`, styleIndex: i }),
    );

    const { container } = render(
      <ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />,
    );

    const glyphs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(glyphs).toHaveLength(10);

    const glyphMarkup = Array.from(glyphs).map((svg) => svg.innerHTML);
    expect(new Set(glyphMarkup).size).toBe(10);
  });

  it("renders all 10 works' titles for the full cap-raise state", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ workId: i + 1, title: `Work ${i + 1}`, styleIndex: i }),
    );

    render(<ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />);

    entries.forEach((e) => {
      expect(screen.getByText(e.title)).toBeInTheDocument();
    });
  });

  it("renders nothing but an empty list for zero entries, without throwing", () => {
    expect(() =>
      render(<ComparisonLegend entries={[]} seriesColors={LIGHT_COLOR_TOKENS.series} />),
    ).not.toThrow();
  });
});
