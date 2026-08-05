# Plan: Work-comparison picker + controls-island redesign (+ shared-state store)

**Stage:** Planning (SDLC stage 2) · **Status:** FINALIZED — confirmed by user 2026-08-04 (Autocomplete over literal Select; localStorage persistence across visits, per-username). All other decisions in §0/§14 accepted as recommended (no correction given). Ready for Testing (stage 3).
**Scope:** Frontend only. Standalone redesign of the *existing, shipped* hits/kudos comparison controls, plus moving the comparison's selection/range state into a persisted Zustand store. No new metrics/data types in this piece (bookmarks/comments/subscriptions graphing is a separate follow-up — see §2 for why it can now run in parallel).
**Supersedes:** the "Grouped picker pattern (multi-select + fandom bulk-select)" section of `design-system/ao3-stats-plus/MASTER.md` (updating that section is in-scope here — see task list).
**Predecessor plans:** `docs/plans/per-work-comparison-graph.md` (original picker/slider/chart + the original "ephemeral local useState" decision now being revised), `docs/plans/per-work-zero-basis-dates.md`, `docs/plans/usds-dataviz-color-scheme.md`.

---

## 0. Resolved design decisions (skim this first)

1. **Component: MUI `Autocomplete`, not `Select`.** The user described a chip-input multi-select with grouped options, type-to-filter, and chips-in-the-closed-field. MUI `Select` (even with `multiple` + `renderValue` chips) has **no type-to-filter** at all. `Autocomplete` (`multiple`) is the only `@mui/material` component that natively delivers all of: chips in the field, type-to-filter, AND grouped/sectioned options. Treating the user's "MUI's select with the chip input" as *the result they want* (chip-input multi-select), `Autocomplete` is the correct technical fit. **Flag for sign-off:** if the user literally meant the `Select` component, say so and we lose type-to-filter.
2. **Chips render via `renderValue`, not `renderTags`.** Installed MUI is **v9.2.0**, where `renderTags` has been removed in favor of `renderValue` (verified in the installed `Autocomplete.d.ts` and MUI's v9 migration guide). Most online examples show the older `renderTags`; we must use `renderValue`.
3. **Fandom subsections via `groupBy` + custom `renderGroup`.** The fandom header is rendered by `renderGroup` as a clickable, tri-state bulk-select control.
4. **Fandom-header click semantics (requirement 8):** if *every* work in the fandom is already selected → header click **deselects all** of them; otherwise (none or partial) → header click **selects all remaining** (additive, cap-respecting, with truncation announcement). I.e. partial fills to 100%; only a full fandom empties. This reuses `selectAllInFandom` for the add path and a new pure `deselectAllInFandom` composed of `removeWork` semantics for the empty path (existing functions untouched).
5. **Type-to-filter matches title AND fandom name.** Because options are grouped by fandom, typing a fandom name should keep that whole group visible; matching title only would confusingly empty the list when a user types a fandom. Implemented via `createFilterOptions({ stringify: o => \`${o.title} ${o.fandom}\` })`.
6. **Cap (`MAX_SELECTED_WORKS = 10`) handling:** `getOptionDisabled` disables unselected options once at cap (MUI sets `aria-disabled` on them); the existing single `role="status"` polite live region keeps announcing "Maximum of 10 works reached." and select-all truncation ("Added N of M works; 10-work maximum reached.").
7. **Layout island:** the works-picker and `DateRangeSlider` sit **side-by-side** inside one bordered card ("island") above the two charts (`flex flex-col md:flex-row`), following MASTER.md's `.card` pattern. When the slider self-gates to `null` (≤2 union points) the picker fills the row.
8. **State moves to a persisted Zustand store (REVISED 2026-08-04).** `selectedWorkIds` + `range` move out of `WorkComparisonSection` local `useState` into a new per-username `useWorkComparisonStore` (`persist`/localStorage, following `useTokenStore.ts` exactly). This (a) decouples the deferred additional-metrics work so it can build in parallel against a stable store interface instead of waiting on this redesigned picker's internal state shape, and (b) folds in the already-logged ROADMAP item "Persist the compare-works selection to browser storage." The store's actions call the existing `comparisonSelection.ts` pure functions — a storage-location change, not a selection-logic change. See §2 for the full interface contract.
9. **Selection semantics + view-derivation logic unchanged.** `comparisonSelection.ts`'s pure functions and `WorkComparisonSection`'s zero-basis/leadIn/caption/`effectiveRange`/slider-gating logic are all preserved. The section just reads `selectedWorkIds`/`range` from the store instead of `useState` — a mechanical read-source swap, plus the persistence reconciliation described in §2. The `WorkPicker` props contract (controlled: `perWorkSeries`, `selectedWorkIds`, `onChange`, `extraStatusMessage`) is also unchanged.
10. **No backend/GraphQL/data-model change.** Confirmed: `perWorkSeries` shape, the `fandoms` `", "`-joined string, and `groupWorksByFandom` are all reused as-is. Persistence is browser-local (localStorage), not backend. Data-model section (§10) is N/A.

---

## 1. Component choice: `Select` vs `Autocomplete` (verified against real docs)

| Requirement | `Select multiple` (+ `renderValue` chips) | `Autocomplete multiple` |
|---|---|---|
| Chips in the *closed* field, each with its own delete "x" | Yes (via `renderValue`) | Yes (via `renderValue` + per-item `onDelete`) |
| Type-to-filter options | **No — not supported** | **Yes — built in** (`filterOptions`/default) |
| Grouped/sectioned options by fandom | Manual `ListSubheader` (no grouping API) | **Yes — `groupBy` + `renderGroup`** |
| Disable remaining options at cap | Per-`MenuItem` `disabled` | `getOptionDisabled` |
| WAI-ARIA pattern | listbox/button | **combobox** (WAI-ARIA APG) |

`Select` fails requirement 6 (type-to-filter) outright and has no first-class grouping. `Autocomplete` satisfies requirements 2–6 together. **Chosen: `Autocomplete`.**

Sources verified: installed `node_modules/@mui/material/Autocomplete/Autocomplete.d.ts` and `useAutocomplete/useAutocomplete.d.ts` (v9.2.0) confirm `multiple`, `groupBy`, `renderGroup`, `getOptionDisabled`, `filterOptions`, `isOptionEqualToValue`, `disableCloseOnSelect`, and `renderValue` (with a `getItemProps` getter exposing `onDelete`/`key`/`disabled`/`data-item-index`/`tabIndex`). Official docs: MUI Autocomplete follows the WAI-ARIA combobox pattern and is keyboard operable; the v9 migration guide documents `renderTags` → `renderValue`.

---

## 2. State management: persisted Zustand store (revised architecture)

**Why this changed (2026-08-04):** the original `per-work-comparison-graph.md` deliberately kept selection + range as ephemeral local `useState`, calling it "view-local state." That is revisited: the deferred additional-metrics work (graphing bookmarks/comments/subscriptions onto this same comparison graph) shares exactly the same two pieces of state (which works are selected, what date window). If that state lives behind a stable store interface rather than inside the redesigned picker, both pieces of work can proceed **in parallel** — the metrics work builds against the store contract, not against whatever the redesigned `WorkPicker`'s internals end up looking like. This also absorbs the standalone ROADMAP item "Persist the compare-works selection to browser storage" instead of doing it as yet another follow-up touching the same state.

**Precedent followed exactly:** `frontend/src/store/useTokenStore.ts` — `create()(persist(..., { name }))`, localStorage, state keyed per-username as `Record<string, T>`, small action-based interface (`getToken`/`setToken`/`clearToken`). New store: `frontend/src/store/useWorkComparisonStore.ts`. Zustand `^5.0.14` is already installed and approved (TECH_STACK.md's designated state library).

**Per-username scoping** (not global): selected AO3 work IDs and a date window are meaningless across different AO3 accounts — the works are entirely different sets — same rationale as `tokensByUsername`.

### 2.1 Public interface — the stable contract the metrics work builds against

```ts
import type { YearWindow, SelectAllInFandomResult } from "../lib/comparisonSelection";

interface WorkComparisonSelection {
  selectedWorkIds: number[];   // order = add order (drives style-slot + legend/column order)
  range: YearWindow | null;    // null = full range / slider hidden; stored RAW, not domain-clamped
}

interface WorkComparisonState {
  byUsername: Record<string, WorkComparisonSelection>;

  // reads
  getSelection: (username: string) => number[];
  getRange: (username: string) => YearWindow | null;

  // writes — each internally calls the existing comparisonSelection.ts pure
  // functions; NO selection logic is duplicated or reimplemented here.
  setSelection: (username: string, selectedWorkIds: number[]) => void;
  addWork: (username: string, workId: number) => void;                              // -> addWork()
  removeWork: (username: string, workId: number) => void;                           // -> removeWork()
  selectAllInFandom: (username: string, fandomWorkIds: number[]) => SelectAllInFandomResult; // -> selectAllInFandom()
  deselectAllInFandom: (username: string, fandomWorkIds: number[]) => void;         // -> deselectAllInFandom()
  setRange: (username: string, range: YearWindow | null) => void;
  clearSelection: (username: string) => void;
}
```

**Contract notes:**
- **`range` is stored RAW (un-clamped).** Domain-dependent clamping (`effectiveRange`) depends on the currently-selected works + `earliestPostYear`, which the store does not know. So `WorkComparisonSection` keeps its existing `effectiveRange` re-clamp and gate-drop reset exactly as today, just reading `range` from the store. Deliberate separation: the store is a storage/semantics layer, not a view-derivation layer.
- **All mutation actions delegate to `comparisonSelection.ts`.** `addWork`/`removeWork`/`selectAllInFandom`/`deselectAllInFandom`/`MAX_SELECTED_WORKS` enforcement stay the single source of selection semantics. `selectAllInFandom` returns the unchanged `SelectAllInFandomResult` so the caller can still drive the truncation announcement.
- **Persistence:** `persist(..., { name: "ao3-stats-plus-work-comparison-store" })`, localStorage, mirroring the token store. Only `byUsername` persists (actions are re-created by `create`).
- **Stability commitment:** this interface — read `selectedWorkIds`/`range` per username, mutate via the semantic actions — is what the deferred metrics work consumes. It must be reviewed here as a contract, not treated as a picker implementation detail. The metrics work reads the same selection/range and never needs to know `WorkPicker` exists.

### 2.2 How `WorkComparisonSection` consumes it (mechanical read-source swap)

- New prop `username: string`, threaded from `DashboardPage` (which already has it via `useParams`).
- `selectedWorkIds` / `range` are read from the store (`getSelection(username)` / `getRange(username)`) instead of `useState`. The section's existing `handleSelectionChange`/`handleRangeChange` write through the store (`setSelection`/`setRange`).
- `WorkPicker` and `DateRangeSlider` stay **controlled/presentational** (props in, callbacks out) — the store lives one level up in the section, so both remain Storybook- and unit-testable without a store.
- **`effectiveRange`, `buildSeries`, `computeLeadIn`, `summaryMessage`, `hasRenderedLeadIn`, slider gating: all compute identically** — confirmed mechanical read-source swap (coordinator item 6). The only non-mechanical additions are the persistence reconciliations in §2.3.

### 2.3 Persistence-introduced reconciliation (new corner cases)

Because selection now survives across reloads/visits, the section gains reconciliation the ephemeral `useState` never needed:

1. **First visit for a username** (no store entry): default = first work preselected, exactly as today's `useState` initializer.
2. **Restored `selectedWorkIds` referencing works absent from the current `perWorkSeries`** (a work deleted/renamed, or a different account): filter restored ids to those present in the current `perWorkSeries`; if that empties the set, fall back to the first work. Prevents dangling ids producing empty chart series.
3. **`styleAssignment` map** (the workId→style-slot map): stays view-local `useState`, NOT persisted (style slots are ephemeral visual assignment). Rebuilt on mount from the restored/reconciled `selectedWorkIds` order so restored works get stable (shape, color) slots.
4. **Restored `range` stale vs the current domain:** already tolerated — the section's existing `effectiveRange` re-clamp falls back to the full domain when the stored window doesn't overlap. No new logic; assert it in tests.

---

## 3. Option model & how it maps to the number[] selection

**Problem:** a multi-fandom work must appear under *each* of its fandom groups (the shipped checkbox UI does this), but MUI `groupBy` returns exactly one group string per option, so one option object can only live in one group.

**Solution:** flatten to one option per (work × fandom) appearance:

```ts
interface WorkOption { id: number; title: string; fandom: string }
```

- Build from `groupWorksByFandom(perWorkSeries)` (reused unchanged), iterating groups in first-encounter order, one `WorkOption` per work per group. Because `groupWorksByFandom` returns contiguous per-fandom groups, the flattened array is pre-sorted by group as MUI's `groupBy` requires.
- `groupBy={(o) => o.fandom}`, `getOptionLabel={(o) => o.title}`.
- `isOptionEqualToValue={(o, v) => o.id === v.id}` — both group appearances of a selected multi-fandom work render selected; toggling either toggles the one work.
- `value`: derived from the store's `selectedWorkIds`, mapped to **one representative `WorkOption` per id** (first appearance) → exactly one chip per selected work.
- **`onChange` does not trust MUI's diffed value array.** It reads `(_event, _value, reason, details)`; for `selectOption`/`removeOption` it maps `details.option.id` through the pure `addWork`/`removeWork` and reports the new id array via `WorkPicker`'s `onChange` (which the section writes to the store). `clear` → empty selection. Selection semantics stay in `comparisonSelection.ts`.

---

## 4. Exact Autocomplete configuration

```tsx
<Autocomplete
  multiple
  disableCloseOnSelect            // keep popup open across multi-selects
  options={workOptions}           // flattened WorkOption[], pre-sorted by fandom group
  value={selectedOptions}         // one representative WorkOption per selected id
  groupBy={(o) => o.fandom}
  getOptionLabel={(o) => o.title}
  isOptionEqualToValue={(o, v) => o.id === v.id}
  getOptionDisabled={(o) => atCap && !selectedIds.has(o.id)}   // cap: disable unselected
  filterOptions={createFilterOptions({ stringify: (o) => `${o.title} ${o.fandom}` })}
  onChange={handleChange}         // maps details.option -> addWork/removeWork by id
  renderGroup={renderFandomGroup} // clickable tri-state fandom header (see §5)
  renderValue={renderChips}       // chips with accessible delete (see §6)
  renderInput={renderThemedInput} // MUI TextField themed to tokens (see §7)
  renderOption={renderOptionRow}  // shows selected state without color-alone
  slotProps={{ chip: { ... } }}   // accessible-name wiring for delete
  sx={autocompleteSx}             // token theming via useChartColors (see §7)
/>
```

- `disableCloseOnSelect` mirrors the shipped "check several without the control collapsing" ergonomics.
- We do **not** use `filterSelectedOptions` — selected works stay visible so they can be clicked to deselect (matches shipped behavior, keeps groups intact).

---

## 5. Fandom-header bulk-select (`renderGroup`)

`renderGroup` receives `{ key, group, children }`. We render:

- a header row containing a real `<button type="button">` whose accessible name is the fandom + current action ("Select all in Fandom One" / "Deselect all in Fandom One"), plus a **tri-state indicator** (none / indeterminate / all) via icon shape + text, never color alone;
- then `children` (the option `<li>`s MUI generated for that group).

**Semantics (requirement 8),** driven off the fandom's full work-id set vs current selection:
- all selected → `deselectAllInFandom(selectedWorkIds, fandomWorkIds)` (new pure helper; existing functions untouched);
- none or partial → `selectAllInFandom(selectedWorkIds, fandomWorkIds)` (existing; additive, cap-respecting; truncation announced via the shared `role="status"` region).

**Filter interaction:** the header always acts on the fandom's *full* work set (from `groupWorksByFandom`), not the filter-visible subset — matches shipped `selectAllInFandom` semantics. Empty groups (all options filtered out) are auto-hidden by MUI, so their header disappears too.

**Accessibility risk — flagged, not assumed:** a clickable control inside a listbox/combobox popup deviates from the strict WAI-ARIA combobox pattern (arrow-key roving focus does not naturally land on a header `<button>`). Mitigation + verification in §11.

---

## 6. Chips (`renderValue`) with accessible delete

```tsx
const renderChips = (value, getItemProps) =>
  value.map((option, index) => {
    const { key, onDelete, ...itemProps } = getItemProps({ index });
    return (
      <Chip
        key={key}
        {...itemProps}
        label={option.title}
        onDelete={onDelete}
        deleteIcon={<CloseIcon aria-hidden />}
        slotProps={{ deleteIcon: { 'aria-label': `Remove ${option.title}` } }}
        sx={chipSx}
      />
    );
  });
```

- `getItemProps({ index })` supplies `onDelete`, `key`, `disabled`, `tabIndex`, `data-item-index` (v9 API).
- **MUI's chip delete icon has no reliable accessible name out of the box** — we set `aria-label="Remove {title}"`. Verify with axe + a name assertion (§11).
- Keyboard: MUI focuses chips and deletes on Backspace/Delete when focused — verify.

---

## 7. Token theming (follow the DateRangeSlider precedent)

MUI takes no Tailwind classes, so — exactly as `DateRangeSlider` does — resolve real hex tokens via `useChartColors()` and pass them through `sx`, not CSS custom properties (emotion's cache doesn't reliably re-resolve custom props). Reuse the `hexToRgba` accent-ring-at-15% pattern from `DateRangeSlider.tsx`.

- Field/input: `--color-card` bg, `--color-ink` 20% border, `--color-accent` border + 3px accent/15% ring on focus (MASTER.md `.input`).
- Chips: `--color-ink` text on a subtle `--color-ink` low-opacity fill; delete icon inherits ink; visible accent focus ring.
- Popup/options: `--color-card` bg, `--color-ink` text; hover/selected uses border/weight + a check indicator (not color alone). Group header: `--color-ink-soft` label + `--font-display` per MASTER.md.
- Titles use `--font-sans` (mono reserved for figures).

---

## 8. Layout: the controls island

In `WorkComparisonSection.tsx`, replace the two stacked siblings (picker, slider) with one bordered card:

```tsx
<div className="flex flex-col gap-3 rounded-lg border border-ink/12 bg-card p-6">
  <div className="flex flex-col gap-6 md:flex-row md:items-start">
    <div className="md:flex-1"><WorkPicker .../></div>
    <div className="md:w-72 md:shrink-0"><DateRangeSlider .../></div>
  </div>
</div>
```

- Side-by-side at `md`+, stacked below. When `DateRangeSlider` returns `null` (≤2 union points) the picker fills the row — no empty column.
- Keeps the existing `<h2>Compare works</h2>` above the island and the leadIn caption below the charts, unchanged.
- `WorkPicker`'s own outer `<fieldset>` border is removed (the island provides the surround); its label semantics move to the Autocomplete's `TextField` label ("Works to compare").

---

## 9. Frontend design (against MASTER.md tokens)

Extends the existing snapshot (not a new page).

- **Card/island:** MASTER.md `.card` — `--color-card`, `--surface-border` (1px `--color-ink` @12%), 8px radius, 24px pad, flat (no shadow).
- **Input/field:** MASTER.md `.input` — `--color-card`, `--color-ink` @20% border, 16px min font (iOS no-zoom), focus = `--color-accent` border + 3px accent@15% ring. Resolved via `useChartColors()`.
- **Focus:** every interactive element (field, chips, chip-delete, option rows, fandom-header button) gets the visible `--color-accent` ring.
- **No color-alone differentiation:** selected option rows and the fandom tri-state indicator use shape/check/weight + text.
- **Motion:** color/border transitions only (150–300ms), no transforms.
- **Icons:** SVG only (Heroicons close icon), never emoji.
- MASTER.md's "Grouped picker pattern" section is rewritten to describe this component (task list) so the snapshot stops documenting a removed control.

---

## 10. Data model (backend)

**N/A — confirmed.** No schema, GraphQL, model, or query change. `perWorkSeries` (incl. the `", "`-joined `fandoms` string) and `groupWorksByFandom` are reused unchanged. Selection/range state now lives in a browser-local persisted Zustand store (§2), not `useState` and not the backend.

---

## 11. Happy path, corner cases, error states, accessibility

### Happy path
1. Author lands on the dashboard; the comparison island shows the works field beside the date-range slider (if >2 union dates), above Hits and Kudos charts. Selection is whatever the store restored for this username (first work preselected on a first visit).
2. Author clicks the field → grouped popup opens (fandom subsection headers, works under each).
3. Author types part of a title or fandom name → options and their group headers filter live.
4. Author clicks works → each becomes a removable chip; charts + slider gating update; the selection is written to the store and persisted.
5. Author clicks a fandom header → all works in that fandom are added (or removed if all were already selected).
6. Author clicks a chip's "x" (or focuses it, presses Backspace) → that work is removed without opening the popup.
7. Author reloads / returns later → the store restores the same selection and window (reconciled against currently-available works).

### Corner cases (deviations, not errors)
- **Multi-fandom work:** appears under each fandom; toggling any appearance or its single chip toggles the one work.
- **Empty-fandom work:** grouped under "No fandom" (existing `NO_FANDOM_LABEL`).
- **At cap (10 selected):** unselected options disabled (`aria-disabled`); selected options/chips still removable; cap announced.
- **Select-all exceeding cap:** adds up to cap; "Added N of M works; 10-work maximum reached." announced.
- **Filter yields no matches:** MUI "No options" (themed); all group headers hidden.
- **Filter active + fandom-header click:** acts on the full fandom set.
- **Slider absent (≤2 union dates):** picker fills the island row.
- **Persistence reconciliations (see §2.3):** first-visit default; dangling restored ids filtered (empty → first work); `styleAssignment` rebuilt from restored order; stale restored range re-clamped to full domain.
- **Zero selected works:** placeholder shown; charts/caption behave as today.

### Error states
- **Malformed/empty points or fandoms:** handled upstream by `groupWorksByFandom`/`unionCapturedOnDates` as today (never throw).
- **localStorage unavailable/quota/corrupt persisted blob:** Zustand `persist` degrades to in-memory state (no throw); a corrupt/incompatible stored shape is treated like "no entry" → falls back to first-visit default. Assert the store never crashes the section on bad persisted data.
- **No async/network in these components** — nothing to retry; selection is synchronous local state.
- Backend: unchanged; nothing new to log.

### Accessibility (first-class — verify, don't assume)
- **Combobox pattern:** `Autocomplete` implements WAI-ARIA combobox; keyboard-operable out of the box.
- **Chip delete accessible name:** NOT reliable by default → set `aria-label="Remove {title}"`; verify via axe + name assertion; verify Backspace-on-focused-chip deletion.
- **Cap announcement:** keep the single shared `role="status"` polite live region (generic cap + truncation + `extraStatusMessage` merged), one region, not one-per-subcomponent.
- **Fandom-header button inside the listbox (flagged risk):** verify keyboard reachability/operability, a clear tri-state accessible name, and no break to arrow-key option navigation. Fallback: render the bulk-select control just outside the popup listbox per group if in-listbox exposure is poor. Confirm against axe e2e + manual SR pass.
- **Group membership announcement (flagged tradeoff):** the shipped nested-`fieldset`/`legend` announced fandom membership natively; a grouped combobox listbox announces it more weakly. Ensure option context/`renderGroup` labeling conveys fandom; document residual difference honestly; verify with a manual SR pass.
- **Contrast / reduced motion / focus visibility / no color-alone / SVG-not-emoji:** all covered by §9 with existing verified tokens.

---

## 12. Task list (Testing → Implementation, one commit per item)

> This environment's Planning agent has no TaskCreate tool; this itemized list is the durable task artifact for stages 3–4 and is mirrored in the handoff message.

### Testing (stage 3 — red first; `test:` commits)
- **T1** Rewrite `WorkPicker.test.tsx` for the combobox: labeled field "Works to compare"; opening shows grouped options; `selectedWorkIds` render as chips; clicking an option adds via `addWork` semantics; clicking a selected option/chip "x" removes it.
- **T2** WorkPicker fandom-header tests: header selects all additively; header on a fully-selected fandom deselects all; partial fills to 100%; truncation announced when a select-all exceeds cap.
- **T3** WorkPicker multi-fandom tests: option under each fandom; toggling any appearance toggles the one work; exactly one chip per selected work.
- **T4** WorkPicker cap tests: at 10, unselected options `aria-disabled`; selected still removable; `role="status"` announces cap; no cap message under the cap.
- **T5** WorkPicker filter tests: filters by title AND fandom name; empty-result state; header hidden for filtered-out fandoms.
- **T6** WorkPicker accessibility tests: chip delete named "Remove {title}" and deletes on Backspace; fandom-header button keyboard-operable with a tri-state accessible name; single `role="status"` region.
- **T7** `deselectAllInFandom` unit tests in `comparisonSelection.test.ts` (removes exactly the fandom's ids, preserves order of the rest, no-ops on absent ids, never touches other selections).
- **T8** **New `useWorkComparisonStore.test.ts`:** per-username isolation; `addWork`/`removeWork`/`selectAllInFandom`/`deselectAllInFandom` delegate to the pure functions (cap enforced, `SelectAllInFandomResult` surfaced); `setSelection`/`setRange`/`clearSelection`; localStorage persist round-trip (rehydrate after remount); default empty selection; resilient to a corrupt/absent persisted blob (falls back cleanly, no throw).
- **T9** Update `WorkComparisonSection.test.tsx` + `.regression.test.tsx`: (a) replace the ~19 checkbox/select-all interactions with combobox-driven equivalents (add a `selectWorkViaCombobox` helper); (b) assert the island layout renders picker + slider as siblings; (c) assert state is read from / written to the store (provide `username`; reset the store between tests); (d) persistence reconciliation cases from §2.3 (dangling restored ids filtered, empty → first work, stale range re-clamped, `styleAssignment` rebuilt, selection survives remount); (e) preserve all existing leadIn/caption/slider-gating assertions unchanged.
- **T10** Extend the Playwright axe e2e (`frontend/tests/accessibility.spec.ts`) to exercise the open combobox, chips, at-cap disabled state, and fandom-header in the populated dashboard (light + dark).

### Implementation (stage 4 — make green; `feat:`/`fix:` commits)
- **I1** Add pure `deselectAllInFandom` to `comparisonSelection.ts`; existing exports untouched. (T7)
- **I2** **Create `frontend/src/store/useWorkComparisonStore.ts`** following `useTokenStore.ts` conventions: `create()(persist(...))`, `byUsername` map, reads + semantic write actions that call the `comparisonSelection.ts` pure functions, `name: "ao3-stats-plus-work-comparison-store"`. (T8)
- **I3** Rebuild `WorkPicker.tsx` internals as the MUI `Autocomplete` combobox (WorkOption flattening, `groupBy`/`getOptionLabel`/`isOptionEqualToValue`/`getOptionDisabled`/`filterOptions`, `onChange` mapping `details.option` → `addWork`/`removeWork`, unchanged props contract + shared `role="status"`). (T1, T3, T4, T5)
- **I4** Implement `renderGroup` fandom-header tri-state bulk-select wired to `selectAllInFandom`/`deselectAllInFandom`. (T2, T6 header)
- **I5** Implement `renderValue` chips with accessible delete + keyboard delete. (T6 chip)
- **I6** Token theming via `useChartColors()` + `sx` (field/chips/popup/focus), reusing `hexToRgba`. (§9)
- **I7** **Rewire `WorkComparisonSection.tsx`:** read `selectedWorkIds`/`range` from the store; write via store actions; new `username` prop; persistence reconciliation + `styleAssignment` rebuild (§2.3); restructure to the side-by-side island; remove WorkPicker's outer fieldset border. Verify `effectiveRange`/`buildSeries`/leadIn/caption compute unchanged. (T9)
- **I8** **`DashboardPage.tsx`:** pass `username` to `WorkComparisonSection`.
- **I9** Rewrite `WorkPicker.stories.tsx` (and adjust `WorkComparisonSection.stories.tsx` if needed) for the combobox incl. at-cap + multi-fandom states; run Storybook a11y addon.
- **I10** Update `design-system/ao3-stats-plus/MASTER.md`: replace the "Grouped picker pattern" section with a "Multi-select combobox picker (chips + fandom subsections + tri-state bulk-select)" section (Autocomplete config, cap/disable, chip accessible-delete, filter-by-title+fandom, `sx`/`useChartColors` theming, controls-island layout). Note the state now lives in a persisted per-username store.

### Retrospective (stage 8 — evaluate against)
- **R1** Did the picker/state swap change any `comparisonSelection.ts`/leadIn/caption/slider behavior it shouldn't have?
- **R2** Did the fandom-header-in-listbox a11y risk resolve cleanly, or need the outside-the-popup fallback?
- **R3** Coverage of the rebuilt `WorkPicker` and the new store vs the 85% baseline.
- **R4** Is MASTER.md consistent with the shipped component + the store-backed state?
- **R5** Confirm the deferred bookmarks/comments/subscriptions work can build against the store interface (§2.1) with **no change** to it — the parallelization premise. If the metrics work later needs the interface changed, capture that as a design miss here.
- **R6** Persistence behaving in the wild: no dangling-id or stale-range surprises; graceful on corrupt/absent localStorage.

---

## 13. Files touched

| File | Change |
|---|---|
| `frontend/src/store/useWorkComparisonStore.ts` | **NEW** — persisted per-username selection/range store (contract in §2.1) |
| `frontend/src/store/useWorkComparisonStore.test.ts` | **NEW** — store unit tests (T8) |
| `frontend/src/components/WorkPicker.tsx` | Rebuilt internals (MUI Autocomplete); props contract unchanged |
| `frontend/src/components/WorkComparisonSection.tsx` | Store-backed state + `username` prop + reconciliation + island layout |
| `frontend/src/routes/DashboardPage.tsx` | Pass `username` to `WorkComparisonSection` |
| `frontend/src/lib/comparisonSelection.ts` | + pure `deselectAllInFandom` (existing fns untouched) |
| `frontend/src/lib/comparisonSelection.test.ts` | + `deselectAllInFandom` tests |
| `frontend/src/components/WorkPicker.test.tsx`, `WorkPicker.stories.tsx` | Rewritten for combobox |
| `frontend/src/components/WorkComparisonSection.test.tsx`, `.regression.test.tsx`, `WorkComparisonSection.stories.tsx` | Combobox + store + island + persistence |
| `frontend/tests/accessibility.spec.ts` | Combobox/chips/cap/header a11y e2e |
| `design-system/ao3-stats-plus/MASTER.md` | Replace grouped-picker section; note store-backed state |
| Unchanged | `groupWorksByFandom.ts`, `useChartColors.ts`, `seriesStyles.ts`, `DateRangeSlider.tsx`, `MultiSeriesTrendChart.tsx`, `useTokenStore.ts`, all backend |

---

## 14. Open questions for sign-off

1. **Component:** confirm `Autocomplete` (chip-input multi-select with type-to-filter) over the literal `Select` (no type-to-filter). Recommended: `Autocomplete`.
2. **Fandom-header semantics:** confirm "full fandom → deselect all; none/partial → select all remaining." (§0.4)
3. **Filter scope:** confirm filtering by both title and fandom name. (§0.5)
4. **New helper:** OK to add pure `deselectAllInFandom` to `comparisonSelection.ts` (existing functions untouched)?
5. **Fandom-header a11y fallback:** OK to fall back to a bulk-select control outside the popup listbox if the in-listbox button is poorly exposed? (§11)
6. **State store (revised):** confirm moving `selectedWorkIds` + `range` into a persisted per-username Zustand store (`useWorkComparisonStore`), and confirm the interface in §2.1 as the stable contract the deferred additional-metrics work will build against.
7. **Persistence scope:** confirm localStorage persistence per username (survives reloads/returns) is desired, vs session-only — and that reconciling dangling restored ids to the first work (§2.3 #2) is the wanted fallback.

**STATUS: CONFIRMED 2026-08-04.** Q1 (component) and Q7 (persistence scope) explicitly confirmed by the user via direct choice; Q2-Q6 accepted as recommended (presented to the user alongside Q1/Q7, no correction given). Proceeding to Testing.
