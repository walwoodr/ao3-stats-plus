import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonLegend, type ComparisonLegendEntry } from "./ComparisonLegend";
import { SERIES_STYLE_SLOTS } from "../../lib/seriesStyles";
import { LIGHT_COLOR_TOKENS } from "../../lib/colorTokens";

// Testing task 8 (docs/plans/usds-dataviz-color-scheme.md, section 7): no
// prior ComparisonLegend test file existed - this is a new spec. The
// worded description drops the dash word entirely (dash is gone as a
// per-series channel - see the plan's "Dash decision") and becomes
// "{colorRole} {shape} marker" (plan's own examples: "wine circle marker",
// "slate hollow-circle marker"). This test derives the expected wording
// from the real SERIES_STYLE_SLOTS table (mirroring the pre-existing
// convention in MultiSeriesTrendChart.test.tsx's `legendDescription`
// helper) rather than hardcoding literal slot words, since the plan's own
// prose example ("slate hollow-circle marker") and its file-touched
// section's literal shape identifier (`circle-hollow`) don't visibly agree
// on hyphen order - deriving from the real table sidesteps that ambiguity
// rather than guessing which one is authoritative.
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
  it("renders one legend entry per work, mapping title to its worded style description", () => {
    const entries = [
      entry({ workId: 1, title: "Work A", styleIndex: 0 }),
      entry({ workId: 2, title: "Work B", styleIndex: 1 }),
    ];

    render(<ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />);

    expect(
      screen.getByText(new RegExp(`Work A.*${legendDescription(0)}`, "i")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Work B.*${legendDescription(1)}`, "i")),
    ).toBeInTheDocument();
  });

  it("never mentions dash/dashed/line-style wording in the worded description (dash is gone as a channel)", () => {
    const entries = [entry({ workId: 1, title: "Work A", styleIndex: 0 })];

    render(<ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />);

    const legendItem = screen.getByText(/Work A/i);
    // The new format is exactly "{colorRole} {shape} marker" - no "line"
    // word at all (the old "<dashLabel> <colorRole> line, <shape> marker"
    // format always included one), and none of the old dashLabel words.
    expect(legendItem.textContent).not.toMatch(/\bline\b|\bdash\w*\b|\bdotted\b|\bsolid\b/i);
  });

  it("renders a glyph per entry, aria-hidden so the accessible name is the worded text next to it", () => {
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

  it("gives every one of the 10 slots a distinct worded style description", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ workId: i + 1, title: `Work ${i + 1}`, styleIndex: i }),
    );

    render(<ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />);

    const descriptions = entries.map((e) => legendDescription(e.styleIndex));
    expect(new Set(descriptions).size).toBe(10);
    descriptions.forEach((description, i) => {
      expect(
        screen.getByText(new RegExp(`Work ${i + 1}.*${description}`, "i")),
      ).toBeInTheDocument();
    });
  });

  it("renders each entry's title and description text within one findable node per entry", () => {
    const entries = [
      entry({ workId: 1, title: "Alpha", styleIndex: 0 }),
      entry({ workId: 2, title: "Beta", styleIndex: 1 }),
    ];

    render(<ComparisonLegend entries={entries} seriesColors={LIGHT_COLOR_TOKENS.series} />);

    expect(screen.getByText(new RegExp(`Alpha.*${legendDescription(0)}`, "i"))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Beta.*${legendDescription(1)}`, "i"))).toBeInTheDocument();
  });

  it("renders nothing but an empty list for zero entries, without throwing", () => {
    expect(() =>
      render(<ComparisonLegend entries={[]} seriesColors={LIGHT_COLOR_TOKENS.series} />),
    ).not.toThrow();
  });
});
