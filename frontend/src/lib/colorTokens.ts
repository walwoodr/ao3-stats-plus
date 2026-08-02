// Recharts renders to SVG with explicit fill/stroke color props, not CSS
// custom properties resolved at paint time - so the chart's own line/marker
// colors can't just reference `var(--color-ink)` the way the surrounding
// Tailwind-styled chrome does. This module is the "tiny shared token
// module" MASTER.md's Chart Guidance section calls for: the same hex values
// as index.css's `@theme`/dark-mode blocks, kept here so chart code can
// resolve a real value in JS/TS. The two are necessarily a duplicated
// source of truth (CSS custom properties can't be read into SVG props
// without a getComputedStyle round-trip per render) - re-verify both stay
// in sync if design-system/ao3-stats-plus/MASTER.md's palette ever changes.
// `series` (the six-slot multi-series categorical palette, decision A of
// docs/plans/per-work-comparison-graph.md) is the one exception to the
// "duplicated with index.css" rule above: unlike the other tokens, it is
// never consumed as a static Tailwind utility class (bg-accent, text-ink,
// etc.) - each slot is only ever read dynamically (by index) straight into
// Recharts stroke/fill/marker props and legend glyph inline styles, so
// there is no corresponding `--color-series-*` custom property to keep in
// sync in index.css. It is still mirrored into MASTER.md for documentation
// parity, per that section's task.
export interface ColorTokens {
  paper: string;
  card: string;
  ink: string;
  inkSoft: string;
  accent: string;
  growth: string;
  destructive: string;
  series: readonly string[];
}

export const LIGHT_COLOR_TOKENS: ColorTokens = {
  paper: "#FAF7F8",
  card: "#FFFFFF",
  ink: "#2B2230",
  inkSoft: "#7A6B72",
  accent: "#9F1239",
  growth: "#4D7C5F",
  destructive: "#DC2626",
  series: ["#9F1239", "#0F766E", "#B45309", "#4338CA", "#4D7C5F", "#7E22CE"],
};

export const DARK_COLOR_TOKENS: ColorTokens = {
  paper: "#201A1E",
  card: "#2B232A",
  ink: "#F5EEF1",
  inkSoft: "#B7A8AF",
  accent: "#E8879E",
  growth: "#8FBFA0",
  destructive: "#F87171",
  series: ["#E8879E", "#5EEAD4", "#FBBF24", "#A5B4FC", "#8FBFA0", "#D8B4FE"],
};
