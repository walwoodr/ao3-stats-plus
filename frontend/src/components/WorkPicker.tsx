import { useMemo, useRef, useState } from "react";
import Autocomplete, {
  createFilterOptions,
  type AutocompleteChangeDetails,
  type AutocompleteChangeReason,
  type AutocompleteRenderGroupParams,
  type AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Paper, { type PaperProps } from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import type { PerWorkSeries } from "../queries/useStatsForUser";
import { groupWorksByFandom } from "../lib/groupWorksByFandom";
import {
  MAX_SELECTED_WORKS,
  addWork,
  deselectAllInFandom,
  removeWork,
  selectAllInFandom,
} from "../lib/comparisonSelection";
import { useChartColors } from "../lib/useChartColors";
import type { ColorTokens } from "../lib/colorTokens";

// Lets `slotProps.paper` carry a real, typed `bulkSelectBar` prop through to
// BulkSelectPaper below (MUI's documented extension point for this - see
// AutocompletePaperSlotPropsOverrides in Autocomplete.d.ts).
declare module "@mui/material/Autocomplete" {
  interface AutocompletePaperSlotPropsOverrides {
    bulkSelectBar?: React.ReactNode;
  }
}

// Custom `paper` slot: a thin wrapper around MUI's own Paper that injects
// the bulk-select bar as a real DOM sibling of the listbox <ul>, not a
// descendant - see renderFandomGroup/renderBulkSelectBar's comments in
// WorkPicker below for why a real button can't live inside
// <ul role="listbox"> at all.
//
// Deliberately defined at MODULE level (not inside WorkPicker) and reading
// its content via a plain prop, not a closure: `slots.paper` becomes the
// Autocomplete popup's element type, and a component defined fresh inside
// WorkPicker's own render body would get a NEW function identity every
// render - a NEW component type to React, which unmounts and remounts the
// entire popup (listbox, all options, the bar itself) on every single
// state change. That's disruptive on its own, and in practice meant the
// bulk-select button could vanish mid-interaction (confirmed via a live
// keyboard-walkthrough e2e run: selecting an option, which updates
// WorkPicker's own state, was enough to unmount the button before a
// subsequent `.focus()` could find it). A module-level component only
// exists once, ever, so `slots={{ paper: BulkSelectPaper }}` is the exact
// same reference on every WorkPicker render.
function BulkSelectPaper({
  bulkSelectBar,
  children,
  ...paperProps
}: PaperProps & { bulkSelectBar?: React.ReactNode }) {
  return (
    <Paper {...paperProps}>
      {bulkSelectBar}
      {children}
    </Paper>
  );
}

export interface WorkPickerProps {
  perWorkSeries: PerWorkSeries[];
  selectedWorkIds: number[];
  onChange: (selectedWorkIds: number[]) => void;
  // An additional message merged into this component's OWN role="status"
  // live region (rather than WorkComparisonSection rendering a second,
  // separate region) - keeps exactly one status region in the combined
  // tree, e.g. for the "Comparing N works, START to END." summary
  // announcement (see WorkComparisonSection.tsx). Undefined/omitted by
  // every WorkPicker-only test, so default behavior is unaffected.
  extraStatusMessage?: string;
}

// One option per (work x fandom) appearance (plan §3): MUI's `groupBy` can
// only place an option in ONE group, but a multi-fandom work must appear
// under each of its fandoms (matching the shipped checkbox UI's behavior).
// groupWorksByFandom's contiguous per-fandom groups keep this pre-sorted by
// group, which MUI's `groupBy` requires.
interface WorkOption {
  id: number;
  title: string;
  fandom: string;
}

function flattenToWorkOptions(perWorkSeries: PerWorkSeries[]): WorkOption[] {
  return groupWorksByFandom(perWorkSeries).flatMap((group) =>
    group.works.map((work) => ({ id: work.ao3WorkId, title: work.title, fandom: group.fandom })),
  );
}

// Converts a `#rrggbb` hex into an rgba() string at the given alpha - same
// approach as DateRangeSlider.tsx: MUI's `sx` needs a real color value, not
// a CSS `color-mix()` custom property.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Hand-rolled inline "x" glyph - no icon library is installed/approved in
// this project (plan §9's 2026-08-04 correction), so this follows
// markerShapes.tsx's existing bare-SVG-primitive pattern instead of adding
// one. The accessible name is set directly on this element (`aria-label`);
// MUI's Chip clones this element to attach its own `onClick`/`className`
// (verified against the installed Chip.js - only those two props are
// overridden), so - unlike a library icon component that forwards ...rest
// props automatically - this must explicitly spread them onto the real
// <svg> itself, or the cloned onClick silently never reaches the DOM.
function CloseIcon({
  "aria-label": ariaLabel,
  ...rest
}: { "aria-label": string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-label={ariaLabel} role="img" {...rest}>
      <line x1={3} y1={3} x2={13} y2={13} stroke="currentColor" strokeWidth={1.5} />
      <line x1={13} y1={3} x2={3} y2={13} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

// Hand-rolled check glyph for selected option rows - shape (not color
// alone) is what signals "selected" (MASTER.md's no-color-alone rule).
function CheckIcon({ color }: { color: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <polyline points="2,7 5.5,10.5 12,3" fill="none" stroke={color} strokeWidth={1.75} />
    </svg>
  );
}

type FandomTriState = "none" | "partial" | "all";

// The fandom-header tri-state indicator (plan §5/§0.6): distinct icon shape
// per state (empty box / dash / check) PLUS a text label - never color
// alone, echoing CheckIcon's shape-based selected-row treatment.
function TriStateIcon({ state, color }: { state: FandomTriState; color: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <rect
        x={1}
        y={1}
        width={12}
        height={12}
        rx={2}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      {state === "all" && (
        <polyline points="3,7 6,10 11,4" fill="none" stroke={color} strokeWidth={1.5} />
      )}
      {state === "partial" && (
        <line x1={3} y1={7} x2={11} y2={7} stroke={color} strokeWidth={1.5} />
      )}
    </svg>
  );
}

function triStateLabel(state: FandomTriState): string {
  if (state === "all") return "All selected";
  if (state === "partial") return "Some selected";
  return "None selected";
}

// Shared by the in-listbox header label and the bulk-select bar's buttons
// (requirement 8/§5) - a fandom is "all" only once every one of its works is
// selected, "partial" if some but not all are, else "none".
function fandomTriState(fandomWorkIds: number[], selectedIds: Set<number>): FandomTriState {
  const allSelected = fandomWorkIds.length > 0 && fandomWorkIds.every((id) => selectedIds.has(id));
  if (allSelected) return "all";
  return fandomWorkIds.some((id) => selectedIds.has(id)) ? "partial" : "none";
}

// Matches title AND fandom name (§0.5): because options are grouped by
// fandom, typing a fandom name should keep that whole group visible rather
// than confusingly emptying the list.
const filterWorkOptions = createFilterOptions<WorkOption>({
  stringify: (option) => `${option.title} ${option.fandom}`,
});

function inputSx(colors: ColorTokens) {
  return {
    "& .MuiOutlinedInput-root": {
      backgroundColor: colors.card,
      fontFamily: "var(--font-sans)",
      fontSize: 16,
      "& fieldset": { borderColor: hexToRgba(colors.ink, 0.2) },
      "&:hover fieldset": { borderColor: hexToRgba(colors.ink, 0.2) },
      "&.Mui-focused fieldset": {
        borderColor: colors.accent,
        borderWidth: "1px",
        boxShadow: `0 0 0 3px ${hexToRgba(colors.accent, 0.15)}`,
      },
    },
    "& .MuiInputLabel-root": { fontFamily: "var(--font-display)", color: colors.inkSoft },
    "& .MuiInputLabel-root.Mui-focused": { color: colors.accent },
    "& input": { color: colors.ink },
  };
}

function paperSx(colors: ColorTokens) {
  return {
    backgroundColor: colors.card,
    color: colors.ink,
    "& .MuiAutocomplete-noOptions": { color: colors.inkSoft, fontFamily: "var(--font-sans)" },
  };
}

// Grouped-by-fandom Autocomplete combobox picker (plan §0.1-§0.6): a
// controlled component (props unchanged from the shipped checkbox picker -
// `perWorkSeries`, `selectedWorkIds`, `onChange`, `extraStatusMessage`), it
// owns no selection state itself, just renders `selectedWorkIds` as chips
// and reports every change via `onChange`. The real selection state lives
// one level up, in WorkComparisonSection (backed by the persisted
// useWorkComparisonStore). The one piece of genuinely local state is the
// cap-truncation announcement text, an ephemeral reaction to the LAST
// select-all click rather than something derivable from props alone.
export function WorkPicker({
  perWorkSeries,
  selectedWorkIds,
  onChange,
  extraStatusMessage,
}: WorkPickerProps) {
  const colors = useChartColors();
  const [truncationMessage, setTruncationMessage] = useState<string | null>(null);
  // Mirrors the Autocomplete's own filter text (controlled `inputValue`)
  // purely so the bulk-select bar below can compute which fandom groups are
  // CURRENTLY visible after type-to-filter - see the bulk-select-bar
  // comment for why this can't just read MUI's internal filtered state.
  const [inputValue, setInputValue] = useState("");
  // Controlled `open` + a ref to the bulk-select bar's own DOM node - see
  // the Autocomplete's `onClose` handler below for why: MUI's own "keep the
  // popup open when focus moves to something else inside it"
  // (`unstable_isActiveElementInListbox`/`handleBlur` in useAutocomplete.js)
  // is scoped to the listbox itself, and empirically (confirmed via a live
  // e2e run instrumenting real focus/blur/focusout events) does NOT
  // reliably keep the popup open when focus moves via a genuine
  // programmatic `.focus()` to a real, tabbable element that's a DOM
  // SIBLING of the listbox rather than a descendant - which the bulk-select
  // bar now is (see BulkSelectPaper/renderFandomGroup's comments for why it
  // has to be a sibling, not nested inside <ul role="listbox">). Taking
  // `open` under our own control lets WorkPicker override that specific
  // "blur" close request when the new focus target is inside the bar.
  const [open, setOpen] = useState(false);
  const bulkSelectBarRef = useRef<HTMLDivElement | null>(null);

  // Memoized (not just recomputed inline) so `workOptions`/`selectedOptions`
  // keep a STABLE reference across re-renders that don't actually change
  // `perWorkSeries`/`selectedWorkIds` - e.g. the ones triggered by typing in
  // the combobox (`inputValue` state, below). Autocomplete's own
  // useAutocomplete has an internal effect that resets its input text
  // whenever its `value` prop's REFERENCE changes (`previousProps.value !==
  // value`); a fresh, unmemoized `.map().filter()` array every render was
  // tripping that on every keystroke, immediately clearing whatever had
  // just been typed - confirmed live via useAutocomplete.js's
  // `resetInputValue` effect and reproduced with a debug WorkPicker render.
  const workOptions = useMemo(() => flattenToWorkOptions(perWorkSeries), [perWorkSeries]);
  const fandomGroups = useMemo(() => groupWorksByFandom(perWorkSeries), [perWorkSeries]);
  const selectedIds = new Set(selectedWorkIds);
  const atCap = selectedWorkIds.length >= MAX_SELECTED_WORKS;

  // Re-runs the exact same filterWorkOptions instance the Autocomplete uses
  // internally (§0.5's title+fandom stringify), so the set of fandoms shown
  // here always matches what's actually visible in the popup - including
  // while the user is typing a filter.
  const visibleWorkOptions = filterWorkOptions(workOptions, {
    inputValue,
    getOptionLabel: (option) => option.title,
  });
  const visibleFandoms = Array.from(new Set(visibleWorkOptions.map((option) => option.fandom)));
  const visibleFandomGroups = visibleFandoms.map((fandom) => {
    const group = fandomGroups.find((candidate) => candidate.fandom === fandom);
    return { fandom, workIds: group?.works.map((work) => work.ao3WorkId) ?? [] };
  });

  // One representative WorkOption per selected id (first appearance) -> one
  // chip per selected work, even for a multi-fandom work with two option
  // rows (§3). Memoized for the same reference-stability reason as
  // `workOptions` above - this is exactly what's passed as Autocomplete's
  // `value` prop.
  const selectedOptions = useMemo(
    () =>
      selectedWorkIds
        .map((id) => workOptions.find((option) => option.id === id))
        .filter((option): option is WorkOption => option !== undefined),
    [selectedWorkIds, workOptions],
  );

  const genericCapMessage = atCap ? "Maximum of 10 works reached." : "";
  const statusText = [genericCapMessage, truncationMessage, extraStatusMessage]
    .filter(Boolean)
    .join(" ");

  function commitSelection(nextSelectedWorkIds: number[]) {
    setTruncationMessage(null);
    onChange(nextSelectedWorkIds);
  }

  // Does NOT trust MUI's diffed value array (§3) - reads `reason`/`details`
  // and maps `details.option.id` through the pure addWork/removeWork so
  // selection semantics stay entirely in comparisonSelection.ts.
  function handleAutocompleteChange(
    _event: React.SyntheticEvent,
    _value: WorkOption[],
    reason: AutocompleteChangeReason,
    details?: AutocompleteChangeDetails<WorkOption>,
  ) {
    if (reason === "selectOption" && details) {
      commitSelection(addWork(selectedWorkIds, details.option.id));
    } else if (reason === "removeOption" && details) {
      commitSelection(removeWork(selectedWorkIds, details.option.id));
    } else if (reason === "clear") {
      commitSelection([]);
    }
  }

  // Fandom-header tri-state semantics (requirement 8, §0.4/§5): a fully-
  // selected fandom deselects all of it; none/partial fills to 100%
  // (additive, cap-respecting). Always acts on the fandom's FULL work set
  // (from groupWorksByFandom), not the filter-visible subset - matches
  // shipped selectAllInFandom semantics.
  function handleFandomHeaderClick(fandomWorkIds: number[]) {
    const allSelected =
      fandomWorkIds.length > 0 && fandomWorkIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      setTruncationMessage(null);
      onChange(deselectAllInFandom(selectedWorkIds, fandomWorkIds));
      return;
    }

    // Distinguishes a real cap truncation (fewer added than newly
    // requested, because room ran out) from ordinary de-dup (fewer added
    // because some were already selected via an overlapping fandom) - only
    // the former gets the "N of M" truncation announcement.
    const alreadySelected = new Set(selectedWorkIds);
    const uniqueNewCount = fandomWorkIds.filter((id) => !alreadySelected.has(id)).length;
    const result = selectAllInFandom(selectedWorkIds, fandomWorkIds);
    const cappedOut = result.addedCount < uniqueNewCount;

    setTruncationMessage(
      cappedOut
        ? `Added ${result.addedCount} of ${result.requestedCount} works; 10-work maximum reached.`
        : null,
    );
    onChange(result.selectedIds);
  }

  // Header content ONLY (tri-state icon + fandom name + state label) - no
  // clickable control. §11's documented fallback ("render the bulk-select
  // control just outside the popup listbox per group") turned out to be a
  // hard requirement, not just an option: axe-core's aria-required-children
  // check for role="listbox" (requiredOwned ["group","option"]) walks
  // THROUGH role="group" descendants looking for real content (so nested
  // "group" boundaries don't hide anything from it - see getOwnedRoles in
  // axe-core/axe.js), and ANY focusable/role-bearing element it finds along
  // the way - like a real <button> - gets recorded as an "owned role" of
  // the listbox itself. Since "button" is never in listbox's allowed
  // owned-roles set, a real button ANYWHERE inside <ul role="listbox">
  // (however deeply wrapped in role="presentation"/role="group" layers)
  // always fails this rule. The actual "Select all"/"Deselect all" button
  // now lives in the bulk-select bar rendered by BulkSelectPaper below,
  // which is a DOM sibling of the listbox <ul>, not a descendant.
  function renderFandomGroup(params: AutocompleteRenderGroupParams) {
    const fandomGroup = fandomGroups.find((group) => group.fandom === params.group);
    const fandomWorkIds = fandomGroup?.works.map((work) => work.ao3WorkId) ?? [];
    const triState = fandomTriState(fandomWorkIds, selectedIds);

    return (
      // A <div>, NOT an <li>, wraps this group (MUI's own defaultRenderGroup,
      // Autocomplete.js, uses a role-less <li> here, which is a genuine MUI/
      // axe gap, not something safe to copy): the wrapper needs role="group"
      // for axe's aria-required-parent walk (getMissingContext) to treat it
      // as a valid ancestor for the option rows nested inside (a plain
      // wrapper - no role at all - would be "skipped" by that walk, same as
      // role="presentation" below, which would also work structurally, but
      // <li> specifically DISALLOWS role="group": axe-core's ARIA-in-HTML
      // `allowedRoles` table for `li` only permits
      // menuitem/menuitemcheckbox/menuitemradio/option/none/presentation/
      // radio/separator/tab/treeitem - "group" isn't in that list, so
      // `<li role="group">` fails the separate "aria-allowed-role" rule.
      // `<div>` allows any role, so it's used here instead. aria-label
      // names the group for AT users navigating by role, same as the
      // fandom name already in the visible header text.
      <div key={params.key} role="group" aria-label={params.group}>
        <div className="flex items-center gap-2 border-b border-ink/10 bg-card px-3 py-2">
          <TriStateIcon state={triState} color={colors.accent} />
          <span className="text-xs font-semibold text-ink">{params.group}</span>
          <span className="text-[10px] uppercase tracking-wide text-ink-soft">
            {triStateLabel(triState)}
          </span>
        </div>
        {/* role="presentation" neutralizes this <ul>'s implicit "list"
            role, so axe's aria-required-parent walk treats it as "no
            role" and continues up to the role="group" <div> above rather
            than stopping here - and (like the <div> above) explicit role
            attributes remove it from axe's "list" rule selector too. */}
        <ul role="presentation" className="m-0 list-none p-0">
          {params.children}
        </ul>
      </div>
    );
  }

  // Real per-fandom "Select all"/"Deselect all" buttons, rendered as a bar
  // ABOVE the popup's listbox (via BulkSelectPaper) rather than inside it -
  // see renderFandomGroup's comment for why a real button can't live inside
  // <ul role="listbox"> at all. Scoped to `visibleFandomGroups` so a
  // fandom's control disappears once type-to-filter hides all its works,
  // matching the prior in-listbox behavior.
  function renderBulkSelectBar() {
    if (visibleFandomGroups.length === 0) return null;
    return (
      <div
        ref={bulkSelectBarRef}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink/10 bg-card px-3 py-2"
        // Mirrors useAutocomplete's own getListboxProps `onMouseDown`
        // (useAutocomplete.js): without this, a mousedown here blurs the
        // combobox input before the click completes, which MUI reads as
        // focus leaving the popup entirely (this bar is now a DOM sibling
        // of <ul role="listbox">, not a descendant, so MUI's own
        // "is the new focus target inside the listbox" check doesn't
        // recognize it) - closing the popup and unmounting the button
        // mid-click, so onClick never fires.
        onMouseDown={(event) => event.preventDefault()}
      >
        {visibleFandomGroups.map(({ fandom, workIds }) => {
          const action =
            fandomTriState(workIds, selectedIds) === "all" ? "Deselect all" : "Select all";
          return (
            <button
              key={fandom}
              type="button"
              onClick={() => handleFandomHeaderClick(workIds)}
              className="rounded text-xs font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {`${action} in ${fandom}`}
            </button>
          );
        })}
      </div>
    );
  }

  function renderChips(
    value: WorkOption[],
    getItemProps: (params: { index: number }) => Record<string, unknown>,
  ) {
    return value.map((option, index) => {
      const { key, onDelete, ...itemProps } = getItemProps({ index }) as {
        key: number;
        onDelete: (event: unknown) => void;
      } & Record<string, unknown>;
      return (
        <Chip
          key={key}
          {...itemProps}
          label={option.title}
          onDelete={onDelete}
          deleteIcon={<CloseIcon aria-label={`Remove ${option.title}`} />}
          sx={{
            backgroundColor: hexToRgba(colors.ink, 0.08),
            color: colors.ink,
            fontFamily: "var(--font-sans)",
            "& .MuiChip-deleteIcon": { color: colors.ink },
            "&:focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: 1 },
          }}
        />
      );
    });
  }

  function renderOptionRow(
    props: React.HTMLAttributes<HTMLLIElement> & { key: React.Key },
    option: WorkOption,
    state: { selected: boolean },
  ) {
    const { key, ...rest } = props;
    return (
      <li
        key={key}
        {...rest}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm text-ink aria-disabled:opacity-40 ${
          state.selected ? "font-semibold" : "font-normal"
        }`}
      >
        <span className="w-3.5 shrink-0">
          {state.selected && <CheckIcon color={colors.accent} />}
        </span>
        {option.title}
      </li>
    );
  }

  function renderThemedInput(params: AutocompleteRenderInputParams) {
    return (
      <TextField
        {...params}
        label="Works to compare"
        placeholder="Search title or fandom"
        sx={inputSx(colors)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="status" aria-live="polite" className="sr-only">
        {statusText}
      </div>

      <Autocomplete<WorkOption, true, false, false>
        multiple
        disableCloseOnSelect
        // Without this, the popup renders via a React portal appended to
        // document.body - outside any landmark region - which axe's
        // "region" rule (WCAG best-practice: all content must be
        // contained by a landmark) correctly flags. Rendering in place
        // keeps the popup inside this component's own DOM position (still
        // absolutely positioned via Popper, so it still floats visually);
        // no overflow:hidden ancestor in the comparison island to clip it.
        disablePortal
        // Controlled (`open`/`onOpen`/`onClose`) so a "blur" close request
        // can be overridden specifically when focus has moved into the
        // bulk-select bar - see the `open` state's declaration comment
        // above for why MUI's own built-in handling of this isn't enough
        // once the bar is a listbox sibling rather than a descendant.
        open={open}
        onOpen={() => setOpen(true)}
        onClose={(event, reason) => {
          // Reads `relatedTarget` (the element ABOUT TO gain focus, per the
          // native FocusEvent spec), NOT `document.activeElement`:
          // `document.activeElement` is unreliable mid-blur - browsers run
          // an intermediate "unfocus" step that (at least in Chromium)
          // transiently sets it to <body> BEFORE the new element actually
          // receives focus, so reading it inside this handler (which fires
          // synchronously off the input's blur) can see <body> even though
          // focus is, a moment later, genuinely landing on the bulk-select
          // bar - confirmed via a live e2e run instrumenting both. MUI
          // forwards the original blur SyntheticEvent through unchanged
          // (handleBlur -> handleClose -> onClose in useAutocomplete.js).
          const relatedTarget = (event as unknown as React.FocusEvent).relatedTarget;
          if (
            reason === "blur" &&
            relatedTarget instanceof Node &&
            bulkSelectBarRef.current?.contains(relatedTarget)
          ) {
            return;
          }
          setOpen(false);
        }}
        options={workOptions}
        value={selectedOptions}
        groupBy={(option) => option.fandom}
        getOptionLabel={(option) => option.title}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        getOptionDisabled={(option) => atCap && !selectedIds.has(option.id)}
        filterOptions={filterWorkOptions}
        inputValue={inputValue}
        onInputChange={(_event, value) => setInputValue(value)}
        onChange={handleAutocompleteChange}
        renderGroup={renderFandomGroup}
        renderValue={renderChips}
        renderInput={renderThemedInput}
        renderOption={renderOptionRow}
        sx={{ width: "100%" }}
        slots={{ paper: BulkSelectPaper }}
        slotProps={{
          paper: { sx: paperSx(colors), bulkSelectBar: renderBulkSelectBar() },
        }}
      />
    </div>
  );
}
