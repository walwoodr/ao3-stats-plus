# Design System Master File — ao3-stats-plus

> **LOGIC:** When building a specific page, first check `design-system/ao3-stats-plus/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. If not, follow the rules below.
>
> **Status:** finalized. Three directions were generated via `ui-ux-pro-max` + `frontend-design`
> and presented for review as a comparison artifact; the user chose a synthesis rather than any
> single direction outright — see "How this was chosen" at the bottom for the full record.

**Project:** ao3-stats-plus
**Generated:** 2026-07-30 · **Finalized:** 2026-07-30
**Category:** Personal creative-analytics tool (not enterprise SaaS, not a marketing site)

---

## The brief, pinned down

**Subject:** A longitudinal stats companion for [Archive of Our Own](https://archiveofourown.org/)
(AO3) fanfiction authors — install a bookmarklet, capture a snapshot of your own hits/kudos/
comments/bookmarks whenever you like, watch your own creative history accumulate over time.

**Audience:** Fanfiction authors. Fandom-culture-native, often emotionally invested in their
work's reception, and — because AO3 itself is a proudly nonprofit, ad-free, deliberately
utilitarian archive — allergic to anything that reads as corporate SaaS.

**The page's single job:** make an author's own numbers feel like something worth returning to.
Not a KPI wall. Not a funnel to convert anyone into anything — there is no CTA, no pricing, no
"upgrade."

**Mode:** system-following light/dark (`prefers-color-scheme`), not a manual toggle. Both modes
are first-class — see rationale below.

---

## Global Rules

### Color Palette

Light mode is "Marginalia" (Direction C) as designed: a deepened homage to AO3's own brand red.
Dark mode is a genuine extension of that same palette family — not an inversion, and not a
straight import of Direction B's own accent — built using B's warm-not-cold-black *philosophy*
(charcoal, never blue-black) while keeping every hue in Direction C's family, per the user's
explicit "preference to C where questions arise." Concretely: the dark background is a darker,
richer version of C's own ink color rather than B's amber-brown charcoal, and the accent is a
lightened tint of C's wine rather than B's amber — dark mode reads as *this same product at
night*, not a different product.

| Role | CSS Variable | Light | Dark | Usage |
|------|--------------|-------|------|-------|
| Paper (background) | `--color-paper` | `#FAF7F8` | `#201A1E` | Page background. Light: paper with the faintest blush cast. Dark: the same hue family, darkened into a warm plum-charcoal — never blue-black. |
| Card (surface) | `--color-card` | `#FFFFFF` | `#2B232A` | Chart backgrounds, form cards — one step lighter than paper in dark mode for elevation, no drop shadow needed. |
| Ink (primary text/UI) | `--color-ink` | `#2B2230` | `#F5EEF1` | Headings, primary buttons, primary chart line. Light mode's ink *is* dark mode's background family, inverted — the two modes share one hue identity. |
| Ink Soft (secondary) | `--color-ink-soft` | `#7A6B72` | `#B7A8AF` | Body copy, secondary labels, borders. Dark value is a lightened/desaturated tint of the light value, not an inversion (WCAG dark-mode guidance: tonal variants, not inverted colors). |
| Accent (wine) | `--color-accent` | `#9F1239` | `#E8879E` | Sparingly: the signature lead-in marker, focus rings, one CTA per screen at most. Dark value is a brightened rose tint of the same wine family — the base wine hex is too dark to read reliably on a dark background. |
| Growth (positive data) | `--color-growth` | `#4D7C5F` | `#8FBFA0` | Reserved for explicit "this is climbing" indicators — never the default line color. Dark value lightened for the same contrast reason as accent. |
| Destructive | `--color-destructive` | `#DC2626` | `#F87171` | Errors, token-mismatch banners. |

```css
:root {
  --color-paper: #FAF7F8;
  --color-card: #FFFFFF;
  --color-ink: #2B2230;
  --color-ink-soft: #7A6B72;
  --color-accent: #9F1239;
  --color-growth: #4D7C5F;
  --color-destructive: #DC2626;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-paper: #201A1E;
    --color-card: #2B232A;
    --color-ink: #F5EEF1;
    --color-ink-soft: #B7A8AF;
    --color-accent: #E8879E;
    --color-growth: #8FBFA0;
    --color-destructive: #F87171;
  }
}
```

```js
// tailwind.config equivalent — Tailwind's `media` dark-mode strategy (system-following, no
// toggle) is the correct choice here, not the `class` strategy: darkMode: 'media'
```

**Contrast — verified** (WCAG relative-luminance formula, computed directly, not estimated by
inspection):

| Pair | Light | Dark |
|------|-------|------|
| ink / paper | 14.35:1 | 14.97:1 |
| ink / card | 15.28:1 | 13.35:1 |
| ink-soft / paper | 4.73:1 ⚠ thin margin | 7.52:1 |
| accent / paper | 7.53:1 | 6.83:1 |
| growth / paper | 4.52:1 ⚠ thin margin | 8.25:1 |
| destructive / paper | 4.54:1 ⚠ thin margin | 6.18:1 |

All twelve pairs clear WCAG AA (4.5:1) for normal text — this system's actual bar (see
Pre-Delivery Checklist). Three light-mode pairs (ink-soft, growth, destructive on paper) pass
by less than 0.3, which is enough margin for hex values exactly as specified but leaves very
little room for drift if these colors get adjusted later — re-verify if any of the three change.
No hex value needed to change to hit the bar as originally chosen.

**Series palette (multi-series chart color, JS-only — no CSS variable):** unlike the tokens
above, the 10-slot categorical `series` palette (slate-blue/teal/sage/pine/olive/clay/dusty
rose/mauve/muted violet/indigo-slate — raised from an original 6-swatch palette by
`docs/plans/usds-dataviz-color-scheme.md`) added for the per-work comparison charts is never
consumed as a static Tailwind utility class, so it has no `--color-series-*` custom property in
index.css — it lives only in `frontend/src/lib/colorTokens.ts`'s `ColorTokens.series` array,
read by index straight into Recharts props. **Corrected same-day (2026-08-06)**: the originally
shipped USDS-modeled palette (wine/orange/amber/green/teal/azure/indigo/magenta/slate/brown) was
replaced with a user-selected "Muted Archive" (light) + "Halfway" (dark) palette after a live
visual comparison of several verified candidates — see "The 10-slot shape+color scheme" below
for the full slot table, contrast verification, and CVD verification, and this plan's 2026-08-06
addendum for the full record of the re-review.

### Typography

Three-tier system, identical in both modes — only color tokens change between light and dark,
never type choices:

- **Display / heading:** [Outfit](https://fonts.google.com/specimen/Outfit) — geometric,
  modern, confident without being cold. Used at heading sizes only, restrained (per-page: one
  `h1`, a handful of `h2`/`h3`s at most).
- **Body / UI:** [Work Sans](https://fonts.google.com/specimen/Work+Sans) — warm humanist sans,
  pairs with Outfit without competing with it.
- **Data / figures:** [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) —
  tabular figures for chart axis labels, hit/kudos counts, and timestamps, so numbers don't
  jitter or misalign column-to-column.

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Work+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```

```js
// tailwind.config equivalent
fontFamily: {
  display: ['Outfit', 'sans-serif'],
  sans: ['"Work Sans"', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'monospace'],
}
```

Type scale (matches Tailwind's default scale, no custom values needed):
`text-sm` (14px) captions/labels → `text-base` (16px) body → `text-lg`/`text-xl` chart titles
→ `text-2xl` page `h1` → `text-3xl`+ reserved, unused today.

### Spacing

Standard 4px/8px rhythm — Tailwind's default scale (`gap-2`, `gap-4`, `gap-6`, `gap-8`, `p-8`
for page padding). This is a personal dashboard viewed occasionally, not an ops console glanced
at all day — standard spacing, not dashboard-dense.

### Shadows / elevation

Kept deliberately flat in both modes. Cards use a 1px `--color-ink-soft` border at low opacity
rather than a drop shadow — this also sidesteps the classic "shadows look wrong in dark mode"
problem entirely, since there are none to get wrong:

```css
--surface-border: 1px solid color-mix(in srgb, var(--color-ink) 12%, transparent);
--surface-border-hover: 1px solid color-mix(in srgb, var(--color-ink) 24%, transparent);
```

---

## Component Specs

### Buttons

```css
.btn-primary {
  background: var(--color-ink);
  color: var(--color-paper);
  padding: 10px 20px;
  border-radius: 6px;
  font-family: var(--font-sans);
  font-weight: 600;
  transition: background-color 200ms ease;
  cursor: pointer;
}
.btn-primary:hover { background: var(--color-ink-soft); }
.btn-primary:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }

.btn-secondary {
  background: transparent;
  color: var(--color-ink);
  border: 1px solid var(--color-ink-soft);
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 600;
  transition: border-color 200ms ease;
  cursor: pointer;
}
```

No `translateY`/scale-on-hover — motion here is restrained to color/border, not layout-adjacent
transforms, in both modes.

### Cards / chart containers

```css
.card {
  background: var(--color-card);
  border: var(--surface-border);
  border-radius: 8px;
  padding: 24px;
  transition: border-color 200ms ease;
}
.card:hover { border: var(--surface-border-hover); }
```

### Inputs (token entry, per-work select)

```css
.input {
  background: var(--color-card);
  border: 1px solid color-mix(in srgb, var(--color-ink) 20%, transparent);
  border-radius: 6px;
  padding: 10px 14px;
  font-family: var(--font-sans);
  font-size: 16px; /* never smaller — avoids iOS auto-zoom */
  transition: border-color 200ms ease;
}
.input:focus {
  border-color: var(--color-accent);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
}
```

### The signature element: the lead-in marker

The synthetic "earliest post year" baseline point (added to the trend/ratio charts) is this
product's one deliberate visual risk: a small solid dot in `--color-accent` — a quiet echo of
AO3's own kudos mark, at the one point on the chart that represents "before anyone had read
this yet." Identical treatment in both modes, no dark-mode-only embellishment — a soft glow
was proposed for dark mode (carried over from Direction B's "lamplight" vibe) and explicitly
rejected; the marker stays plain in both modes.

```css
.chart-leadin-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-accent);
}
.chart-leadin-connector {
  stroke: var(--color-ink-soft);
  stroke-dasharray: 4 4;
  stroke-width: 1.5px;
}
```

This is the only place `--color-accent` appears inside a chart. Every other line/marker uses
`--color-ink`. One accent, spent once, in both modes.

---

## Chart Guidance

(Synthesized from the `ui-ux-pro-max` chart domain and this project's existing, already-good
accessible pattern in `TrendChart`/`RatioChart` — this section describes what to preserve and
extend, not a rewrite.)

- Real series: solid `--color-ink` line. Synthetic lead-in segment: dashed `--color-ink-soft`
  — series are differentiated by **line style**, never color alone, which the codebase's
  existing per-point `aria-label` markers and sr-only data table already satisfy in both modes.
- Never rely on `--color-growth` alone to mean "trending up" — pair it with the actual number
  visible in the accessible table.
- Category axis (not real-time-linear) stays the existing, correct default per this project's
  Recharts setup — do not introduce a real date-scale axis "to look more like a real chart."
- Recharts renders to SVG with explicit fill/stroke colors, not CSS custom properties resolved
  at paint time by default — when implementing, either re-render chart color props on a
  `prefers-color-scheme` media query listener, or resolve the CSS custom property value in JS
  (`getComputedStyle`) before passing it to Recharts' `stroke`/`fill` props, so the chart itself
  (not just surrounding chrome) actually flips with the system theme. Flag this explicitly since
  it's the one place "just use CSS variables" doesn't fully work for free.

---

## Multi-Series Comparison Charts (per-work comparison)

Added for the per-work comparison graph feature (`docs/plans/per-work-comparison-graph.md`) —
this project's first *multi*-series chart context. MASTER.md previously had no multi-select,
range-slider, or categorical-palette spec; this section extends the single-series Chart
Guidance above (which stays correct and unchanged for the aggregate TrendChart/RatioChart
section) rather than replacing it. Revised by `docs/plans/usds-dataviz-color-scheme.md`: the
cap rose 6 → 10, all style slots were redesigned from scratch (USDS-inspired, project-tuned),
per-series dash was dropped in favor of shape as the sole non-color channel, and a formal CVD
(colorblind) verification step was added. **Corrected (2026-08-04)**: the initially shipped
shape set included plus, star, and cross markers; the user rejected these as not "basic
geometric shapes" and requested hollow/outline variants of the existing diamond, triangle, and
triangle-down shapes instead — see the "10-slot shape+color scheme" table below, which reflects
the corrected set. Colors were never shape-dependent by that correction and were unaffected by
it. **Corrected again (2026-08-06)**: after shipping, the user asked for a Review-cycle
re-examination of the *color* choice specifically (unlike the shape correction above, this one
touches color only, not shape) — several verified candidate palettes were presented via a live
visual comparison artifact, and the user selected "Muted Archive" for light mode paired with a
computed "Halfway" saturation point for dark mode. The table below reflects this final palette;
shapes are untouched by this correction.

### The 10-slot shape+color scheme

Each work selected for comparison gets a stable pair of (marker shape, categorical color) —
**shape alone is now the accessibility-guaranteed, non-color channel** (a colorblind or
grayscale user still gets a unique marker shape per work); color is a **redundant reinforcement
channel only**, never the sole differentiator — this extends, rather than contradicts, the
existing "differentiated by line style, never color alone" rule above. Ten is the cap: the
count of unambiguously distinct marker shapes at chart scale, empirically validated (see "Shape
distinguishability" below).

**Dash is reserved for the lead-in only.** At 10 slots, 10 mutually distinguishable
`stroke-dasharray` patterns do not exist, so per-series lines are now solid; the
already-shipped per-work zero-basis lead-in (`docs/plans/per-work-zero-basis-dates.md`) keeps
its own hardcoded dashed `--color-ink-soft` segment, unaffected — dash now means exactly one
thing on the chart ("pre-data lead-in"), never a per-series identifier.

| slot | marker shape | color role | light hex | dark hex |
|---|---|---|---|---|
| 0 | circle (filled) | slate-blue | `#727F8C` | `#B2CCE6` |
| 1 | square (filled) | teal | `#4F7074` | `#ABE1E7` |
| 2 | triangle-up (filled) | sage | `#74918D` | `#8BC7BF` |
| 3 | diamond (filled) | pine | `#4D5D52` | `#6FAE86` |
| 4 | diamond (hollow/outline) | olive | `#6C6D58` | `#D5D8A0` |
| 5 | triangle-up (hollow/outline) | clay | `#8C6441` | `#E2A46D` |
| 6 | triangle-down (filled) | dusty rose | `#A77A75` | `#F7CEC9` |
| 7 | triangle-down (hollow/outline) | mauve | `#964F6B` | `#FAB2CC` |
| 8 | circle (hollow/outline) | muted violet | `#8F619C` | `#C98ED9` |
| 9 | square (hollow/outline) | indigo-slate | `#4B5882` | `#AEB7E1` |

Five base geometric shapes — circle, square, triangle-up, diamond, triangle-down — each in a
filled and a hollow/outline variant (10 = 5 × 2). No plus, star, or cross: the initial USDS-
inspired proposal included those three, but the user's 2026-08-04 review rejected them as not
"basic geometric shapes," so the plan's reserved-swap slots (4, 5, 7) were reassigned to hollow
diamond/triangle-up/triangle-down instead. Hollow markers render `fill="none"` + `stroke=color`,
which also lets crossing lines show through in dense charts. **Colors were replaced again on
2026-08-06** (shape untouched by this round) — see the "Corrected again" note above; each slot's
color role and hex changed, but which slot gets a filled vs. hollow variant of which shape did
not.

**Contrast — verified** (WCAG relative-luminance formula, against `--color-card`: light
`#FFFFFF`, dark `#2B232A`; recomputed directly from the shipped hex values via the same formula
`colorTokens.cvd.test.ts` runs as an automated gate, not estimated by inspection). As a
*graphical object* (a chart line/marker, not body text), the bar is WCAG 2.1 SC 1.4.11 (non-text
contrast, ≥3:1), not the 4.5:1 body-text bar:

| slot | light hex | CR vs light card | dark hex | CR vs dark card |
|---|---|---|---|---|
| 0 slate-blue | `#727F8C` | 4.09:1 | `#B2CCE6` | 9.21:1 |
| 1 teal | `#4F7074` | 5.38:1 | `#ABE1E7` | 10.65:1 |
| 2 sage | `#74918D` | 3.40:1 | `#8BC7BF` | 8.01:1 |
| 3 pine | `#4D5D52` | 6.99:1 | `#6FAE86` | 5.87:1 |
| 4 olive | `#6C6D58` | 5.30:1 | `#D5D8A0` | 10.29:1 |
| 5 clay | `#8C6441` | 5.23:1 | `#E2A46D` | 7.09:1 |
| 6 dusty rose | `#A77A75` | 3.69:1 | `#F7CEC9` | 10.63:1 |
| 7 mauve | `#964F6B` | 5.79:1 | `#FAB2CC` | 8.94:1 |
| 8 muted violet | `#8F619C` | 4.82:1 | `#C98ED9` | 6.07:1 |
| 9 indigo-slate | `#4B5882` | 6.96:1 | `#AEB7E1` | 7.74:1 |

All twenty clear 3:1 (lowest 3.40:1 light/slot 2 "sage", 5.87:1 dark/slot 3 "pine") — tighter
than the previous palette's margins but still a clean pass; this is the direct cost of choosing
a deliberately muted, lower-chroma palette, and was a known, disclosed tradeoff at selection
time, not an oversight. Style
assignment is **stable**: a `workId → styleIndex` map assigns the lowest free index on add and
releases it on remove (`frontend/src/lib/seriesStyles.ts`), so a work keeps its full (shape,
color) identity while other works are toggled in/out of the comparison. The palette lives in
`colorTokens.ts`'s `series` field — unlike every other token above, it has **no**
`--color-series-*` CSS custom property in index.css, since it's only ever consumed dynamically
(by index) into Recharts props/legend glyphs, never as a static Tailwind utility class. A
visible legend maps each work's title to its glyph and spells out the style in words ("slate-blue
circle marker", "muted violet hollow-circle marker") so the mapping survives into the accessible
data table and for screen-reader users.

### Sparse series & the Bookmarks By-Work fixed type→style mapping

Added for `docs/plans/additional-metric-trend-charts.md` (comments/bookmarks/subscriptions trend
charts). Two notes, extending rather than replacing the sections above:

- **Sparse interior gaps (§4.1).** Enrichment-derived sparse series (public/private bookmarks)
  render interior nulls as gaps / lone markers, same `connectNulls={false}` rule as every other
  series on this chart family — a gap means "not captured," never zero. No new chart mechanism:
  `WorkComparisonSection`'s generalized `buildSeries` drops null-valued points before handing a
  sparse series to `MultiSeriesTrendChart`, which already renders the resulting date gaps
  correctly (this project's existing "never fabricate a zero" path, unchanged).
- **The Bookmarks By-Work fixed type→style mapping (§3.4).** The By-Work sub-view's charts are
  the one place the 10-slot table above is used for something OTHER than per-work identity: each
  By-Work chart holds exactly one work's data, so slots 0–2 are repurposed, FIXED, to distinguish
  the three bookmark TYPES instead — Total always slot 0 (circle, slate-blue), Public always slot
  1 (square, teal), Private always slot 2 (triangle-up, sage), the same three slots/order in
  every selected work's chart. Learnable once, consistent everywhere it appears; a work's own
  cross-chart identity slot (used on every OTHER metric tab) is irrelevant inside its own By-Work
  chart, since there's no other work's data in the same chart to distinguish it from.

### CVD (colorblind) verification

Formal requirement added by `docs/plans/usds-dataviz-color-scheme.md`, two complementary parts:

1. **Automated gate** (`frontend/src/lib/colorTokens.cvd.test.ts`) — hardcodes the standard
   Machado-2009 protanopia/deuteranopia/tritanopia simulation matrices plus an sRGB → CIE Lab
   conversion (no new dependency) and asserts, for the 10 series colors in each mode: every
   color clears 3:1 vs its card [hard gate], and for each CVD type, the minimum pairwise CIE76
   ΔE across all 10 colors stays ≥ 3.0 (the just-noticeable-difference floor). Re-runs on any
   palette edit.
2. **Manual sign-off pass** — a documented pass in Chrome DevTools Rendering → "Emulate vision
   deficiencies" (protanopia, deuteranopia, tritanopia, **achromatopsia/grayscale**) on the
   10-work `MultiSeriesTrendChart` Storybook story, both light and dark. **Achromatopsia is the
   decisive case**: with zero color, all 10 series must remain individually traceable by
   **shape alone** — this is the real accessibility floor; color-channel imperfections are
   acceptable precisely because shape never depends on them.

Measured worst-case minimum pairwise ΔE (headroom over the 3.0 floor), recomputed for the
2026-08-06 Muted Archive/Halfway palette using the same script as the automated gate:

| mode | protanopia | deuteranopia | tritanopia | floor |
|---|---|---|---|---|
| light | 7.9 | 7.9 | 7.9 | **7.9** |
| dark | 8.0 | 8.0 | 8.4 | **8.0** |

Both floors rose substantially versus the previous (wine/orange/amber/...) palette's 3.7–3.8 —
a deliberately muted, lower-chroma palette still separates cleanly under every simulated CVD
type once the hues themselves are spread further apart in Lab space; the two properties (low
chroma, high CVD separation) aren't in tension the way they might intuitively seem. Because
shape guarantees identity, color separation is a reinforcement target, not the accessibility
floor — the ΔE ≥ 3 bar ensures color rarely actively misleads, and shape covers the rest.

### Shape distinguishability

The 10 marker shapes (circle, square, triangle-up, diamond, triangle-down — each filled and
hollow/outline) must be individually distinguishable at both chart scale (~8px, `size:4`) and
legend scale (~10px, `size:5`), in both modes, and under grayscale/achromatopsia — validated
empirically (not assumed), per the manual sign-off pass above. Re-validated after the same-day
(2026-08-04) shape-set correction (plus/star/cross → hollow diamond/triangle-up/triangle-down);
see `docs/maintenance/usds-shape-set-correction-distinguishability-pass.md` for that pass. If
any pair collides, hexagon and wye (Y) are held in reserve as swaps.

### Multi-select combobox picker (chips + fandom-header synthetic option)

**Superseded 2026-08-04** (`docs/plans/work-comparison-picker-redesign.md`), **refined
2026-08-05** (`docs/plans/work-comparison-picker-refinements.md`) — an MUI `Autocomplete`
(`multiple`) combobox, chosen because `Select` (even with `multiple` + `renderValue` chips) has
no type-to-filter, while `Autocomplete` natively delivers chips-in-the-field, type-to-filter, AND
grouped/sectioned options together (WAI-ARIA combobox pattern, keyboard-operable out of the box).

- **Static label, not a floating MUI label:** a plain `<span id="work-picker-label">Works to
  compare</span>` sits above the field (matching the Slider's own `<span>Date range</span>`
  pattern below) instead of `TextField`'s animated floating `label`. A placeholder is NOT an
  accessible name, so the combobox's name is re-established via `aria-labelledby` pointing at
  that span's id (merged into MUI's `slotProps.htmlInput`, not overwritten) — verified with an
  axe scan plus a named-combobox assertion, the single highest a11y risk in this pattern.
  `placeholder="Search title or fandom"` stays as a plain HTML hint.
- **Grouping:** options are flattened to one `{id, title, fandom}` row per (work × fandom)
  appearance (`groupBy`), since a multi-fandom work must appear under each of its fandoms but
  MUI's `groupBy` can only place one option object in one group. `isOptionEqualToValue` matches
  by `id`, so toggling any appearance toggles the one underlying work, and it renders exactly one
  chip regardless of how many fandom groups it appears under.
- **Fandom-header bulk-select — a genuine synthetic `role="option"`, not a button bar:** each
  fandom group's `options` array gets one synthetic `{ kind: "header", fandom, workIds }`
  sentinel ahead of that fandom's work options, so it's a real MUI-tracked option — stamped by
  `getOptionProps` with `data-option-index`/`tabIndex=-1` the same as any work row. Verified
  against the installed `useAutocomplete.js`: only tracked options get arrow-key roving highlight
  and Enter/click, so this delivers full keyboard parity for free, and `role="option"` is a legal
  `listbox` child (satisfying axe's `aria-required-children`, unlike an in-listbox `<button>`,
  which is never a legal owned role there). Rendered bold, body-sized (`text-sm font-semibold`,
  no uppercase/status text), with a tri-state icon (box/dash/check, shape not color) plus an
  `aria-label` carrying status + action for screen readers (e.g. "Fandom One — some works
  selected, activate to select all remaining") since the header has no visible status text and is
  never itself in `value` (so `aria-selected` on it is always `false`, not a status signal).
  Semantics: a fully-selected fandom deselects all of it; none/partial fills it to 100%
  (additive, cap-respecting, truncation announced) — acting on the fandom's full work set, not
  the filter-visible subset. Never `aria-disabled`, even at the 10-work cap (a full fandom must
  stay deselectable). The group wrapper carries the divider (`border-t border-ink/10
  first:border-t-0`) ABOVE each header, not below.
- **Type-to-filter:** matches title AND fandom name via a custom `filterOptions` that runs the
  existing `createFilterOptions({ stringify: o => \`${o.title} ${o.fandom}\` })` matcher over
  work options only, then re-emits each surviving fandom's header sentinel ahead of its matches
  (auto-hiding a header whose fandom has zero visible works) — filtering by fandom keeps that
  whole group visible rather than confusingly emptying the list.
- **Selected/hover states:** a selected work row is NOT bolded — an ink-colored check glyph plus
  an `bg-accent/8` row background tint (background use of accent is explicitly permitted; the two
  state-signifier icons, `CheckIcon`/`TriStateIcon`, are `--color-ink`, not accent — see the
  contrast note below). Unselected rows get a neutral `hover:bg-ink/5` (also applied to MUI's own
  keyboard-highlight class, `[&.Mui-focused]:bg-ink/5`, so mouse hover and arrow-key highlight
  look identical); a SELECTED row uses a deeper `hover:bg-accent/12` instead, so the transient
  hover state doesn't visually clobber the persistent selected tint.
- **Cap handling:** `getOptionDisabled` disables (`aria-disabled`) unselected WORK options once at
  the 10-work cap; selected options/chips stay removable. Cap/truncation messages go to a single
  `role="status"` polite live region shared with any other dynamic announcement for the same
  section (e.g. a "Comparing N works, START to END" summary), rather than one live region per
  sub-component, so assistive tech doesn't have to track multiple simultaneous regions for one
  logical update.
- **"Clear all":** `clearText="Clear all"` applies to both the clear button's `aria-label` and
  `title` (MUI default is `"Clear"`). The clear indicator is forced `visibility: visible` (MUI's
  default hover/focus-only reveal is a discoverability regression for a stable, always-findable
  affordance whenever there's something to clear).
- **Chip accessible delete:** MUI's chip delete icon has no reliable accessible name out of the
  box. `Chip` has no `slotProps.deleteIcon` in the installed v9.2.0 (`ChipOwnerState`/
  `ChipOwnProps` expose no such slot) — the accessible name (`aria-label="Remove {title}"`) is set
  directly as a prop on the element passed to `deleteIcon` instead; MUI clones that element to
  attach its own `onClick`, but preserves other props (verified against the installed `Chip.js`).
  The icon itself is a hand-rolled inline `<svg>` "x" (see Anti-Patterns/Icons below) — a
  hand-rolled icon component must explicitly forward `onClick`/`className` onto its own `<svg>`,
  since (unlike a library icon component) it doesn't do so automatically.
- **Theming:** field/chips/popup/options themed via `useChartColors()` + `sx` (MUI takes no
  Tailwind classes), following the same `hexToRgba` accent-ring-at-15% pattern as the MUI Slider
  below — `.input`-equivalent field styling, `.card`-equivalent popup surface, visible accent
  focus rings throughout. `--color-ink` (not accent) is used for the two state-signifier icons —
  verified ≥3:1 (WCAG 1.4.11) against `--color-card` in both modes, and chosen over `--color-
  growth` to avoid colliding with that token's established chart "positive trend" meaning on a
  neutral checkbox-style control.
- **State:** the selection/range this control drives now lives in a persisted per-username
  Zustand store (`useWorkComparisonStore`, `docs/plans/work-comparison-picker-redesign.md` §2),
  not view-local `useState` — `WorkPicker` itself stays a controlled, store-agnostic component
  (`perWorkSeries`/`selectedWorkIds`/`onChange`/`extraStatusMessage` in, nothing else); the store
  lives one level up, in `WorkComparisonSection`.

### MUI Slider themed to tokens

The date-range filter uses MUI `Slider` in range mode (TECH_STACK.md's carve-out for "complex
components ... where building from scratch isn't worth it" — a dual-thumb range slider with
correct ARIA + keyboard + crossover handling is a textbook fit). MUI components don't take
Tailwind utility classes, so `DateRangeSlider` themes the `sx` prop explicitly rather than
inheriting tokens automatically: track/thumb/active-rail in `--color-accent`, rail at low
opacity in `--color-ink`, a focus ring approximating the `.input` pattern above (MUI needs a
real rgba value, not `color-mix()`, so the accent hex is converted to rgba at 15% alpha rather
than reusing the CSS custom property directly), mono-font (`--font-mono`) value labels/readout.
Colors are resolved via `useChartColors()` (the same seam the charts already use), not read
from CSS variables directly, since MUI's emotion cache doesn't reliably re-resolve custom
properties. Per-thumb `getAriaLabel`/`getAriaValueText` props supply "Range start/end (year)"
names and plain-year spoken values; `disableSwap` gives thumb-crossover clamping instead of the
default swap-on-cross behavior, which would otherwise make a thumb's aria label misleadingly
jump between roles mid-drag.

**Always rendered, disabled below threshold (refined 2026-08-05,**
`docs/plans/work-comparison-picker-refinements.md` **§3.2):** the component no longer unmounts
(returns `null`) below the >2 union-capture-dates threshold — it stays mounted and hands
`disabled = unionPointCount <= 2` straight to MUI Slider's own `disabled` prop, so the control's
presence and the "Date range" heading are always visible, giving the picker column's sibling in
the two-column grid a stable width regardless of selection state. No dedicated "disabled input"
token exists yet, so the disabled treatment reuses `--color-ink` at low opacity for track/thumb
(NOT accent — a disabled control must not read as active) and dims the heading/readout text to
`--color-ink-soft`, aligning with the project's existing `aria-disabled:opacity-40` convention on
capped picker rows. The drag-fix `onChange`/`onChangeCommitted` split (live-drag feedback
decoupled from the expensive store-write callback) is unaffected — a disabled MUI Slider simply
never fires either callback.

---

## Anti-Patterns (do NOT use)

- ❌ Emojis as icons — SVG only. **Corrected 2026-08-04**: no icon library (Heroicons,
  `@mui/icons-material`, or otherwise) is installed or approved in this project
  (`TECH_STACK.md`) — hand-roll small inline `<svg>` primitives instead (see
  `frontend/src/lib/markerShapes.tsx` and the chip-delete icon in the combobox picker section
  above), rather than adding a dependency for a single icon.
- ❌ Any drop shadow on cards — this system is flat/bordered, not elevated, in either mode
- ❌ `translateY`/scale hover transforms on cards or buttons — color/border transitions only
- ❌ A hero stat card as the dashboard's opening element — the chart itself is the thesis, not
  a big-number-plus-gradient tile
- ❌ Numbered step markers (01 / 02 / 03) anywhere — nothing on this dashboard is a sequence
- ❌ Low-contrast text — 4.5:1 minimum in both modes (see the unresolved verification note above)
- ❌ Naive color inversion for dark mode — every dark-mode value above is a chosen tonal
  variant, not `paper`/`ink` swapped 1:1 with pure inversion
- ❌ Invisible focus states — every interactive element gets a visible `--color-accent` focus
  ring, no exceptions, in both modes
- ❌ `prefers-reduced-motion` violations — the only motion in this system is 150–300ms
  color/border transitions, which already respect reduced-motion by not being transform-based

---

## Pre-Delivery Checklist

- [ ] No emojis used as icons
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states are color/border transitions only (150–300ms), never layout-shifting
- [x] Text contrast ≥4.5:1 verified by computing actual WCAG ratios for all twelve pairs — see
      Color Palette table. All pass; three light-mode pairs pass with a thin margin (<0.3) —
      re-verify if `ink-soft`, `growth`, or `destructive` change.
- [ ] Focus states use the `--color-accent` ring, visible on every interactive element, in
      both modes
- [ ] `prefers-reduced-motion` respected (should be automatic — see anti-patterns)
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] Chart series differentiated by line style, not color alone (existing project pattern)
- [ ] Every chart still has its accessible data-table alternative (existing project pattern —
      do not regress this when applying new visual tokens)
- [ ] Dark mode tested independently, not assumed from light-mode values (Recharts color note
      above — confirm the chart itself actually re-themes, not just surrounding chrome)

---

## How this was chosen

Three full directions (Reading Room Ledger, After Hours, Marginalia) were generated via
`ui-ux-pro-max --design-system` searches, each critiqued against `frontend-design`'s named
generic-AI-design defaults, and presented together as a visual comparison artifact — same
chart, same real copy, same data, only the skin different — so the choice could be made by
looking at real specimens rather than reading hex codes in a table.

**The user's decision:** a synthesis, not a pick — "Marginalia" (Direction C)'s color identity
for light mode, "After Hours" (Direction B)'s *warm background vibe* for dark mode, with
explicit instruction to prefer C wherever the combination left something ambiguous.

**How the ambiguous parts were resolved, preferring C:**

| Question | Resolution | Why |
|---|---|---|
| What hue family should the dark background actually be — B's amber-brown charcoal, or something else? | Darkened C's own ink color (`#2B2230`) into a background, not B's `#1C1815` | The user asked for B's *vibe* (warm, not cold-blue-black) — not B's literal hex value. C's own ink was already a warm, dark, plum-neutral color once you look at it as a background candidate rather than text; using it keeps the whole system in one hue family. |
| What should the dark-mode accent be — B's amber, or a dark-adapted wine? | A lightened tint of C's wine, not B's amber | Direction B's amber accent wasn't asked for — only its background vibe was. Preference-to-C means the accent identity (wine, echoing AO3's own red) carries into dark mode too, just retuned for contrast. |
| What typography should dark mode use — B's Lora, or C's Outfit/Work Sans? | C's Outfit/Work Sans, unchanged, in both modes | Typography from B was never part of the ask (only "color theme from C" and background "vibe" from B) — no reason to introduce a second type system. |
| Should the dark-mode marker get B's glow effect? | Proposed, then explicitly rejected by the user | This was flagged as a judgment call beyond what was asked rather than silently included — correctly so, since the answer was no. The marker is identical in both modes. |

**Not carried forward from the rejected directions:** Reading Room Ledger's stamp-square
marker and Source Serif 4 display face; After Hours's Lora serif, amber accent hue, and warm
taupe/copper secondary colors — all superseded by the synthesis above.
