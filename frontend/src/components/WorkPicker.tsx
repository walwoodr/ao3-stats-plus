import { useState } from "react";
import Autocomplete, {
  createFilterOptions,
  type AutocompleteChangeDetails,
  type AutocompleteChangeReason,
  type AutocompleteRenderGroupParams,
  type AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete";
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

  const workOptions = flattenToWorkOptions(perWorkSeries);
  const fandomGroups = groupWorksByFandom(perWorkSeries);
  const selectedIds = new Set(selectedWorkIds);
  const atCap = selectedWorkIds.length >= MAX_SELECTED_WORKS;

  // One representative WorkOption per selected id (first appearance) -> one
  // chip per selected work, even for a multi-fandom work with two option
  // rows (§3).
  const selectedOptions = selectedWorkIds
    .map((id) => workOptions.find((option) => option.id === id))
    .filter((option): option is WorkOption => option !== undefined);

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

  function renderFandomGroup(params: AutocompleteRenderGroupParams) {
    const fandomGroup = fandomGroups.find((group) => group.fandom === params.group);
    const fandomWorkIds = fandomGroup?.works.map((work) => work.ao3WorkId) ?? [];
    const allSelected =
      fandomWorkIds.length > 0 && fandomWorkIds.every((id) => selectedIds.has(id));
    const someSelected = fandomWorkIds.some((id) => selectedIds.has(id));
    const triState: FandomTriState = allSelected ? "all" : someSelected ? "partial" : "none";
    const action = allSelected ? "Deselect all" : "Select all";

    return (
      <li key={params.key}>
        <div className="flex items-center gap-2 border-b border-ink/10 bg-card px-3 py-2">
          <TriStateIcon state={triState} color={colors.accent} />
          <span className="text-[10px] uppercase tracking-wide text-ink-soft">
            {triStateLabel(triState)}
          </span>
          <button
            type="button"
            onClick={() => handleFandomHeaderClick(fandomWorkIds)}
            className="ml-auto rounded text-xs font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {`${action} in ${params.group}`}
          </button>
        </div>
        <ul className="m-0 list-none p-0">{params.children}</ul>
      </li>
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
        options={workOptions}
        value={selectedOptions}
        groupBy={(option) => option.fandom}
        getOptionLabel={(option) => option.title}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        getOptionDisabled={(option) => atCap && !selectedIds.has(option.id)}
        filterOptions={filterWorkOptions}
        onChange={handleAutocompleteChange}
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
