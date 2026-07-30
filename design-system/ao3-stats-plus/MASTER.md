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

**Contrast:** light-mode pairs (ink-on-paper, accent-on-paper) are comfortably high-contrast by
inspection (very dark ink on very light paper); dark-mode pairs were chosen as lightened tints
specifically to stay legible on the dark background, but exact ratios have not been run through
a contrast-checker tool yet — **verify all four pairs (ink/paper, ink-soft/paper, accent/paper,
growth/paper) in both modes against WCAG AA 4.5:1 before implementation**, and adjust the tint
lightness if any pair falls short. Don't treat the hex values above as final until that's done.

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
product's one deliberate visual risk. In light mode it's a small solid dot in `--color-accent`
— a quiet echo of AO3's own kudos mark, at the one point on the chart that represents "before
anyone had read this yet." In dark mode, add a soft radial glow behind that same dot (~16px,
`--color-accent` at low opacity, fading to transparent) — **this glow is not something the user
asked for explicitly; it's my addition, carried over from Direction B's "lamplight" vibe as a
small dark-mode-only touch. Flag it for a yes/no before implementation** rather than assuming
it's wanted just because it fit the brief.

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
/* Dark-mode-only addition — confirm before building */
@media (prefers-color-scheme: dark) {
  .chart-leadin-dot { box-shadow: 0 0 16px 4px color-mix(in srgb, var(--color-accent) 45%, transparent); }
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

## Anti-Patterns (do NOT use)

- ❌ Emojis as icons — SVG only (Heroicons, already the closest fit for this stack)
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
- [ ] **Text contrast ≥4.5:1 verified with an actual contrast-checker tool for all four
      light-mode pairs AND all four dark-mode pairs — not yet done, see Color Palette note**
- [ ] Focus states use the `--color-accent` ring, visible on every interactive element, in
      both modes
- [ ] `prefers-reduced-motion` respected (should be automatic — see anti-patterns)
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] Chart series differentiated by line style, not color alone (existing project pattern)
- [ ] Every chart still has its accessible data-table alternative (existing project pattern —
      do not regress this when applying new visual tokens)
- [ ] Dark mode tested independently, not assumed from light-mode values (Recharts color note
      above — confirm the chart itself actually re-themes, not just surrounding chrome)
- [ ] Dark-mode lead-in glow (see Component Specs) confirmed wanted, not just implemented
      because it was in the token spec

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
| Should the dark-mode marker get B's glow effect? | Added as an explicit, flagged, not-yet-confirmed addition | This is a genuine judgment call beyond what was asked — noted rather than silently included, per the Pre-Delivery Checklist item above. |

**Not carried forward from the rejected directions:** Reading Room Ledger's stamp-square
marker and Source Serif 4 display face; After Hours's Lora serif, amber accent hue, and warm
taupe/copper secondary colors — all superseded by the synthesis above.
