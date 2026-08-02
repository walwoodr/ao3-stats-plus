import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChartColors, usePrefersDarkColorScheme } from "./useChartColors";
import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS } from "./colorTokens";

// jsdom does not implement window.matchMedia at all (see src/test/setup.ts's
// default stub) - this hook's own tests replace it with a minimal,
// controllable MediaQueryList stand-in whose `matches` value and dispatched
// `change` events can be driven directly, so "updates when the system
// preference changes" is exercised deterministically rather than depending
// on a real OS-level preference.
function installMatchMediaMock(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;

  window.matchMedia = () => mediaQueryList;

  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
  };
}

describe("usePrefersDarkColorScheme / useChartColors", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns false when the system prefers light mode", () => {
    installMatchMediaMock(false);

    const { result } = renderHook(() => usePrefersDarkColorScheme());

    expect(result.current).toBe(false);
  });

  it("returns true when the system prefers dark mode", () => {
    installMatchMediaMock(true);

    const { result } = renderHook(() => usePrefersDarkColorScheme());

    expect(result.current).toBe(true);
  });

  it("updates when the system preference changes after mount", () => {
    const mock = installMatchMediaMock(false);
    const { result } = renderHook(() => usePrefersDarkColorScheme());
    expect(result.current).toBe(false);

    act(() => mock.setMatches(true));

    expect(result.current).toBe(true);
  });

  it("resolves the light token set when the system prefers light mode", () => {
    installMatchMediaMock(false);

    const { result } = renderHook(() => useChartColors());

    expect(result.current).toEqual(LIGHT_COLOR_TOKENS);
  });

  it("resolves the dark token set when the system prefers dark mode", () => {
    installMatchMediaMock(true);

    const { result } = renderHook(() => useChartColors());

    expect(result.current).toEqual(DARK_COLOR_TOKENS);
  });

  it("switches token sets reactively when the system preference changes", () => {
    const mock = installMatchMediaMock(false);
    const { result } = renderHook(() => useChartColors());
    expect(result.current).toEqual(LIGHT_COLOR_TOKENS);

    act(() => mock.setMatches(true));

    expect(result.current).toEqual(DARK_COLOR_TOKENS);
  });
});

// The multi-series categorical palette (decision A - a redundant color
// channel on top of shape+dash, never color-only) is added to ColorTokens
// as a `series` array, one hex per seriesStyles.ts slot, in the SAME order
// as that slot table (wine, teal, amber, indigo, green, purple) - see the
// plan's Q3 table and "Multi-series categorical palette" section. Both hex
// sets are pinned exactly here, since colorTokens.ts is explicitly a
// duplicated source of truth with index.css/MASTER.md (its own file-level
// comment says to re-verify all three stay in sync).
describe("ColorTokens.series (multi-series categorical palette)", () => {
  const LIGHT_SERIES_HEXES = ["#9F1239", "#0F766E", "#B45309", "#4338CA", "#4D7C5F", "#7E22CE"];
  const DARK_SERIES_HEXES = ["#E8879E", "#5EEAD4", "#FBBF24", "#A5B4FC", "#8FBFA0", "#D8B4FE"];

  it("gives LIGHT_COLOR_TOKENS a series array of exactly 6 hexes", () => {
    expect(LIGHT_COLOR_TOKENS.series).toHaveLength(6);
  });

  it("gives DARK_COLOR_TOKENS a series array of exactly 6 hexes", () => {
    expect(DARK_COLOR_TOKENS.series).toHaveLength(6);
  });

  it("matches the plan's light palette exactly, in slot order (wine, teal, amber, indigo, green, purple)", () => {
    expect(LIGHT_COLOR_TOKENS.series).toEqual(LIGHT_SERIES_HEXES);
  });

  it("matches the plan's dark palette exactly, in slot order (wine, teal, amber, indigo, green, purple)", () => {
    expect(DARK_COLOR_TOKENS.series).toEqual(DARK_SERIES_HEXES);
  });

  it("resolves the series palette reactively through useChartColors, same as the other tokens", () => {
    const mock = installMatchMediaMock(false);
    const { result } = renderHook(() => useChartColors());
    expect(result.current.series).toEqual(LIGHT_SERIES_HEXES);

    act(() => mock.setMatches(true));

    expect(result.current.series).toEqual(DARK_SERIES_HEXES);
  });
});
