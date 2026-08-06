# Plan: Work-comparison picker — 7 UI refinements

**Stage:** Planning (SDLC stage 2) · **Status: CONFIRMED 2026-08-05.** All 5 sign-off questions
resolved by the user directly: Q1 (synthetic tracked `role="option"` header, not a manual
injection), Q2 (`colors.ink` for the state-signifier icons), and Q4 (encode fandom state+action
into the header option's `aria-label`) explicitly confirmed via direct choice; Q3 (CSS grid fixed
widths) and Q5 (scope boundaries) proceed as stated, no objection raised. Ready for Testing.
**Scope:** Frontend only. Presentation/interaction refinements to the *just-shipped* Autocomplete
work-comparison picker. **No selection-logic, store-contract, backend, GraphQL, or data-model
change** (confirmed explicitly in §Data model below).
**Builds on:** `docs/plans/work-comparison-picker-redesign.md` (the shipped picker + the same-day
maintenance fix that introduced the current bulk-select-bar-as-listbox-sibling design, for the
real `aria-required-children` violation documented in that file's `renderFandomGroup` comment).
**Touches for real:** `frontend/src/components/WorkPicker.tsx`,
`frontend/src/components/DateRangeSlider.tsx`,
`frontend/src/components/WorkComparisonSection.tsx`,
`design-system/ao3-stats-plus/MASTER.md`, plus the associated test/story files.

---

## 0. Resolved decisions (skim this first)

| # | Requirement (verbatim intent) | Resolution |
|---|---|---|
| 1 | Functional fandom-header checkbox, no separate button bar | Make the fandom header a **genuine synthetic entry in the `options` array** (`kind: "header"`), NOT a manually-injected `<li>` outside MUI's tracked options. Verified against `useAutocomplete.js`: only tracked options (with `data-option-index` + `tabIndex=-1`, both set by MUI's own `getOptionProps`) are reachable by arrow-key roving highlight and Enter/click. A synthetic tracked option gets **full keyboard parity for free** and satisfies axe (`role="option"` is a legal listbox child). This **removes** `BulkSelectPaper`, `renderBulkSelectBar`, the module augmentation, the `slots.paper`/`slotProps.paper.bulkSelectBar` wiring, `bulkSelectBarRef`, AND the controlled `open`/`onOpen`/`onClose` + `relatedTarget` machinery. See §1 — **flagged for sign-off (Q1)** because it diverges from the "manually constructed outside the options array" framing. |
| 2 | No accent (raspberry/wine) on the two state-signifier icons | Recolor `CheckIcon` (selected work rows) and `TriStateIcon` (fandom header) from `colors.accent` to **`colors.ink`**. Contrast verified ≥3:1 both modes. Focus ring stays accent (unchanged). **Flagged for sign-off (Q2)** — `growth` considered and rejected with reasoning. |
| 3 | Fixed relative widths; picker width never changes on selection; slider always rendered, disabled below threshold, bounds `earliestPostYear`→current year | Two-column **CSS grid `md:grid-cols-[minmax(0,1fr)_18rem]`** (bulletproof non-reflow). Slider **always rendered**; `unionPointCount <= 2` gate removed from `DateRangeSlider`, replaced by MUI Slider's own `disabled` prop. Bounds reuse the existing `domain` computation in `WorkComparisonSection`. |
| 4 | Autocomplete "Clear" → "Clear all" | `clearText="Clear all"` on `<Autocomplete>`. Verified: v9.2.0 default is `'Clear'`, applied to both `aria-label` and `title`. |
| 5 | Selected rows: no bold title; checkbox + 5–10% accent tint sufficient | Remove `font-semibold`; add `bg-accent/8` row tint. Tint is a background, not text/icon — explicitly permitted to stay accent per the user. Text-on-tint contrast verified. |
| 6 | Fandom header: drop the "None/Some/All selected" text; header font = body size, bold; divider moves ABOVE the header | Header option row: `text-sm font-semibold`, no text label, no uppercase. Divider = `border-t` on the group wrapper with `first:border-t-0`. **Tri-state now conveyed to screen readers via `aria-label`** (the removed visible text was the SR carrier — see §Accessibility). Tri-state icon stays (recolored per #2). |
| 7 | Same static label style for both controls; drop MUI floating label, use a plain placeholder | `WorkPicker`: drop `TextField label`, add a static `<span>Works to compare</span>` matching `DateRangeSlider`'s `<span>Date range</span>` exactly, keep `placeholder="Search title or fandom"`. **Accessible name preserved via `aria-labelledby`** to the new span (a placeholder is NOT an accessible name — see §Accessibility). |
| 8 | Dropdown rows need a hover state | `hover:bg-ink/5` (and the same on MUI's keyboard-highlight class) on option rows, coherent with #5's tint scale. |

**Cross-cutting note:** `WorkPicker.tsx` is currently 579 lines (over the 500-line `.tsx`
budget). This plan **net-removes** far more than it adds (BulkSelectPaper, renderBulkSelectBar,
the module augmentation, the whole controlled-open/relatedTarget block, the `visible*`
derivations, `triStateLabel`), so the file should drop **back under budget**. Verify at
Implementation; the file-length flag is expected to resolve, not worsen.

---

## 1. Requirement 1 — functional header as a synthetic `role="option"` (the load-bearing decision)

### 1.1 The verified keyboard-navigation finding

The user flagged an open question: **does MUI's arrow-key roving highlight reach a
manually-injected `<li role="option">` that isn't one of MUI's tracked options?** Verified
against the installed `node_modules/@mui/material/useAutocomplete/useAutocomplete.js`:

- `validOptionIndex(index, direction)` (line ~275) short-circuits `if (!listboxRef.current ||
  index < 0 || index >= filteredOptions.length) return -1;` — navigation is **bounded to the
  `filteredOptions` array**, and it locates the DOM node via
  `listboxRef.current.querySelector('[data-option-index="${nextFocus}"]')`.
- It only accepts a candidate when `option.hasAttribute('tabindex')` (line ~284).
- `getOptionProps({index, option})` (line ~1273) is what stamps every **tracked** option with
  `role:'option'`, `tabIndex:-1`, `id`, `onClick: handleOptionClick`, and `data-option-index:
  index`.

**Conclusion:** a header `<li>` injected *outside* MUI's options array (e.g. inside
`renderGroup`) has no `data-option-index` and is invisible to arrow-key navigation, Enter
selection, and `aria-activedescendant`. It would be **mouse-click-only** — a genuine keyboard
regression versus today's Tab-reachable bulk-select buttons. **But** a header that IS a tracked
option is stamped by `getOptionProps` with `data-option-index` + `tabIndex=-1` and is therefore
**fully arrow-navigable, Enter-selectable, and click-selectable by MUI's own machinery, for
free** — and `role="option"` is a legal `listbox` child, so it satisfies the exact
`aria-required-children` constraint that forced the current sibling-bar design.

**Therefore the resolution is Option A: make the header a synthetic tracked option**, not a
manual injection. This achieves the user's stated intent ("a real `role="option"` … structurally
identical in ARIA terms to a real work option") *and* closes the keyboard gap the user asked me
not to silently accept. It diverges from requirement 1's incidental "manually constructed outside
the `workOptions` array MUI tracks" phrasing, so it is **Q1 for sign-off**.

### 1.2 The option model change

```ts
type WorkOption =
  | { kind: "work"; id: number; title: string; fandom: string }
  | { kind: "header"; fandom: string; workIds: number[] };
```

- `flattenToWorkOptions` builds, per fandom group (in `groupWorksByFandom` order): **one
  `header` sentinel first**, then the `work` options for that fandom. Contiguity per fandom is
  preserved, so MUI's `groupBy` requirement (options pre-sorted by group) still holds.
- `groupBy={(o) => o.fandom}` — headers and works in a fandom share the same group string.
- `getOptionLabel={(o) => o.kind === "header" ? o.fandom : o.title}` (headers never enter
  `value`, so this label is effectively unused for headers, but returns something sane).
- `isOptionEqualToValue`: `false` if either side is a header (headers are never in `value`);
  otherwise `o.id === v.id` as today.
- `getOptionDisabled`: `false` for headers (a full fandom must stay deselectable even at cap;
  `selectAllInFandom` already caps additively); unchanged `atCap && !selectedIds.has(o.id)` for
  works.
- `value` (`selectedOptions`) maps `selectedWorkIds` → one representative **`work`** option each;
  **never** includes headers. (Keep the existing `useMemo` — it fixes the documented
  typing-reset bug, which is about `value` reference stability, and is unaffected by this change.)

### 1.3 Custom `filterOptions` (headers must track visible works)

The current `createFilterOptions({ stringify })` can't see the `kind` distinction. Replace with a
thin wrapper:

1. Split the incoming options into headers and works.
2. Run the existing `createFilterOptions({ stringify: o => \`${o.title} ${o.fandom}\` })` over the
   **work** options only (preserves title+fandom matching — unchanged behavior).
3. Rebuild the array in `groupWorksByFandom` order: for each fandom with ≥1 surviving work,
   emit its `header` sentinel followed by that fandom's surviving works.

This keeps headers pre-sorted/contiguous (groupBy-safe) and auto-hides a header whose fandom has
no visible works — matching the prior "header hidden for filtered-out fandoms" behavior. It also
makes the standalone `visibleWorkOptions`/`visibleFandoms`/`visibleFandomGroups` derivations
(which only fed the now-deleted bulk bar) unnecessary — **delete them**.

### 1.4 `onChange` routing (unchanged selection semantics)

`handleAutocompleteChange` already ignores MUI's diffed value array and reads `reason`/`details`:

- `reason === "selectOption"` && `details.option.kind === "header"` → call the **existing**
  `handleFandomHeaderClick(details.option.workIds)` (semantics 100% unchanged: full fandom →
  `deselectAllInFandom`; none/partial → `selectAllInFandom`, cap-respecting, truncation
  announced).
- `reason === "selectOption"` && `kind === "work"` → `addWork(…, details.option.id)` (unchanged).
- `reason === "removeOption"` → `removeWork` (headers never in value, so never fires for a
  header) (unchanged).
- `reason === "clear"` → `[]` (unchanged).

Because `value` never contains a header, MUI reconciles back to the `selectedOptions` prop after
each change exactly as it does for works today — the header sentinel never persists in `value`.
This is the same "don't trust the diff" pattern already shipped.

### 1.5 Rendering the header row (`renderOption`)

`renderOption` branches on `option.kind`:

- **header:** a `<li>` spreading MUI's `...rest` (so it keeps `role="option"`, `id`,
  `data-option-index`, `tabIndex=-1`, `onClick`, `aria-selected`), styled
  `flex items-center gap-2 px-3 py-2 text-sm font-semibold text-ink cursor-pointer` +
  `hover:bg-ink/5 [&.Mui-focused]:bg-ink/5` (mouse hover AND keyboard highlight look identical),
  containing `<TriStateIcon state={triState} color={colors.ink} />` + `<span>{option.fandom}</span>`.
  `triState` is computed from `fandomTriState(option.workIds, selectedIds)` (existing helper).
  **`aria-label`** carries the state + action for AT (see §Accessibility) — the removed visible
  text label was the SR carrier, so this is not optional.
- **work:** the existing row, with #5 (no bold, accent tint) and #8 (hover) applied — see §5/§8.

### 1.6 `renderGroup` simplification

`renderGroup` keeps the `<div role="group" aria-label={params.group}>` + inner
`<ul role="presentation">` wrapper (still needed for axe's `aria-required-parent` walk — see the
existing comment) but **drops its own header markup** (the tri-state icon + name + text label now
live in the first child option). The wrapper gets `border-t border-ink/10 first:border-t-0` for
requirement 6's above-the-header divider (see §6; verify the group wrappers are direct listbox
children so `first:` targets the first group — fallback: compute first-visible-fandom index).

### 1.7 Removing the popup-open machinery (verified safe)

The controlled `open`/`onOpen`/`onClose` + `relatedTarget` override + `bulkSelectBarRef` +
`onMouseDown` preventDefault existed **solely** because the bulk bar was a DOM *sibling* of
`<ul role="listbox">`, outside MUI's own "keep the popup open while interacting inside the
listbox" scope. The header is now a listbox *descendant* (a real option); MUI's native handling
(`disableCloseOnSelect` keeps it open on select; `handleOptionClick` refocuses the input) applies.
**Remove all of it; revert to uncontrolled `open`.** Keep `disableCloseOnSelect`. (Keep the
controlled `inputValue`/`onInputChange` as-is — low-risk, already battle-tested against the
typing-reset bug; only the bar-specific `visible*` derivations are deleted.)

---

## 2. Requirement 2 — recolor the two state-signifier icons (color decision + verified contrast)

Scope (user-confirmed): **only** `CheckIcon` (selected work rows) and `TriStateIcon` (fandom
header). **Not** the focus ring (stays accent). Both change from `colors.accent` → **`colors.ink`**.

**WCAG 1.4.11 non-text contrast (≥3:1) against `--color-card`, both modes** (computed):

| Candidate | light-on-card (`#FFFFFF`) | dark-on-card (`#2B232A`) | ≥3:1? |
|---|---|---|---|
| **`ink`** (`#2B2230` / `#F5EEF1`) | **15.28** | **13.35** | yes (huge margin) |
| `growth` (`#4D7C5F` / `#8FBFA0`) | 4.81 | 7.36 | yes |

**Recommendation: `ink`.** Reasoning:
1. The tri-state control is fundamentally a **checkbox metaphor** (box outline / dash / check).
   A conventional checkbox check reads as neutral "on," which `ink` matches; `growth` (green)
   over-signifies "success/positive."
2. `growth` is this app's **established positive-trend / success semantic** in the charts
   (`colors.growth`); reusing it on a neutral multi-select toggle risks a **cross-signifier
   collision** with the chart meaning.
3. `ink` gives the **highest contrast** in both modes and matches the box outline stroke so the
   whole indicator reads as one coherent checkbox glyph.

**Q2 for sign-off:** confirm `ink`, or override to `growth` if you prefer a "selected = green"
read. Both pass contrast; this is a semantic call.

---

## 3. Requirement 3 — fixed widths + always-rendered, disabled-below-threshold slider

### 3.1 Layout (WorkComparisonSection)

Replace the flex row + conditional slider with a deterministic two-column grid:

```tsx
<div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
  <div><WorkPicker … /></div>
  <div><DateRangeSlider … /></div>   {/* ALWAYS rendered now */}
</div>
```

- `minmax(0,1fr)` for the picker column is the key: a grid `1fr` track has an implicit
  `min-width: auto` (min-content) that *would* let accumulating chips widen it; `minmax(0,1fr)`
  clamps the minimum to 0 so the field wraps chips internally and the **column width never changes
  when the selection changes** (requirement 3's core demand). `18rem` (= today's `w-72`) is the
  fixed slider column.
- Stacked below `md` (grid only applies at `md`+), unchanged.
- The `{showSlider && …}` conditional wrapper is **removed** — the slider always occupies its
  column. The existing `if (!showSlider && rawRange !== null) setRangeInStore(username, null)`
  gate-drop reset **stays** (so a disabled slider always shows the full range with no stale
  filter). `Autocomplete sx={{ width: "100%" }}` stays so the field fills its column.

Alternative if you prefer literal flex fractions: `md:flex md:flex-row` with picker
`md:flex-1 md:min-w-0` + slider `md:w-72 md:shrink-0` (the `min-w-0` is mandatory to prevent
chip-driven reflow). The grid is recommended as the more obviously non-reflowing option.

### 3.2 DateRangeSlider: remove the gate, add `disabled`

- **Remove** `if (unionPointCount <= 2) return null;`.
- Derive `const disabled = unionPointCount <= 2;` and pass `disabled={disabled}` to MUI `<Slider>`.
- `min`/`max` are already correct in both states: `WorkComparisonSection` computes
  `domainStart = Math.min(earliestPostYear ?? earliestUnionYear, currentYear)` and
  `domain = { start: domainStart, end: currentYear }`, and passes `min={domain.start}
  max={domain.end}`. `earliestPostYear` is the user-confirmed stand-in for account-creation date
  (no such field exists). When disabled, `effectiveRange` is null → `sliderValue = [domain.start,
  domain.end]` → the disabled slider shows the **full range**, thumbs at both ends. **No new
  bounds computation needed** — the existing `domain` already provides them.
- **Drag fix preserved:** the `liveValue`/`committedValue` reconciliation and the
  `onChange`/`onChangeCommitted` split are untouched. When disabled, MUI Slider suppresses
  interaction so `onChange`/`onChangeCommitted` simply never fire — no regression, no new
  coupling.

### 3.3 Disabled-slider visual treatment

No dedicated "disabled input" token exists in MASTER.md; the only disabled precedent in the
codebase is `aria-disabled:opacity-40` on capped option rows. So:

- Rely on MUI Slider's built-in `disabled` styling (greys track/thumb, removes pointer events,
  sets the thumb inputs `disabled`), but **theme it to tokens** so it reads intentionally inert:
  when `disabled`, override the `sx` so track/thumb use **`colors.ink` at low opacity** (NOT
  accent — a disabled control must not show the active accent), rail stays `ink/20`, and dim the
  "Date range" heading + the `<p>` readout (e.g. `text-ink-soft` / reduced opacity), aligning
  with the project's ~40% disabled convention.
- The readout still shows the full-range numbers (`domain.start – domain.end`) as a static,
  non-interactive readout — the control communicates "this is the available range, currently not
  adjustable," not "empty."
- The "Date range" heading stays visible in both states so the control's purpose is always clear.

**Optional a11y nicety (not required):** an `aria-describedby` hint like "Available once at least
three capture dates are in the selection." Flagged as optional — MUI's disabled state is already
announced; include only if desired.

---

## 4. Requirement 4 — "Clear all"

Add `clearText="Clear all"` to `<Autocomplete>`. Verified against installed v9.2.0: the prop
exists (`Autocomplete.d.ts` line 150), default `'Clear'`, and `Autocomplete.js` applies it to
**both** the clear button's `aria-label` **and** `title` (lines 633–634) — so the visible tooltip
and the accessible name both become "Clear all." Nothing else required.

---

## 5. Requirement 5 — selected rows: no bold, accent tint instead

In the `work` branch of `renderOption`:

- **Remove** the `state.selected ? "font-semibold" : "font-normal"` weight toggle (title stays
  `font-normal` always).
- Add a **`bg-accent/8`** (8%, mid-range of the user's 5–10%) row tint when `state.selected`.
- The `CheckIcon` indicator (recolored to `ink` per #2) remains the primary, non-color signifier
  — so the tint is reinforcement only and does not make color the sole differentiator (satisfies
  MASTER.md's redundant-signal rule). The tint is a **background**, explicitly permitted to stay
  accent per the user (requirement 2 scopes "no accent" to text/icons only).
- **Text-on-tint contrast verified** (ink text over the 8%-accent-over-card composite): light
  `#F7ECEF` → 13.24:1, dark `#3A2B33` → 11.68:1. Well above 4.5:1.

---

## 6. Requirement 6 — fandom header restyle

Handled inside the `header` branch of `renderOption` (§1.5) + `renderGroup` (§1.6):

- **Remove** the "None selected / Some selected / All selected" visible text (`triStateLabel` is
  deleted as a visible element; its wording is repurposed into the header option's `aria-label`
  for SR — see §Accessibility).
- Header font: **`text-sm font-semibold`** (same size as body option rows, bold), no
  `text-xs`/`uppercase`/`tracking-wide`.
- **Divider moves above:** `border-t border-ink/10 first:border-t-0` on the `renderGroup` group
  wrapper, so the line sits above each fandom header separating it from the previous group, with
  no stray line above the first group. (Replaces the old `border-b` under the header.)
- Tri-state icon **stays**, recolored to `ink` (#2), living in the now-clickable `role="option"`
  header row (#1).

---

## 7. Requirement 7 — matching static labels, no MUI floating label

Both controls get a plain static label above them, matching `DateRangeSlider`'s existing
`<span className="text-sm font-medium text-ink">Date range</span>`.

- **WorkPicker:** wrap in `<div className="flex flex-col gap-2">`; add
  `<span id="work-picker-label" className="text-sm font-medium text-ink">Works to compare</span>`
  above the Autocomplete.
- **Drop** `label="Works to compare"` from the `TextField` in `renderThemedInput` (removes MUI's
  animated floating label). **Remove** the now-dead `.MuiInputLabel-root` / `.Mui-focused` label
  rules from `inputSx`.
- **Keep** `placeholder="Search title or fandom"` (plain HTML placeholder hint).
- **Accessible name — critical:** a placeholder is NOT an accessible name; dropping the MUI label
  removes the combobox's name and would fail axe. Preserve it by associating the static span:
  `inputProps={{ ...params.inputProps, "aria-labelledby": "work-picker-label" }}` on the
  `TextField` (merge, don't overwrite MUI's own `inputProps`). Verify with axe + a "combobox named
  'Works to compare'" assertion (see §Accessibility).

---

## 8. Requirement 8 — option-row hover state

- **Work rows:** `hover:bg-ink/5` + the same on MUI's keyboard-highlight class
  (`[&.Mui-focused]:bg-ink/5`) so mouse hover and arrow-key highlight look identical.
- **Header rows:** same `hover:bg-ink/5 [&.Mui-focused]:bg-ink/5` (§1.5).
- Coherent tint system: neutral `ink/5` for the transient interactive highlight, accent `bg-accent/8`
  for the persistent selected state. Different hue (neutral vs accent) so "highlighted" and
  "selected" read as distinct but harmonious. Selected + hovered work row: the persistent
  `bg-accent/8` and transient `hover:bg-ink/5` are mutually exclusive CSS `background-color`
  values, so specify the selected state's hover explicitly as a slightly deeper accent
  (`hover:bg-accent/12` / `[&.Mui-focused]:bg-accent/12`) rather than letting `ink/5` clobber the
  selected tint. Hover-tint text contrast verified (ink on `#F4F4F5`/`#352D34` → 13.90/11.66:1).

---

## Happy path (end to end)

1. Author lands on the dashboard. The controls island shows the works picker (static label "Works
   to compare" above it) beside the date-range slider (static label "Date range" above it), at a
   **fixed two-column width that never shifts**. If the current selection has ≤2 union capture
   dates, the slider is **rendered but disabled**, showing the full `earliestPostYear`→current-year
   range statically; otherwise it's interactive.
2. Author clicks the field → grouped popup opens. Each fandom is introduced by a **bold,
   body-sized header row** (a real `role="option"`) with a tri-state checkbox icon (ink), a
   divider above it separating it from the previous group, and no text status label. Work rows
   below show a hover/keyboard-highlight tint.
3. Author types part of a title or fandom name → work rows and their fandom headers filter live
   (headers disappear when their fandom has no matching works).
4. Author clicks (or arrow-keys to and presses Enter on) a **work** row → it gets an ink check +
   an 8% accent row tint (no bold) and becomes a removable chip; charts update; selection persists
   to the store.
5. Author clicks or Enters a **fandom header** row → all works in that fandom toggle (full →
   deselect all; none/partial → select all remaining, cap-respecting, truncation announced). This
   works by mouse AND keyboard, because the header is a genuine tracked option.
6. Author clicks the field's **"Clear all"** (X) → whole selection clears.
7. Author picks ≥3 union dates → the slider becomes interactive with fixed bounds; dragging still
   commits once on release (the preserved drag fix).

## Data model (backend)

**N/A — confirmed explicitly.** Every one of the 7 requirements is a presentation/interaction
change. `comparisonSelection.ts` pure functions and semantics, `useWorkComparisonStore`'s public
interface, `perWorkSeries`/GraphQL, and the backend are all untouched. No migration, no schema,
no query change.

## Corner cases (deviations, not errors)

- **Multi-fandom work:** still one `work` option per (work × fandom); toggling any appearance or
  its single chip toggles the one work. Its fandom headers are unaffected structurally.
- **At cap (10):** unselected **work** options `aria-disabled` (opacity-40); **header** options
  are NOT disabled (a full fandom must stay deselectable, and `selectAllInFandom` caps additively
  with the existing truncation announcement).
- **Filter yields no matches:** MUI "No options"; all headers hidden (custom `filterOptions`
  emits no header for a fandom with zero surviving works).
- **Selection with ≤2 union dates:** slider **rendered but disabled**, full range shown, `range`
  forced to null (existing gate-drop reset) — the picker column width is unchanged either way.
- **Accumulating chips:** the `minmax(0,1fr)` picker column wraps chips internally; **width does
  not change** (requirement 3 core).
- **Selected + hovered/highlighted work row:** explicit deeper-accent hover (§8) avoids the
  neutral hover clobbering the selected tint.
- **First fandom group:** `first:border-t-0` suppresses a stray divider at the popup top.

## Error states

- Frontend: no new async/network. A synthetic-header "selection" that somehow reached `onChange`
  with an unexpected shape is handled defensively by the `kind` discriminant (falls through to no
  work-id mutation). MUI's value reconciliation guarantees headers never persist in `value`.
- Disabled slider: interaction suppressed by MUI; `onChange`/`onChangeCommitted` never fire, so
  no stale range write path. Existing gate-drop reset keeps `range` null in that state.
- Backend: unchanged; nothing to log.

## Accessibility (first-class)

- **Combobox accessible name preserved (req 7):** dropping the MUI label removes the input's
  name; a placeholder is not a name. Re-establish it via `aria-labelledby="work-picker-label"` →
  the static span. **Must be verified by axe + a named-combobox assertion** — this is the single
  highest a11y risk in the change.
- **Header keyboard operability (req 1):** verified reachable by arrow keys + operable by Enter
  (because it's a tracked option with `data-option-index` + `tabIndex=-1`), and click. Full
  parity with the removed Tab-reachable buttons — no keyboard regression.
- **Header state announced to SR (req 6 + req 2):** removing the visible "None/Some/All selected"
  text and conveying tri-state only by icon shape/color would strip the spoken status (and the
  header's `aria-selected` is always false since it's never in `value`, which would mislead). So
  the header option's **`aria-label` carries state + action**, e.g. `"Fandom One — all works
  selected, activate to deselect all"`, `"… no works selected, activate to select all"`, `"… some
  works selected, activate to select all remaining"`. Sighted users get the icon shape; SR users
  get the aria-label. Verify with a manual SR pass + an aria-label assertion.
- **No color as sole differentiator:** work rows use ink check + tint + (verified) text contrast;
  headers use icon shape (box/dash/check) + aria-label. Recolor to `ink` verified ≥3:1
  (WCAG 1.4.11) both modes.
- **Focus ring unchanged (accent), visible on field/chips/options** — req 2 explicitly excludes it.
- **Disabled slider** announced disabled by MUI; not implying interactivity; optional
  `aria-describedby` hint offered.
- **Single `role="status"` live region** retained (cap + truncation + `extraStatusMessage`).

## Frontend design (against MASTER.md)

Extends the existing snapshot's "Multi-select combobox picker" and "MUI Slider" sections; no new
page. Tokens used, all already in MASTER.md / `colorTokens.ts`:
- `--color-ink` — the two state-signifier icons (was `--color-accent`), header text, work text.
- `--color-accent` @8% — selected work-row background tint (permitted background use); focus rings
  (unchanged).
- `--color-ink` @5% / @/12 — option hover + keyboard-highlight; selected-row hover.
- `--color-ink` @10% — the above-header group divider; @20% — slider rail, disabled slider.
- Static labels reuse the exact `text-sm font-medium text-ink` pattern from `DateRangeSlider`.
- Icons remain hand-rolled inline SVG (no icon library — MASTER.md Anti-Patterns), flat/bordered,
  color/border transitions only.

**MASTER.md updates required** (task I-M below): rewrite the "Multi-select combobox picker"
section — the fandom-header is now a **synthetic `role="option"` bulk-toggle inside the listbox**
(not a `<button>` bar sibling; delete the "known deviation / documented fallback" paragraph and
replace with the verified keyboard-reachable synthetic-option approach), header restyle (bold,
body-size, divider-above, no text label, tri-state via icon + aria-label), work-row selected
treatment (ink check + 8% accent tint, no bold), hover state, "Clear all" text, and the static
label / `aria-labelledby` pattern. Update the "MUI Slider" section for the **always-rendered,
disabled-below-threshold** behavior and its token-themed disabled treatment.

---

## Task list (Testing → Implementation → Retrospective)

> This environment's Planning agent has no TaskCreate tool; this itemized list is the durable
> task artifact for stages 3–4, one commit per item per CODE_STANDARDS.md.

### Testing (stage 3 — red first; `test:` commits)
- **T1** `WorkPicker.test.tsx`: static "Works to compare" label present; combobox has that
  accessible name via `aria-labelledby` (NOT via a floating MUI label); placeholder "Search title
  or fandom" present; no MUI `InputLabel` rendered.
- **T2** Header-as-option: fandom header renders as `role="option"`, bold, body-sized, no
  "None/Some/All selected" text; clicking it selects/deselects the whole fandom (existing
  semantics: full→deselect, none/partial→select-all cap-respecting w/ truncation announced).
- **T3** Header keyboard: arrow-key highlight reaches the header option and Enter toggles the
  fandom (guards the §1.1 finding); header has a tri-state `aria-label` reflecting state + action.
- **T4** Divider above header: group wrapper has top border except the first group.
- **T5** Icon recolor: `CheckIcon`/`TriStateIcon` render with `colors.ink` (not `colors.accent`);
  focus ring remains accent.
- **T6** Selected work row: title NOT bold; row carries the accent tint; check indicator present
  (redundant signal).
- **T7** Hover state: work + header rows carry the ink hover/highlight tint.
- **T8** "Clear all": the clear control's accessible name is "Clear all".
- **T9** No bulk-select bar: `BulkSelectPaper`/bulk-bar/`slotProps.paper.bulkSelectBar` gone; no
  regression to popup-open behavior across multi-select and header clicks (uncontrolled open).
- **T10** `DateRangeSlider.test.tsx`: renders always; `disabled` when `unionPointCount <= 2`
  (never returns null); shows full `min`/`max` range when disabled; drag fix
  (`onChange`/`onChangeCommitted` split) regression tests still pass.
- **T11** `WorkComparisonSection.test.tsx`/`.regression.test.tsx`: two-column fixed-width layout;
  picker column width unchanged as selection grows; slider always present (disabled state below
  threshold); range forced null when disabled; all existing leadIn/caption/effectiveRange
  assertions unchanged.
- **T12** Extend `frontend/tests/accessibility.spec.ts` (axe, light + dark): open combobox with
  named field, header-option operability, selected/hover/disabled states, disabled slider.

### Implementation (stage 4 — make green; `feat:`/`fix:` commits)
- **I1** `WorkPicker.tsx`: `WorkOption` discriminated union + `flattenToWorkOptions` header
  sentinels; custom `filterOptions`; `onChange` header routing; `renderOption` header/work
  branches (recolored icons, no-bold + tint, hover, aria-label); `renderGroup` simplification +
  above-header divider; static label + `aria-labelledby`, drop MUI label, keep placeholder;
  `clearText="Clear all"`. (T1–T3, T5–T8)
- **I2** `WorkPicker.tsx`: delete `BulkSelectPaper`, module augmentation, `renderBulkSelectBar`,
  `slots.paper`/`slotProps.paper.bulkSelectBar`, `bulkSelectBarRef`, controlled
  `open`/`onOpen`/`onClose` + `relatedTarget` block, `visible*` derivations, `triStateLabel`.
  Verify file drops back under the 500-line budget. (T9, T4)
- **I3** `DateRangeSlider.tsx`: remove the `unionPointCount <= 2` null-gate; add `disabled` +
  token-themed disabled styling; preserve the drag fix untouched. (T10)
- **I4** `WorkComparisonSection.tsx`: two-column grid (`minmax(0,1fr)_18rem`); always render the
  slider (remove `{showSlider && …}`); keep the gate-drop range reset; pass bounds/disabled. (T11)
- **I-M** `MASTER.md`: rewrite the combobox-picker section (synthetic-option header, restyle,
  tint, hover, Clear all, static-label/aria-labelledby) and the Slider section (always-rendered
  disabled state). Remove the stale "known deviation / bulk-bar fallback" paragraph.
- **I5** Stories: update `WorkPicker.stories.tsx` / `WorkComparisonSection.stories.tsx` for the
  header-option, disabled-slider, selected/hover states; run the Storybook a11y addon.

### Retrospective (stage 8 — evaluate against)
- **R1** Did any `comparisonSelection.ts` / store / leadIn / caption / drag-fix behavior change
  that shouldn't have? (Must be zero.)
- **R2** Did the synthetic-option header deliver real arrow-key + Enter parity in the wild (not
  just in tests), and stay axe-clean (`aria-required-children`)?
- **R3** Is the combobox's accessible name intact after dropping the MUI label (the highest-risk
  a11y item)?
- **R4** Did `WorkPicker.tsx` drop back under the 500-line budget as predicted?
- **R5** Is MASTER.md consistent with the shipped refinements (no stale bulk-bar language)?
- **R6** Any width reflow observed as chips accumulate, in real browsers?

---

## Sign-off — resolved 2026-08-05

1. **(Q1)** **CONFIRMED**: the header is a genuine synthetic `role="option"` entry in the options
   array (Option A), not a manually-injected `<li>` outside MUI's tracked options.
2. **(Q2)** **CONFIRMED**: `CheckIcon` + `TriStateIcon` recolor to `colors.ink`.
3. **(Fixed-width mechanism)** No objection raised — proceeding with the CSS grid
   `md:grid-cols-[minmax(0,1fr)_18rem]` approach.
4. **(Q4 — header SR status via `aria-label`)** **CONFIRMED**: state + action encoded into the
   header option's `aria-label` (e.g. "Fandom One — some works selected, activate to select all
   remaining").
5. **(Scope boundaries)** No objection raised — confirmed: no backend/GraphQL/data-model change;
   no change to `comparisonSelection.ts` semantics, the `useWorkComparisonStore` contract, or the
   `DateRangeSlider` drag fix.
