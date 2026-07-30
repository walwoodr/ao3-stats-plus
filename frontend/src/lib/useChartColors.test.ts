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
