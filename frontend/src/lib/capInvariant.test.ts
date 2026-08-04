import { describe, expect, it } from "vitest";
import { MAX_SELECTED_WORKS } from "./comparisonSelection";
import { SERIES_STYLE_SLOTS } from "./seriesStyles";
import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS } from "./colorTokens";

// Testing task 6 (docs/plans/usds-dataviz-color-scheme.md, section 7): the
// three separate literals that must stay in sync are spread across three
// modules (comparisonSelection.ts's cap, seriesStyles.ts's slot table,
// colorTokens.ts's two color arrays) - a real desync risk the plan's Error
// states section calls out explicitly ("a regression test asserts all
// three stay equal so a future edit to one can't desync"). This file's only
// job is that cross-module guard, kept separate from each module's own
// dedicated spec file so it reads as its own regression fence rather than
// being buried in one module's test file.
describe("cap invariant: MAX_SELECTED_WORKS === SERIES_STYLE_SLOTS.length === series palette length (both modes)", () => {
  it("keeps MAX_SELECTED_WORKS, SERIES_STYLE_SLOTS.length, and both series palettes' lengths all equal to 10", () => {
    expect(MAX_SELECTED_WORKS).toBe(10);
    expect(SERIES_STYLE_SLOTS).toHaveLength(10);
    expect(LIGHT_COLOR_TOKENS.series).toHaveLength(10);
    expect(DARK_COLOR_TOKENS.series).toHaveLength(10);
  });

  it("keeps all four quantities mutually equal, not just each individually equal to 10 (guards a future joint edit)", () => {
    const lengths = [
      MAX_SELECTED_WORKS,
      SERIES_STYLE_SLOTS.length,
      LIGHT_COLOR_TOKENS.series.length,
      DARK_COLOR_TOKENS.series.length,
    ];

    expect(new Set(lengths).size).toBe(1);
  });
});
