import { describe, expect, it } from "vitest";
import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS } from "./colorTokens";

// Testing task 1 (docs/plans/usds-dataviz-color-scheme.md, section 7): the
// new 10-slot USDS-modeled palette replaces the old 6-slot `series` array.
// Contrast ratios are recomputed here from the real hex pairs via the WCAG
// 2.1 relative-luminance formula (not hardcoded from the plan's own table),
// so this test independently verifies the plan's claimed numbers rather than
// just echoing them back.

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not a 6-digit hex color: ${hex}`);
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

// WCAG relative luminance (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbChannelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// WCAG 2.1 SC 1.4.11 non-text contrast bar (>=3:1) - the correct bar for a
// graphical object (chart line/marker), not the 4.5:1 body-text bar. See the
// plan's "Palette derivation & verification" section.
const NON_TEXT_CONTRAST_FLOOR = 3;

describe("colorTokens: the 10-slot series palette", () => {
  it("has exactly 10 light-mode series colors (raised from 6, per the cap raise)", () => {
    expect(LIGHT_COLOR_TOKENS.series).toHaveLength(10);
  });

  it("has exactly 10 dark-mode series colors (raised from 6, per the cap raise)", () => {
    expect(DARK_COLOR_TOKENS.series).toHaveLength(10);
  });

  it("clears the 3:1 non-text-contrast bar against the light card for every light series color", () => {
    LIGHT_COLOR_TOKENS.series.forEach((hex, index) => {
      const ratio = contrastRatio(hex, LIGHT_COLOR_TOKENS.card);
      expect(
        ratio,
        `slot ${index} (${hex}) vs light card ${LIGHT_COLOR_TOKENS.card}`,
      ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);
    });
  });

  it("clears the 3:1 non-text-contrast bar against the dark card for every dark series color", () => {
    DARK_COLOR_TOKENS.series.forEach((hex, index) => {
      const ratio = contrastRatio(hex, DARK_COLOR_TOKENS.card);
      expect(
        ratio,
        `slot ${index} (${hex}) vs dark card ${DARK_COLOR_TOKENS.card}`,
      ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);
    });
  });

  it("gives every light-mode series color a distinct hex (no accidental duplicate slots)", () => {
    expect(new Set(LIGHT_COLOR_TOKENS.series).size).toBe(LIGHT_COLOR_TOKENS.series.length);
  });

  it("gives every dark-mode series color a distinct hex (no accidental duplicate slots)", () => {
    expect(new Set(DARK_COLOR_TOKENS.series).size).toBe(DARK_COLOR_TOKENS.series.length);
  });

  it("uses well-formed 6-digit hex strings for every slot in both modes", () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    LIGHT_COLOR_TOKENS.series.forEach((hex) => expect(hex).toMatch(hexPattern));
    DARK_COLOR_TOKENS.series.forEach((hex) => expect(hex).toMatch(hexPattern));
  });
});
