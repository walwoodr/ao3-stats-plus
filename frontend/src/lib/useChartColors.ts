import { useSyncExternalStore } from "react";
import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS, type ColorTokens } from "./colorTokens";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mediaQueryList = window.matchMedia(DARK_QUERY);
  mediaQueryList.addEventListener("change", callback);
  return () => mediaQueryList.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

// Tracks the system color-scheme preference reactively, not just at mount -
// per MASTER.md's Chart Guidance, Recharts needs a real hex value (not a
// CSS custom property) passed to its stroke/fill props, so this is the seam
// that keeps chart colors following `prefers-color-scheme` after the
// initial render, the same way the surrounding Tailwind-styled chrome does
// automatically via CSS.
export function usePrefersDarkColorScheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Resolves the current color-scheme's token set for passing directly to
// Recharts' stroke/fill props (see colorTokens.ts for why this can't just
// be CSS variables).
export function useChartColors(): ColorTokens {
  const isDark = usePrefersDarkColorScheme();
  return isDark ? DARK_COLOR_TOKENS : LIGHT_COLOR_TOKENS;
}
