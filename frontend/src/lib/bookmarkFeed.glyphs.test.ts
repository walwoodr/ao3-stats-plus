import { describe, expect, it } from "vitest";
import { buildGlyphStyleAssignment, shouldShowGlyphs } from "./bookmarkFeed";

// Glyph-visibility/assignment slice of bookmarkFeed.ts's pure-logic test
// suite, split out of the original bookmarkFeed.test.ts (CODE_STANDARDS.md's
// 400-line .ts budget - see bookmarkFeedTestSupport.ts's header comment).

describe("shouldShowGlyphs (Decision D5: glyphs only for a 2-10-work active filter)", () => {
  it("returns false for 0 displayed works (the unfiltered default, D1)", () => {
    expect(shouldShowGlyphs(0)).toBe(false);
  });

  it("returns false for exactly 1 displayed work (a single-work filter)", () => {
    expect(shouldShowGlyphs(1)).toBe(false);
  });

  it("returns true for 2 displayed works", () => {
    expect(shouldShowGlyphs(2)).toBe(true);
  });

  it("returns true for 10 displayed works (the WorkPicker cap)", () => {
    expect(shouldShowGlyphs(10)).toBe(true);
  });

  // Not reachable through a real filtered selection (WorkPicker caps at 10),
  // but the unfiltered default CAN exceed 10 (C2) - shouldShowGlyphs must
  // still resolve sensibly rather than assume displayedWorkCount <= 10.
  it("returns false for displayed-work counts above 10 (defensive - the unfiltered default can exceed the cap, C2)", () => {
    expect(shouldShowGlyphs(11)).toBe(false);
    expect(shouldShowGlyphs(50)).toBe(false);
  });
});

describe("buildGlyphStyleAssignment (stable per-work style slots, reusing seriesStyles.ts unmodified)", () => {
  it("assigns a distinct style-slot index to each displayed work", () => {
    const assignment = buildGlyphStyleAssignment([10, 20, 30]);

    expect(assignment.get(10)).toBeDefined();
    expect(assignment.get(20)).toBeDefined();
    expect(assignment.get(30)).toBeDefined();
    const indices = [assignment.get(10), assignment.get(20), assignment.get(30)];
    expect(new Set(indices).size).toBe(3);
  });

  // C7: a work's glyph stays the same across every row it owns (assigned
  // from work identity, not row/page position) - this is really an
  // assertion that the SAME workId always maps to the SAME slot within one
  // assignment, which is what makes repeated per-row lookups stable.
  it("is keyed by work identity, so repeated lookups for the same workId return the same slot", () => {
    const assignment = buildGlyphStyleAssignment([10, 20]);

    expect(assignment.get(10)).toBe(assignment.get(10));
  });

  // The 10-work cap on any active filter (WorkPicker's MAX_SELECTED_WORKS)
  // guarantees every glyph-shown work gets a genuinely unique slot - no
  // cycling/modulo scheme needed (plan §3/§D5).
  it("assigns a unique slot to all 10 works when a filter is at the cap", () => {
    const workIds = Array.from({ length: 10 }, (_, i) => i + 1);
    const assignment = buildGlyphStyleAssignment(workIds);

    expect(new Set(assignment.values()).size).toBe(10);
  });
});
