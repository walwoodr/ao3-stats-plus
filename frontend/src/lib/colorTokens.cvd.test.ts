import { describe, expect, it } from "vitest";
import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS } from "./colorTokens";

// Testing task 2 (docs/plans/usds-dataviz-color-scheme.md, section 7): the
// automated CVD gate. Self-contained on purpose - the plan calls for a
// Vitest spec that hardcodes the Machado-2009 CVD simulation matrices plus
// an sRGB -> CIE Lab conversion (~60 lines, no new dependency), so this file
// does its own color math rather than importing an Implementation module
// that doesn't exist yet (this is a Testing-stage spec against a plan, not
// against real code). Asserts, for the 10 series colors in each mode: (a)
// each clears 3:1 vs its card [hard gate, duplicating colorTokens.test.ts's
// coverage so this file is independently meaningful on its own]; (b) for
// each of protanopia/deuteranopia/tritanopia, the minimum pairwise CIE76 ΔE
// across all colors stays >= 3.0 (the plan's just-noticeable-difference
// floor). Red until the 10-color palette lands (LIGHT/DARK.series is still
// the old 6-color array).
//
// EXTERNAL-UNVERIFIED: the three CVD simulation matrices below are the
// commonly-published Machado, Oliveira & Fernandes (2009) full-severity
// (1.0) dichromacy matrices, applied directly to linear-light sRGB - the
// same approach cited by several open-source CVD-simulation implementations
// this agent has encountered before. This environment has no live web
// access to re-fetch the original paper or Chromium's own "Emulate vision
// deficiencies" source to byte-for-byte confirm these nine coefficients per
// matrix, so treat them as a good-faith, not independently re-verified,
// transcription. The plan's own floor (>=3.0) has comfortable headroom
// against its measured worst case (3.7-3.8), so small coefficient drift is
// unlikely to flip a pass/fail verdict, but this assumption itself hasn't
// been checked against a primary source in this pass - see TECH_DEBT.md.
const CVD_MATRICES: Record<"protanopia" | "deuteranopia" | "tritanopia", number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

type Rgb = [number, number, number];
type Lab = { l: number; a: number; b: number };

function hexToRgb255(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not a 6-digit hex color: ${hex}`);
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function srgbToLinear(channel255: number): number {
  const normalized = channel255 / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function linearToSrgb(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function applyMatrix(matrix: number[][], vector: Rgb): Rgb {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]) as Rgb;
}

// Simulates the given CVD type on a hex color: sRGB -> linear -> Machado
// matrix -> linear (re-clamped, since the matrices can overshoot [0,1]) ->
// back to sRGB 0-255, feeding straight into the Lab conversion below.
function simulateCvd(hex: string, type: keyof typeof CVD_MATRICES): Rgb {
  const [r, g, b] = hexToRgb255(hex).map(srgbToLinear) as Rgb;
  const simulatedLinear = applyMatrix(CVD_MATRICES[type], [r, g, b]);
  return simulatedLinear.map((channel) => linearToSrgb(channel) * 255) as Rgb;
}

// D65 reference white, sRGB primaries (standard values).
const D65 = { x: 95.047, y: 100.0, z: 108.883 };

function rgbToXyz([r255, g255, b255]: Rgb): { x: number; y: number; z: number } {
  const [r, g, b] = [r255, g255, b255].map(srgbToLinear);
  return {
    x: (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100,
    y: (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100,
    z: (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100,
  };
}

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

// CIE Lab, D65 white point (https://en.wikipedia.org/wiki/CIELAB_color_space)
// - standard, well-documented color math, not tied to any external system's
// undocumented shape.
function rgbToLab(rgb: Rgb): Lab {
  const { x, y, z } = rgbToXyz(rgb);
  const fx = labF(x / D65.x);
  const fy = labF(y / D65.y);
  const fz = labF(z / D65.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE76(labA: Lab, labB: Lab): number {
  return Math.sqrt((labA.l - labB.l) ** 2 + (labA.a - labB.a) ** 2 + (labA.b - labB.b) ** 2);
}

// The just-noticeable-difference floor from the plan's "Palette derivation &
// verification" section - not the plan's measured worst-case numbers
// (3.7-3.8), which this test does not hardcode, only the pass bar itself.
const DELTA_E_FLOOR = 3.0;
const NON_TEXT_CONTRAST_FLOOR = 3;

function srgbChannelToLinear(channel255: number): number {
  return srgbToLinear(channel255);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb255(hex).map(srgbChannelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function minPairwiseDeltaE(colors: readonly string[], cvdType: keyof typeof CVD_MATRICES): number {
  const labs = colors.map((hex) => rgbToLab(simulateCvd(hex, cvdType)));
  let minDelta = Infinity;
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      minDelta = Math.min(minDelta, deltaE76(labs[i], labs[j]));
    }
  }
  return minDelta;
}

const CVD_TYPES = ["protanopia", "deuteranopia", "tritanopia"] as const;

describe("colorTokens CVD gate: 10-slot series palette", () => {
  it("has exactly 10 series colors in both modes (prerequisite for the CVD pairwise comparison below)", () => {
    expect(LIGHT_COLOR_TOKENS.series).toHaveLength(10);
    expect(DARK_COLOR_TOKENS.series).toHaveLength(10);
  });

  describe("hard gate: 3:1 non-text contrast vs card", () => {
    it("every light series color clears 3:1 against the light card", () => {
      LIGHT_COLOR_TOKENS.series.forEach((hex) => {
        expect(contrastRatio(hex, LIGHT_COLOR_TOKENS.card)).toBeGreaterThanOrEqual(
          NON_TEXT_CONTRAST_FLOOR,
        );
      });
    });

    it("every dark series color clears 3:1 against the dark card", () => {
      DARK_COLOR_TOKENS.series.forEach((hex) => {
        expect(contrastRatio(hex, DARK_COLOR_TOKENS.card)).toBeGreaterThanOrEqual(
          NON_TEXT_CONTRAST_FLOOR,
        );
      });
    });
  });

  describe.each(CVD_TYPES)("%s: minimum pairwise CIE76 ΔE >= 3.0", (cvdType) => {
    it(`light-mode palette clears the ΔE floor under ${cvdType}`, () => {
      const minDelta = minPairwiseDeltaE(LIGHT_COLOR_TOKENS.series, cvdType);
      expect(minDelta).toBeGreaterThanOrEqual(DELTA_E_FLOOR);
    });

    it(`dark-mode palette clears the ΔE floor under ${cvdType}`, () => {
      const minDelta = minPairwiseDeltaE(DARK_COLOR_TOKENS.series, cvdType);
      expect(minDelta).toBeGreaterThanOrEqual(DELTA_E_FLOOR);
    });
  });
});
