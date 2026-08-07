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
// `series` (the ten-slot multi-series categorical palette, USDS-modeled per
// docs/plans/usds-dataviz-color-scheme.md, superseding the original 6-slot
// palette from docs/plans/per-work-comparison-graph.md's decision A) is the
// one exception to the "duplicated with index.css" rule above: unlike the
// other tokens, it is never consumed as a static Tailwind utility class
// (bg-accent, text-ink, etc.) - each slot is only ever read dynamically (by
// index) straight into Recharts stroke/fill/marker props and legend glyph
// inline styles, so there is no corresponding `--color-series-*` custom
// property to keep in sync in index.css. It is still mirrored into
// MASTER.md for documentation parity, per that section's task. Every hex
// below is pinned exactly to the plan's 2026-08-06 same-day addendum
// (superseding that plan's original section-3 table) - the user reviewed a
// live visual comparison of several verified candidate palettes and picked
// "Muted Archive" for light mode, paired with a computed-and-verified
// "Halfway" saturation point for dark mode; each value was independently
// WCAG-contrast- and CVD-ΔE-verified there; do not substitute alternate
// hexes here.
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
  // slate-blue, teal, sage, pine, olive, clay, dusty rose, mauve, muted
  // violet, indigo-slate (slot order 0-9, "Muted Archive").
  series: [
    "#727F8C",
    "#4F7074",
    "#74918D",
    "#4D5D52",
    "#6C6D58",
    "#8C6441",
    "#A77A75",
    "#964F6B",
    "#8F619C",
    "#4B5882",
  ],
};

export const DARK_COLOR_TOKENS: ColorTokens = {
  paper: "#201A1E",
  card: "#2B232A",
  ink: "#F5EEF1",
  inkSoft: "#B7A8AF",
  accent: "#E8879E",
  growth: "#8FBFA0",
  destructive: "#F87171",
  // "Halfway" - a computed-and-verified midpoint saturation between the
  // first dark-mode proposal and a much paler pastel alternative (mean
  // chroma ~27), not an eyeballed tonal lightening. Same hue identity per
  // slot as the light-mode counterpart, same slot order.
  series: [
    "#B2CCE6",
    "#ABE1E7",
    "#8BC7BF",
    "#6FAE86",
    "#D5D8A0",
    "#E2A46D",
    "#F7CEC9",
    "#FAB2CC",
    "#C98ED9",
    "#AEB7E1",
  ],
};
