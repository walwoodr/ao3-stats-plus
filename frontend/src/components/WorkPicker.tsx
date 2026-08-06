import { useMemo, useState } from "react";
import Autocomplete, {
  createFilterOptions,
  type AutocompleteChangeDetails,
  type AutocompleteChangeReason,
  type AutocompleteRenderGroupParams,
  type AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete";
import type { FilterOptionsState } from "@mui/material/useAutocomplete";
import Chip from "@mui/material/Chip";
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

export interface WorkPickerProps {
  perWorkSeries: PerWorkSeries[];
  selectedWorkIds: number[];
  onChange: (selectedWorkIds: number[]) => void;
  // An additional message merged into this component's OWN role="status"
  // live region (rather than WorkComparisonSection rendering a second one)
  // - keeps exactly one status region in the combined tree, e.g. for the
  // "Comparing N works, START to END." summary (see WorkComparisonSection.tsx).
  extraStatusMessage?: string;
}

// One option per (work x fandom) appearance, PLUS a synthetic "header"
// option per fandom group (docs/plans/work-comparison-picker-refinements.md
// §1 - the load-bearing decision): a header rendered OUTSIDE MUI's tracked
// `options` array would have no `data-option-index`/`tabIndex` and be
// invisible to arrow-key roving highlight (verified against
// useAutocomplete.js's `validOptionIndex`/`getOptionProps`). A tracked
// option (kind: "header") gets full keyboard + click parity for free, and
// satisfies axe's aria-required-children rule (role="option" is a legal
// listbox child; the old role="button" bar was not).
interface WorkOptionWork {
  kind: "work";
  id: number;
  title: string;
  fandom: string;
}
interface WorkOptionHeader {
  kind: "header";
  fandom: string;
  workIds: number[];
}
type WorkOption = WorkOptionWork | WorkOptionHeader;

// Builds, per fandom group (in groupWorksByFandom order): one header
// sentinel first, then that fandom's work options - contiguity per fandom
// is preserved, which MUI's `groupBy` requires (options pre-sorted by
// group).
function flattenToWorkOptions(perWorkSeries: PerWorkSeries[]): WorkOption[] {
  return groupWorksByFandom(perWorkSeries).flatMap((group) => {
    const workIds = group.works.map((work) => work.ao3WorkId);
    const header: WorkOption = { kind: "header", fandom: group.fandom, workIds };
    const works: WorkOption[] = group.works.map((work) => ({
      kind: "work",
      id: work.ao3WorkId,
      title: work.title,
      fandom: group.fandom,
    }));
    return [header, ...works];
  });
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
// this project, so this follows markerShapes.tsx's bare-SVG-primitive
// pattern. MUI's Chip clones this element to attach its own `onClick`/
// `className` (only those two props, verified against Chip.js) - unlike a
// library icon that forwards ...rest automatically, `rest` must be spread
// onto the real <svg> explicitly or the cloned onClick never reaches the DOM.
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

// Hand-rolled check glyph - shape (not color alone) signals "selected".
function CheckIcon({ color }: { color: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <polyline points="2,7 5.5,10.5 12,3" fill="none" stroke={color} strokeWidth={1.75} />
    </svg>
  );
}

type FandomTriState = "none" | "partial" | "all";

// Fandom-header tri-state indicator: distinct shape per state (empty box /
// dash / check) - shape, not color, carries the signal (recolored to
// colors.ink per requirement 2 at the call site).
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

// "all" only once every work is selected, "partial" if some but not all
// are, else "none".
function fandomTriState(fandomWorkIds: number[], selectedIds: Set<number>): FandomTriState {
  const allSelected = fandomWorkIds.length > 0 && fandomWorkIds.every((id) => selectedIds.has(id));
  if (allSelected) return "all";
  return fandomWorkIds.some((id) => selectedIds.has(id)) ? "partial" : "none";
}

// Requirement 6 + §Accessibility: removing the header's visible "None/Some/
// All selected" text means its status must reach screen readers some other
// way - this aria-label is that carrier (sighted users get the icon shape).
function headerAriaLabel(fandom: string, state: FandomTriState): string {
  if (state === "all") return `${fandom} — all works selected, activate to deselect all`;
  if (state === "partial")
    return `${fandom} — some works selected, activate to select all remaining`;
  return `${fandom} — no works selected, activate to select all`;
}

// Matches title AND fandom name (§0.5): typing a fandom name keeps that
// whole group visible rather than confusingly emptying the list. Runs over
// WORK options only - headers are re-derived around the results below (§1.3).
const filterWorkOptions = createFilterOptions<WorkOptionWork>({
  stringify: (option) => `${option.title} ${option.fandom}`,
});

// Custom filterOptions (§1.3): headers can't be stringify-matched like
// works, so this filters the WORK options through the matcher above, then
// rebuilds the array by re-emitting each fandom's header sentinel (already
// groupWorksByFandom-contiguous) immediately before its surviving works,
// only when at least one survives - auto-hiding a header whose fandom has
// no visible matches, matching the prior filtered-out-fandom behavior.
function filterWorkPickerOptions(
  options: WorkOption[],
  state: FilterOptionsState<WorkOption>,
): WorkOption[] {
  const headers = options.filter((option): option is WorkOptionHeader => option.kind === "header");
  const works = options.filter((option): option is WorkOptionWork => option.kind === "work");
  const filteredWorks = filterWorkOptions(works, {
    ...state,
    getOptionLabel: (option) => option.title,
  });

  const result: WorkOption[] = [];
  for (const header of headers) {
    const worksForFandom = filteredWorks.filter((work) => work.fandom === header.fandom);
    if (worksForFandom.length > 0) {
      result.push(header, ...worksForFandom);
    }
  }
  return result;
}

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
      // MUI's default clear indicator is only revealed on hover/focus
      // (visibility: hidden otherwise) - a discoverability regression for
      // anyone not currently hovering the field. "Clear all" (requirement
      // 4) should be a stable, always-visible affordance whenever there's
      // something to clear, not a hover-only one.
      "& .MuiAutocomplete-clearIndicator": { visibility: "visible" },
    },
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

// Grouped-by-fandom Autocomplete combobox picker (plan §0.1-§0.8): a
// controlled component (props unchanged - `perWorkSeries`,
// `selectedWorkIds`, `onChange`, `extraStatusMessage`), it owns no
// selection state itself, just renders `selectedWorkIds` as chips and
// reports every change via `onChange`. The real selection state lives one
// level up, in WorkComparisonSection (backed by the persisted
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
  const [inputValue, setInputValue] = useState("");

  // Memoized (not just recomputed inline) so `options`/`selectedOptions`
  // keep a STABLE reference across re-renders that don't actually change
  // `perWorkSeries`/`selectedWorkIds` - e.g. ones triggered by typing
  // (`inputValue` state, below). useAutocomplete resets its input text
  // whenever its `value` prop's REFERENCE changes; a fresh, unmemoized
  // array every render was tripping that on every keystroke, clearing
  // whatever had just been typed - confirmed live against the installed
  // useAutocomplete.js's `resetInputValue` effect.
  const options = useMemo(() => flattenToWorkOptions(perWorkSeries), [perWorkSeries]);
  const selectedIds = new Set(selectedWorkIds);
  const atCap = selectedWorkIds.length >= MAX_SELECTED_WORKS;

  // One representative work option per selected id (first appearance) -> one
  // chip per selected work, even for a multi-fandom work with two option
  // rows. Never includes a header. Memoized for the same reference-
  // stability reason as `options` above - this is Autocomplete's `value`.
  const selectedOptions = useMemo(
    () =>
      selectedWorkIds
        .map((id) =>
          options.find(
            (option): option is WorkOptionWork => option.kind === "work" && option.id === id,
          ),
        )
        .filter((option): option is WorkOptionWork => option !== undefined),
    [selectedWorkIds, options],
  );

  const genericCapMessage = atCap ? "Maximum of 10 works reached." : "";
  const statusText = [genericCapMessage, truncationMessage, extraStatusMessage]
    .filter(Boolean)
    .join(" ");

  function commitSelection(nextSelectedWorkIds: number[]) {
    setTruncationMessage(null);
    onChange(nextSelectedWorkIds);
  }

  // Does NOT trust MUI's diffed value array - reads `reason`/`details` and
  // routes on `details.option.kind`: a header routes to the existing
  // handleFandomHeaderClick (bulk-toggle, unchanged); a work routes
  // through the pure addWork/removeWork. `value` never contains a header,
  // so MUI reconciles back to `selectedOptions` exactly as it does today.
  function handleAutocompleteChange(
    _event: React.SyntheticEvent,
    _value: WorkOption[],
    reason: AutocompleteChangeReason,
    details?: AutocompleteChangeDetails<WorkOption>,
  ) {
    if (reason === "selectOption" && details) {
      if (details.option.kind === "header") {
        handleFandomHeaderClick(details.option.workIds);
      } else {
        commitSelection(addWork(selectedWorkIds, details.option.id));
      }
    } else if (reason === "removeOption" && details && details.option.kind === "work") {
      commitSelection(removeWork(selectedWorkIds, details.option.id));
    } else if (reason === "clear") {
      commitSelection([]);
    }
  }

  // Fandom-header tri-state semantics (requirement 1/§5): a fully-selected
  // fandom deselects all of it; none/partial fills to 100% (additive,
  // cap-respecting). Always acts on the header's own FULL `workIds`, not
  // the filter-visible subset.
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

  // The group wrapper (§1.6/§6): still a <div role="group"> + inner
  // <ul role="presentation"> (axe's aria-required-parent walk needs both),
  // but no longer renders header markup itself - the tri-state icon +
  // fandom name now live in the group's first CHILD option (the header
  // branch of renderOptionRow below). `border-t first:border-t-0` here is
  // requirement 6's above-header divider.
  function renderFandomGroup(params: AutocompleteRenderGroupParams) {
    return (
      <div
        key={params.key}
        role="group"
        aria-label={params.group}
        className="border-t border-ink/10 first:border-t-0"
      >
        <ul role="presentation" className="m-0 list-none p-0">
          {params.children}
        </ul>
      </div>
    );
  }

  // `value` is typed as the broader WorkOption per MUI's signature, but a
  // header never enters `value` (§1.2) - the `kind` guard below is a type
  // narrowing, not a real runtime branch.
  function renderChips(
    value: WorkOption[],
    getItemProps: (params: { index: number }) => Record<string, unknown>,
  ) {
    return value.map((option, index) => {
      if (option.kind === "header") return null;
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

  // Branches on `option.kind` (§1.5): the header branch renders a real
  // role="option" row (via MUI's own `...rest`, which carries role,
  // data-option-index, tabIndex, onClick, aria-selected - the tracked-
  // option stamp); the work branch is the existing row with requirement 5
  // (no bold, accent tint) and requirement 8 (hover) applied.
  function renderOptionRow(
    props: React.HTMLAttributes<HTMLLIElement> & { key: React.Key },
    option: WorkOption,
    state: { selected: boolean },
  ) {
    const { key, ...rest } = props;

    if (option.kind === "header") {
      const triState = fandomTriState(option.workIds, selectedIds);
      return (
        <li
          key={key}
          {...rest}
          aria-label={headerAriaLabel(option.fandom, triState)}
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-ink hover:bg-ink/5 [&.Mui-focused]:bg-ink/5"
        >
          <TriStateIcon state={triState} color={colors.ink} />
          <span>{option.fandom}</span>
        </li>
      );
    }

    const hoverClasses = state.selected
      ? "hover:bg-accent/12 [&.Mui-focused]:bg-accent/12"
      : "hover:bg-ink/5 [&.Mui-focused]:bg-ink/5";

    return (
      <li
        key={key}
        {...rest}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-normal text-ink aria-disabled:opacity-40 ${
          state.selected ? "bg-accent/8" : ""
        } ${hoverClasses}`}
      >
        <span className="w-3.5 shrink-0">{state.selected && <CheckIcon color={colors.ink} />}</span>
        {option.title}
      </li>
    );
  }

  // Requirement 7: drops the MUI floating `label` entirely (and its
  // `.MuiInputLabel-root` animation) for a plain static `<span>` above the
  // field (rendered below, matching DateRangeSlider's pattern) -
  // `placeholder` stays as a plain HTML hint. A placeholder is NOT an
  // accessible name, so the name is re-established via `aria-labelledby`
  // to that span's id (merged into MUI's own htmlInput slot, not overwritten).
  function renderThemedInput(params: AutocompleteRenderInputParams) {
    return (
      <TextField
        {...params}
        placeholder="Search title or fandom"
        sx={inputSx(colors)}
        slotProps={{
          ...params.slotProps,
          htmlInput: { ...params.slotProps.htmlInput, "aria-labelledby": "work-picker-label" },
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="status" aria-live="polite" className="sr-only">
        {statusText}
      </div>

      <span id="work-picker-label" className="text-sm font-medium text-ink">
        Works to compare
      </span>

      <Autocomplete<WorkOption, true, false, false>
        multiple
        disableCloseOnSelect
        // Without this, the popup renders via a React portal appended to
        // document.body - outside any landmark region - which axe's
        // "region" rule correctly flags. Rendering in place keeps it
        // inside this component's own DOM position (still absolutely
        // positioned via Popper); no clipping ancestor in the island.
        disablePortal
        options={options}
        value={selectedOptions}
        groupBy={(option) => option.fandom}
        getOptionLabel={(option) => (option.kind === "header" ? option.fandom : option.title)}
        isOptionEqualToValue={(option, value) =>
          option.kind === "work" && value.kind === "work" && option.id === value.id
        }
        getOptionDisabled={(option) =>
          option.kind === "work" && atCap && !selectedIds.has(option.id)
        }
        filterOptions={filterWorkPickerOptions}
        inputValue={inputValue}
        onInputChange={(_event, value) => setInputValue(value)}
        onChange={handleAutocompleteChange}
        clearText="Clear all"
        renderGroup={renderFandomGroup}
        renderValue={renderChips}
        renderInput={renderThemedInput}
        renderOption={renderOptionRow}
        sx={{ width: "100%" }}
        slotProps={{ paper: { sx: paperSx(colors) } }}
      />
    </div>
  );
}
