# Design System Master File — ao3-stats-plus

> **LOGIC:** When building a specific page, first check `design-system/ao3-stats-plus/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. If not, follow the rules below.
>
> Generated via the `ui-ux-pro-max` skill's `--design-system` search, then deliberately
> revised through the `frontend-design` skill's brainstorm/critique process — see
> "Brainstorm & critique log" at the bottom before treating any raw search output as final.

**Project:** ao3-stats-plus
**Generated:** 2026-07-30
**Category:** Personal creative-analytics tool (not enterprise SaaS, not a marketing site)

---

## The brief, pinned down

**Subject:** A longitudinal stats companion for [Archive of Our Own](https://archiveofourown.org/)
(AO3) fanfiction authors — install a bookmarklet, capture a snapshot of your own hits/kudos/
comments/bookmarks whenever you like, watch your own creative history accumulate over time.

**Audience:** Fanfiction authors. Fandom-culture-native, often emotionally invested in their
work's reception, and — because AO3 itself is a proudly nonprofit, ad-free, deliberately
utilitarian archive — allergic to anything that reads as corporate SaaS.

**The page's single job:** make an author's own numbers feel like entries in a well-kept
reading ledger: quietly legible, personal, worth returning to. Not a KPI wall. Not a funnel to
convert anyone into anything — there is no CTA, no pricing, no "upgrade."

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| Paper (background) | `#F7F8FA` | `--color-paper` | Page background — cool, unbleached-ledger-paper, not warm cream |
| Ink (primary text/UI) | `#1E3A5F` | `--color-ink` | Headings, primary buttons, primary chart line — fountain-pen navy, never pure black |
| Ink Soft (secondary) | `#4A5B73` | `--color-ink-soft` | Body copy, secondary labels, borders |
| Stamp (accent) | `#B45309` | `--color-stamp` | Sparingly: the signature lead-in marker, active/focus states, one CTA per screen at most |
| Growth (positive data) | `#3F6C51` | `--color-growth` | Reserved for explicit "this is climbing" indicators — never the default line color |
| Card (surface) | `#FFFFFF` | `--color-card` | Chart backgrounds, form cards, content blocks against the paper background |
| Destructive | `#DC2626` | `--color-destructive` | Errors, token-mismatch banners — matches existing bookmarklet banner red, kept for continuity |

All pairs above meet WCAG AA 4.5:1 for body text; `--color-stamp` on `--color-paper` meets
3:1 (large-text/graphical-element threshold only — never set body copy in it).

### Typography

Three-tier system, deliberately not a single do-everything sans:

- **Display / heading:** [Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4) —
  moderate-contrast literary serif. Used at heading sizes only, restrained (per-page: one `h1`,
  a handful of `h2`/`h3`s at most) — this is the one place the design spends its "boldness."
- **Body / UI:** [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) — highly
  legible, has its own quiet character without announcing itself.
- **Data / figures:** [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) —
  tabular figures for chart axis labels, hit/kudos counts, and timestamps, so numbers don't
  jitter or misalign column-to-column. Same superfamily as the body face, so the three tiers
  read as one considered system rather than three unrelated fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```

```js
// tailwind.config equivalent
fontFamily: {
  display: ['"Source Serif 4"', 'serif'],
  sans: ['"IBM Plex Sans"', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'monospace'],
}
```

Type scale (matches Tailwind's default scale, no custom values needed):
`text-sm` (14px) captions/labels → `text-base` (16px) body → `text-lg`/`text-xl` chart titles
→ `text-2xl` page `h1` → `text-3xl`+ reserved, unused today (nothing on this dashboard needs
to shout louder than a page title).

### Spacing

Standard 4px/8px rhythm — Tailwind's default scale (`gap-2`, `gap-4`, `gap-6`, `gap-8`, `p-8`
for page padding). No project-specific override; this is exactly the axis where a data-dense
dashboard should NOT be experimental — see `--density` note under Chart Guidance.

### Shadows / elevation

Kept deliberately flat. A ledger page doesn't float — cards use a 1px `--color-ink-soft`
border at low opacity rather than a drop shadow:

```css
--surface-border: 1px solid rgb(30 58 95 / 0.12);  /* --color-ink at 12% */
--surface-border-hover: 1px solid rgb(30 58 95 / 0.24);
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
.btn-primary:focus-visible { outline: 2px solid var(--color-stamp); outline-offset: 2px; }

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

No `translateY`/scale-on-hover — per the anti-pattern log below, motion here is restrained to
color/opacity, not layout-adjacent transforms.

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
  border: 1px solid rgb(30 58 95 / 0.2);
  border-radius: 6px;
  padding: 10px 14px;
  font-family: var(--font-sans);
  font-size: 16px; /* never smaller — avoids iOS auto-zoom, per ui-ux-pro-max §5 */
  transition: border-color 200ms ease;
}
.input:focus {
  border-color: var(--color-stamp);
  outline: none;
  box-shadow: 0 0 0 3px rgb(180 83 9 / 0.15); /* --color-stamp at 15% */
}
```

### The signature element: the ledger stamp

The synthetic "earliest post year" baseline point (added to the trend/ratio charts) is this
product's one deliberate visual risk — see the critique log for why. It's the single thing
this dashboard should be recognizable by:

```css
.chart-leadin-stamp {
  width: 10px;
  height: 10px;
  border-radius: 2px; /* not a circle — a small stamped square, like an ink due-date mark */
  background: var(--color-stamp);
  transform: rotate(-8deg); /* slightly imperfect, hand-stamped, not machine-precise */
}
.chart-leadin-connector {
  stroke: var(--color-ink-soft);
  stroke-dasharray: 4 4;
  stroke-width: 1.5px;
}
```

This is the only place `--color-stamp` appears inside a chart. Every other line/marker uses
`--color-ink`. One accent, spent once, per the "spend your boldness in one place" principle.

---

## Chart Guidance

(Synthesized from the `ui-ux-pro-max` chart domain and this project's existing, already-good
accessible pattern in `TrendChart`/`RatioChart` — this section describes what to preserve and
extend, not a rewrite.)

- Real series: solid `--color-ink` line. Synthetic lead-in segment: dashed `--color-ink-soft`
  (see stamp spec above) — series are differentiated by **line style**, never color alone,
  which the codebase's existing per-point `aria-label` markers and sr-only data table already
  satisfy; keep that pattern for every new chart element, including the lead-in.
- Never rely on `--color-growth` alone to mean "trending up" — pair it with the actual number
  visible in the accessible table.
- Category axis (not real-time-linear) stays the existing, correct default per this project's
  Recharts setup — do not introduce a real date-scale axis "to look more like a real chart";
  the categorical spacing is a considered choice already validated against this codebase.
- `--density`: standard (16–64px spacing), not the dashboard-dense 8–32px tier. This is a
  personal dashboard viewed occasionally, not an ops console glanced at all day — give the
  charts room to breathe rather than packing maximum data per screen.

---

## Anti-Patterns (do NOT use)

- ❌ Emojis as icons — SVG only (Heroicons, already the closest fit for this stack)
- ❌ Any drop shadow on cards — this system is flat/bordered, not elevated
- ❌ `translateY`/scale hover transforms on cards or buttons — color/border transitions only
- ❌ A hero stat card as the dashboard's opening element (see critique log — the chart itself
  is the thesis, not a big-number-plus-gradient tile)
- ❌ Numbered step markers (01 / 02 / 03) anywhere — nothing on this dashboard is a sequence
- ❌ Low-contrast text — 4.5:1 minimum, verified per pairing above
- ❌ Invisible focus states — every interactive element gets a visible `--color-stamp` focus
  ring, no exceptions
- ❌ `prefers-reduced-motion` violations — the only motion in this system is 150–300ms
  color/border transitions, which already respect reduced-motion by virtue of not being
  transform/motion-based to begin with

---

## Pre-Delivery Checklist

- [ ] No emojis used as icons
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states are color/border transitions only (150–300ms), never layout-shifting
- [ ] Text contrast ≥4.5:1 in both the palette above and against `--color-card`
- [ ] Focus states use the `--color-stamp` ring, visible on every interactive element
- [ ] `prefers-reduced-motion` respected (should be automatic — see anti-patterns)
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] Chart series differentiated by line style, not color alone (existing project pattern)
- [ ] Every chart still has its accessible data-table alternative (existing project pattern —
      do not regress this when applying new visual tokens)

---

## Brainstorm & critique log

This is the record required by the `frontend-design` skill's process: what the raw
`ui-ux-pro-max --design-system` search proposed, and why each part was revised rather than
adopted directly.

| Raw search proposed | Why it was rejected | What replaced it |
|---|---|---|
| Pattern: "Community/Forum Landing" (member showcase, join CTA) | This isn't a landing page selling membership — it's a private dashboard for one already-onboarded author | Chart-as-hero layout concept (no CTA, no social proof) |
| Style: "Motion-Driven" (parallax, entrance anims, scroll effects) | Wrong register entirely for a quiet personal ledger; also directly conflicts with the existing, correct `prefers-reduced-motion` discipline already in this codebase's bookmarklet banners | Flat, border-based surfaces; motion limited to 150–300ms color transitions |
| Typography: Caveat (handwritten) + Quicksand | Reads as "personal blog," undermines legibility for a data-dense dashboard with real numbers to scan | Source Serif 4 / IBM Plex Sans / IBM Plex Mono three-tier system |
| Colors: generic enterprise blue `#1E40AF` + amber `#D97706` ("Data-Dense Dashboard" preset) | This is the single most common palette for BI/analytics tools — the opposite of distinctive, and reads as corporate SaaS, which the actual audience (fandom, anti-corporate-by-culture) would bounce off of | Ledger-navy ink + sparing gold "stamp" accent, justified by the library/archive metaphor instead of generic "data = blue" convention |
| Typography: Fira Code (monospace) as a **heading** font | Monospace-as-display reads as "developer tool," not "personal creative-writing companion" | Monospace reserved for actual tabular data only (`IBM Plex Mono`), never headings |
| Colors: pink "Creative Agency" preset (`#EC4899` primary) | Reads as marketing-agency portfolio, unrelated to the subject | Not used |
| The three defaults the `frontend-design` skill names outright: warm-cream+terracotta+serif; near-black+neon; broadsheet/hairline-newspaper | None of these were in the raw search output, but they were the risk once "literary/archive" kept surfacing warm-cream results in the color search | Deliberately shifted the background cooler (`#F7F8FA`, not `#F4F1EA`-adjacent cream), kept the serif moderate-contrast rather than high-contrast/display-weight, and never introduced a terracotta hue — the accent is gold/amber via the "library due-date stamp" concept, used at <5% of the page's surface, not as a wash |

**The one deliberate risk taken:** the ledger-stamp signature element on the synthetic
lead-in point (see Component Specs). Everything else in this system is intentionally quiet —
per the skill's own instruction, spend the boldness in exactly one place and keep the rest
disciplined.
