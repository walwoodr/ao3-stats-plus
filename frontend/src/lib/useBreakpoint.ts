import { useSyncExternalStore } from "react";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4.1, §8 T7): mirrors useChartColors.ts's exact useSyncExternalStore +
// matchMedia subscribe/getSnapshot pattern, reused here so the per-
// breakpoint dot-thinning density (chartDotDensity.ts) stays reactive to a
// live viewport resize across the md boundary, not just a mount-time read.
const MD_QUERY = "(min-width: 768px)";

export type Breakpoint = "base" | "md";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mediaQueryList = window.matchMedia(MD_QUERY);
  mediaQueryList.addEventListener("change", callback);
  return () => mediaQueryList.removeEventListener("change", callback);
}

function getSnapshot(): Breakpoint {
  if (typeof window === "undefined" || !window.matchMedia) return "base";
  return window.matchMedia(MD_QUERY).matches ? "md" : "base";
}

// Resolves the active breakpoint tier reactively - "md" at the project's
// existing >=768px tablet breakpoint, "base" below it (or when
// matchMedia/window is unavailable at all, e.g. SSR - never throws,
// mirroring usePrefersDarkColorScheme's identical guard).
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot);
}
