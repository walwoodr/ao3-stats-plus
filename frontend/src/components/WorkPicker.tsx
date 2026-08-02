import { useState } from "react";
import type { PerWorkSeries } from "../queries/useStatsForUser";
import { groupWorksByFandom } from "../lib/groupWorksByFandom";
import {
  MAX_SELECTED_WORKS,
  addWork,
  removeWork,
  selectAllInFandom,
} from "../lib/comparisonSelection";

export interface WorkPickerProps {
  perWorkSeries: PerWorkSeries[];
  selectedWorkIds: number[];
  onChange: (selectedWorkIds: number[]) => void;
}

// Grouped-by-fandom checkbox picker (Q4: one shared, additive selection set
// - "select all in fandom" only ever adds to it, never replaces it). This is
// a controlled component: it owns no selection state itself, just renders
// `selectedWorkIds` and reports every change via `onChange` - the real
// state lives in WorkComparisonSection's useState (see the plan's "State
// management" section). The one piece of genuinely local state here is the
// cap-truncation announcement text, which is an ephemeral reaction to the
// LAST select-all click, not something derivable from props alone.
export function WorkPicker({ perWorkSeries, selectedWorkIds, onChange }: WorkPickerProps) {
  const [truncationMessage, setTruncationMessage] = useState<string | null>(null);
  const groups = groupWorksByFandom(perWorkSeries);
  const atCap = selectedWorkIds.length >= MAX_SELECTED_WORKS;
  const statusText = truncationMessage ?? (atCap ? "Maximum of 6 works reached." : "");

  function handleToggle(workId: number, checked: boolean) {
    setTruncationMessage(null);
    onChange(checked ? addWork(selectedWorkIds, workId) : removeWork(selectedWorkIds, workId));
  }

  // Distinguishes a real cap truncation (fewer works added than were newly
  // requested, because room ran out) from ordinary de-dup (fewer added
  // simply because some were already selected via an overlapping fandom) -
  // only the former gets the "N of M" truncation announcement (plan's
  // Corner Cases: "Select all in fandom that would exceed the cap").
  function handleSelectAll(fandomWorkIds: number[]) {
    const alreadySelected = new Set(selectedWorkIds);
    const uniqueNewCount = fandomWorkIds.filter((id) => !alreadySelected.has(id)).length;
    const result = selectAllInFandom(selectedWorkIds, fandomWorkIds);
    const cappedOut = result.addedCount < uniqueNewCount;

    setTruncationMessage(
      cappedOut
        ? `Added ${result.addedCount} of ${result.requestedCount} works; 6-work maximum reached.`
        : null,
    );
    onChange(result.selectedIds);
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-ink/12 bg-card p-6">
      <legend className="px-1 font-display text-base font-semibold text-ink">
        Works to compare
      </legend>

      <div role="status" aria-live="polite" className="sr-only">
        {statusText}
      </div>

      {groups.map((group) => (
        <fieldset
          key={group.fandom}
          className="flex flex-col gap-2 rounded-md border border-ink/12 p-4"
        >
          <legend className="px-1 text-sm font-medium text-ink">{group.fandom}</legend>
          <button
            type="button"
            onClick={() => handleSelectAll(group.works.map((work) => work.ao3WorkId))}
            className="w-fit text-xs font-medium text-accent hover:underline"
          >
            {`Select all in ${group.fandom}`}
          </button>

          <div className="flex flex-col gap-1">
            {group.works.map((work) => {
              const checked = selectedWorkIds.includes(work.ao3WorkId);
              const disabled = !checked && atCap;
              return (
                <label key={work.ao3WorkId} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    aria-disabled={disabled || undefined}
                    onChange={(event) => handleToggle(work.ao3WorkId, event.target.checked)}
                    className="h-4 w-4 rounded border-ink/30 text-accent focus:border-accent focus:ring-[3px] focus:ring-accent/15"
                  />
                  {work.title}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </fieldset>
  );
}
