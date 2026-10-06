import type { Breakpoint } from "./useBreakpoint";

// Chart-table-polish-batch item 7 (docs/plans/chart-table-polish-batch.md
// §4.1/§4 item 7, §8 T7): pure, dependency-free helper (no React import) for
// thinning on-line data-point dots to ~1 per 20px of plot width above 30
// real points - hardcoded per breakpoint, NOT a live pixel measurement, per
// the explicit ask and the retirement of the 2026-09-25 MAX_REAL_AXIS_TICKS
// single-unverified-constant pattern (chartTimeAxis.ts). Mirrors
// selectDisplayedTicks's own edge-keeping/even-sampling algorithm shape.

// Grounding (plan §4 item 7): card is max-w-4xl p-8 -> p-6 card ~780px
// content minus the Y-axis ~= ~700px plot at md; below md, ~375px viewport
// ~= ~280px plot. Approximations - must be sanity-checked in Preview against
// a real production build (same caveat the superseded tech-debt entry
// demanded); easy to tune since these are named constants.
export const PLOT_WIDTH_BY_BREAKPOINT: Record<Breakpoint, number> = {
  base: 280,
  md: 700,
};

const PX_PER_DOT = 20;

export function maxDotsFor(breakpoint: Breakpoint): number {
  return Math.floor(PLOT_WIDTH_BY_BREAKPOINT[breakpoint] / PX_PER_DOT);
}

// Plan §4 item 7 / §6 error states / §8 T7: thinning must not engage at all
// until pointCount > 30, independent of the breakpoint's max-dots density -
// a 20-point series stays fully shown even on `base` (maxDotsFor = 14).
// Named, exported constant per the DAY_TICK_SUPPRESSION_THRESHOLD
// (chartTimeAxis.ts, item 5) precedent: single source of truth, not
// re-implemented ad hoc at each of the three chart call sites.
export const DOT_THINNING_ENGAGEMENT_THRESHOLD = 30;

// "all" is a cheap, explicit short-circuit for the (overwhelmingly common)
// case where no thinning is needed at all - every point gets a dot and
// every caller can skip building/consulting a Set entirely.
export type VisibleDotIndices = "all" | Set<number>;

// Evenly samples `maxDots` indices across [0, pointCount - 1], always
// keeping the first and last index exact (edge-preserving, like
// selectDisplayedTicks) - rounding elsewhere in the sampled sequence is
// fine, but the edges must never drift. §6 error states: degrades to a
// defined, non-throwing result for a degenerate pointCount/maxDots instead
// of a divide-by-zero/NaN index.
export function selectVisibleDotIndices(pointCount: number, maxDots: number): VisibleDotIndices {
  if (pointCount <= 0 || maxDots <= 0) return new Set<number>();
  if (pointCount <= DOT_THINNING_ENGAGEMENT_THRESHOLD) return "all";
  if (pointCount <= maxDots) return "all";

  const lastIndex = pointCount - 1;
  // maxDots === 1 would otherwise divide by zero (i / (maxDots - 1)) -
  // degrades to just the first index rather than a NaN index.
  if (maxDots === 1) return new Set([0]);

  const picked = new Set<number>();
  for (let i = 0; i < maxDots; i += 1) {
    const fraction = i / (maxDots - 1);
    picked.add(Math.round(fraction * lastIndex));
  }
  return picked;
}
