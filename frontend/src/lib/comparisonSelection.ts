import { monthIndexOf } from "./monthIndex";
import type { PerWorkPoint, PerWorkSeries } from "../queries/useStatsForUser";

// Pure selection/window transforms that WorkComparisonSection wires up to
// local useState (see the plan's "State management" section: plain
// useState, not Zustand - this is ephemeral, view-local UI state). Kept
// pure and dependency-free so it's unit-testable without rendering.

// The resolved cap, raised 6 -> 10 by docs/plans/usds-dataviz-color-
// scheme.md (Discovery's "target cap ~10," redesigning all style slots from
// scratch): the binding constraint is still the count of unambiguously
// distinct marker shapes (now ten, validated by the shape-distinguishability
// pass), so this also bounds the style/color slot count in
// seriesStyles.ts/colorTokens.ts - see capInvariant.test.ts for the
// cross-module guard.
export const MAX_SELECTED_WORKS = 10;

export function addWork(selectedWorkIds: number[], workId: number): number[] {
  if (selectedWorkIds.includes(workId)) return selectedWorkIds;
  if (selectedWorkIds.length >= MAX_SELECTED_WORKS) return selectedWorkIds;
  return [...selectedWorkIds, workId];
}

export function removeWork(selectedWorkIds: number[], workId: number): number[] {
  return selectedWorkIds.filter((id) => id !== workId);
}

export interface SelectAllInFandomResult {
  selectedIds: number[];
  addedCount: number;
  requestedCount: number;
}

// Additive bulk-select (Q4: one shared selection set, not replace) - adds
// every work in `fandomWorkIds` that isn't already selected, up to the cap,
// preserving existing selection order and appending new additions after it.
// Reports how many were actually added vs. requested so the caller (a
// role="status" live region) can announce a truncation rather than
// silently dropping works past the cap.
export function selectAllInFandom(
  selectedWorkIds: number[],
  fandomWorkIds: number[],
): SelectAllInFandomResult {
  const alreadySelected = new Set(selectedWorkIds);
  const toAdd = fandomWorkIds.filter((id) => !alreadySelected.has(id));
  const room = Math.max(0, MAX_SELECTED_WORKS - selectedWorkIds.length);
  const added = toAdd.slice(0, room);

  return {
    selectedIds: [...selectedWorkIds, ...added],
    addedCount: added.length,
    requestedCount: fandomWorkIds.length,
  };
}

// Fandom-header "deselect all" half of the tri-state bulk-select semantics
// (docs/plans/work-comparison-picker-redesign.md §0.4/§5): removes every id
// in `fandomWorkIds` from the selection, preserving the relative order of
// whatever remains. Composes removeWork's filter semantics rather than
// duplicating them - existing addWork/removeWork/selectAllInFandom untouched.
export function deselectAllInFandom(selectedWorkIds: number[], fandomWorkIds: number[]): number[] {
  const toRemove = new Set(fandomWorkIds);
  return selectedWorkIds.filter((id) => !toRemove.has(id));
}

// Union of capture dates across the given works, deduped and ascending -
// both the slider's `>2` gate input and (indirectly, via
// MultiSeriesTrendChart's own union-date derivation) the comparison
// charts' shared date axis. Never throws on works with 0 points (Error
// states: "Malformed/empty points on a work").
export function unionCapturedOnDates(works: PerWorkSeries[]): string[] {
  const dates = new Set<string>();
  for (const work of works) {
    for (const point of work.points) {
      dates.add(point.capturedOn);
    }
  }
  return [...dates].sort();
}

// The slider threshold (Q5): shown only when the union of distinct
// capturedOn dates across the currently-selected works is > 2 (i.e. >= 3) -
// with <= 2 points there is no meaningful sub-range to pick.
export function shouldShowRangeSlider(unionDates: string[]): boolean {
  return unionDates.length > 2;
}

// Month-index window (docs/plans/date-range-slider-month-granularity.md,
// D1) - start/end are month indices (`year * 12 + (month - 1)`, from
// lib/monthIndex.ts), not raw years. Renamed from YearWindow so the type
// name doesn't misleadingly imply year granularity.
export interface MonthWindow {
  start: number;
  end: number;
}

// Clamps a window to `bounds` and resolves a crossed-over window (start >
// end) by pulling end up to start, never letting start exceed end - the
// "Range state invariants" defensive re-clamp from the plan's Error
// states, independent of whatever clamping MUI's Slider does at the
// interaction level.
export function clampWindow(window: MonthWindow, bounds: MonthWindow): MonthWindow {
  const start = Math.min(Math.max(window.start, bounds.start), bounds.end);
  const clampedEnd = Math.min(Math.max(window.end, bounds.start), bounds.end);
  const end = Math.max(start, clampedEnd);
  return { start, end };
}

// Filters a work's points to those whose capturedOn month index falls
// within [start, end] inclusive - the chart re-lays-out remaining points on
// the categorical axis afterward (connectNulls={false}, so gaps stay
// gaps). Never mutates the input array; returns [] (not a throw) for a
// work with no points, and excludes (rather than throwing on) a malformed
// capturedOn, since monthIndexOf degrades to NaN for those.
export function filterPointsInWindow(points: PerWorkPoint[], window: MonthWindow): PerWorkPoint[] {
  return points.filter((point) => {
    const monthIndex = monthIndexOf(point.capturedOn);
    return monthIndex >= window.start && monthIndex <= window.end;
  });
}

// A single work's own earliest real captured month index - the min across
// its own points, independent of whatever order `points` happens to be in.
// Returns null for a work with zero points or all-malformed capturedOn
// values (nothing to anchor to).
function firstRealMonthIndexOf(points: PerWorkPoint[]): number | null {
  const indices = points
    .map((point) => monthIndexOf(point.capturedOn))
    .filter((index) => Number.isFinite(index));
  return indices.length > 0 ? Math.min(...indices) : null;
}

// ROADMAP.md "v2 candidates" (confirmed 2026-08-03) / Maintenance
// (2026-10-13): the date-range slider's drag-bounds FLOOR should be the
// earliest zero-basis (lead-in) date across the CURRENTLY SELECTED works,
// not the account-wide `earliestPostYear` alone - a selection of only
// recently-published works shouldn't let the user drag back into months
// before any of them existed, just because the author's account itself is
// older. `zeroBasisDateOf` is supplied by the caller (WorkComparisonSection
// already owns the publishedOn-or-earliestPostYear-fallback derivation via
// its own `zeroBasisDateFor`) so this stays a pure reduction, not a
// reimplementation of that fallback rule. Returns null when no selected
// work can form a zero-basis at all (caller supplies its own fallback, as
// it already does for the pre-existing earliestUnionYear-based floor).
export function earliestZeroBasisMonthIndex(
  works: PerWorkSeries[],
  zeroBasisDateOf: (work: PerWorkSeries) => string | null,
): number | null {
  const indices = works
    .map((work) => zeroBasisDateOf(work))
    .filter((date): date is string => date !== null)
    .map((date) => monthIndexOf(date))
    .filter((index) => Number.isFinite(index));
  return indices.length > 0 ? Math.min(...indices) : null;
}

// ROADMAP.md "v2 candidates", amended 2026-08-04: across the currently
// selected works, the span strictly between (the LATEST zero-basis date
// among them - the last of them to be "published") and (the EARLIEST real
// captured date among them - the first of them to actually have data) is a
// span where EVERY selected work is either not-yet-published or published-
// but-not-yet-captured. A window chosen entirely inside that span would
// show nothing but flat interpolated lead-in lines, no real data to
// compare - so it should be treated the same as any other stale/invalid
// window. Returns null when no such gap exists: either no selected work has
// a zero-basis, none has any real data, or their real data already
// overlaps the lead-in period (some work's own first real point is at or
// before the gap, which makes the "every work lacks data here" premise
// false).
export function emptyLeadInGap(
  works: PerWorkSeries[],
  zeroBasisDateOf: (work: PerWorkSeries) => string | null,
): MonthWindow | null {
  const zeroBasisIndices = works
    .map((work) => zeroBasisDateOf(work))
    .filter((date): date is string => date !== null)
    .map((date) => monthIndexOf(date))
    .filter((index) => Number.isFinite(index));
  const firstRealIndices = works
    .map((work) => firstRealMonthIndexOf(work.points))
    .filter((index): index is number => index !== null);

  if (zeroBasisIndices.length === 0 || firstRealIndices.length === 0) return null;

  const latestZeroBasis = Math.max(...zeroBasisIndices);
  const earliestReal = Math.min(...firstRealIndices);
  // "Strictly between" needs at least one whole month of real daylight -
  // adjacent or overlapping months aren't a gap worth excluding.
  if (earliestReal - latestZeroBasis < 2) return null;
  return { start: latestZeroBasis, end: earliestReal };
}

// Whether a committed window falls ENTIRELY inside the empty-lead-in gap
// (not merely overlapping it) - per the amendment's "cannot choose a window
// that falls entirely inside that span" wording, a window that straddles
// the gap's edge (so it still shows at least one side's real data) is fine.
export function windowEntirelyInsideGap(window: MonthWindow, gap: MonthWindow | null): boolean {
  return gap !== null && window.start > gap.start && window.end < gap.end;
}
