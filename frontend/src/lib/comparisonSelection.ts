import type { PerWorkPoint, PerWorkSeries } from "../queries/useStatsForUser";

// Pure selection/window transforms that WorkComparisonSection wires up to
// local useState (see the plan's "State management" section: plain
// useState, not Zustand - this is ephemeral, view-local UI state). Kept
// pure and dependency-free so it's unit-testable without rendering.

// The resolved cap from Q2: the binding constraint is the count of
// unambiguously distinct marker shapes (six), so this also bounds the
// style/color slot count in seriesStyles.ts/colorTokens.ts.
export const MAX_SELECTED_WORKS = 6;

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

export interface YearWindow {
  start: number;
  end: number;
}

// Clamps a window to `bounds` and resolves a crossed-over window (start >
// end) by pulling end up to start, never letting start exceed end - the
// "Range state invariants" defensive re-clamp from the plan's Error
// states, independent of whatever clamping MUI's Slider does at the
// interaction level.
export function clampWindow(window: YearWindow, bounds: YearWindow): YearWindow {
  const start = Math.min(Math.max(window.start, bounds.start), bounds.end);
  const clampedEnd = Math.min(Math.max(window.end, bounds.start), bounds.end);
  const end = Math.max(start, clampedEnd);
  return { start, end };
}

// Filters a work's points to those whose capturedOn year falls within
// [start, end] inclusive - the chart re-lays-out remaining points on the
// categorical axis afterward (connectNulls={false}, so gaps stay gaps).
// Never mutates the input array; returns [] (not a throw) for a work with
// no points.
export function filterPointsInWindow(points: PerWorkPoint[], window: YearWindow): PerWorkPoint[] {
  return points.filter((point) => {
    const year = Number(point.capturedOn.slice(0, 4));
    return year >= window.start && year <= window.end;
  });
}
