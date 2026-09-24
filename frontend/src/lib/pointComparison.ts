// Pure item-3 point-comparison logic (pin A, hover B, per-row backward-walk
// delta) - docs/plans/chart-axis-comparison-and-table-orientation-batch.md
// §2.1/§3 item 3, C3a/C3b. Built around a PER-ROW backward-walk rather than
// a flat per-date lookup: works are captured on different real dates, so a
// selected date may have no OWN value for a given row - see C3a/C3b in the
// plan for the corrected corner-case rules this file implements exactly (no
// column-level selectability gate; the lead-in is an ordinary comparablePoints
// entry, never a synthetic special case).

export interface RowComparablePoint {
  dateKey: string;
  value: number;
}

// rowValueAsOf: the value of the latest entry whose dateKey <= date - an
// exact match wins outright; otherwise the most recent PRIOR entry (which
// may be the row's own lead-in, its earliest floor). `points` is assumed
// ascending by dateKey (the builders in syncedTableModel.ts guarantee this).
// Returns null only when `date` precedes every one of the row's own entries
// (C3a's sole "no data" outcome) - never a column-level exclusion.
export function rowValueAsOf(points: RowComparablePoint[], date: string): number | null {
  let result: RowComparablePoint | null = null;
  for (const point of points) {
    if (point.dateKey > date) break;
    result = point;
  }
  return result ? result.value : null;
}

// Mirrors rowValueAsOf but also reports which entry's dateKey the value
// actually came from - null i.e. no dice, when nothing at/before `date`.
function resolveEntryAsOf(points: RowComparablePoint[], date: string): RowComparablePoint | null {
  let result: RowComparablePoint | null = null;
  for (const point of points) {
    if (point.dateKey > date) break;
    result = point;
  }
  return result;
}

export type DeltaResult =
  | {
      kind: "value";
      delta: number;
      effA: number;
      effB: number;
      resolvedDateKeyA: string;
      resolvedDateKeyB: string;
    }
  | { kind: "none"; missingDateKey: string };

// computeRowDelta: resolves BOTH the pinned (A) and hovered (B) dates via
// the per-row backward-walk (rowValueAsOf), independently, then returns a
// real signed delta only when both resolve. When either side has no data at
// or before its date, this is a meaningful empty (kind "none"), never a
// colored zero - `missingDateKey` prefers the HOVERED date when both sides
// are missing, since that's the date of the cell actually being rendered
// (this Testing-stage judgment call, documented in pointComparison.test.ts).
export function computeRowDelta(
  points: RowComparablePoint[],
  pinnedDate: string,
  hoveredDate: string,
): DeltaResult {
  const entryA = resolveEntryAsOf(points, pinnedDate);
  const entryB = resolveEntryAsOf(points, hoveredDate);

  if (!entryA || !entryB) {
    return { kind: "none", missingDateKey: !entryB ? hoveredDate : pinnedDate };
  }

  return {
    kind: "value",
    delta: entryB.value - entryA.value,
    effA: entryA.value,
    effB: entryB.value,
    resolvedDateKeyA: entryA.dateKey,
    resolvedDateKeyB: entryB.dateKey,
  };
}

export type DeltaValence = "up" | "down" | "flat";

// D6: uniform valence rule for every metric, including the kudos-to-hits
// ratio - no metric-aware exception.
export function deltaValence(delta: number): DeltaValence {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

// Sign-prefixed label text - the non-color channel so color is never the
// sole signal (MASTER Chart Guidance + a11y constraint).
export function deltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Item 3<->4 elapsed-time annotation, now that the axis is real time.
export function elapsedLabel(epochA: number, epochB: number): string {
  const diffDays = Math.round((epochB - epochA) / MS_PER_DAY);
  if (diffDays === 0) return "same day";
  if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? "" : "s"} later`;
  const absDays = Math.abs(diffDays);
  return `${absDays} day${absDays === 1 ? "" : "s"} earlier`;
}
