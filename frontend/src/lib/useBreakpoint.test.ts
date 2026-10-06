import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBreakpoint } from "./useBreakpoint";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4.1, §8 T7): useBreakpoint.ts does not exist yet - every test below
// fails at the import, a genuine red for this whole file. Mirrors
// useChartColors.ts's exact useSyncExternalStore + matchMedia
// subscribe/getSnapshot pattern (and this file mirrors useChartColors.
// test.ts's own matchMedia-mock convention) - see that file for why jsdom
// needs a controllable MediaQueryList stand-in rather than a real OS-level
// preference.
function installMatchMediaMock(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(min-width: 768px)",
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

describe("useBreakpoint", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('resolves to "base" when the md (>=768px) media query does not match', () => {
    installMatchMediaMock(false);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe("base");
  });

  it('resolves to "md" when the md (>=768px) media query matches', () => {
    installMatchMediaMock(true);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe("md");
  });

  it("updates reactively when the viewport crosses the breakpoint after mount", () => {
    const mock = installMatchMediaMock(false);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("base");

    act(() => mock.setMatches(true));

    expect(result.current).toBe("md");
  });

  // §6 error states: SSR/no-matchMedia safety, mirroring useChartColors.
  // ts's usePrefersDarkColorScheme identical guard.
  it('defaults to "base" and does not throw when window.matchMedia is unavailable', () => {
    // @ts-expect-error - deliberately simulating an environment without matchMedia at all.
    delete window.matchMedia;

    expect(() => renderHook(() => useBreakpoint())).not.toThrow();
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("base");
  });
});
