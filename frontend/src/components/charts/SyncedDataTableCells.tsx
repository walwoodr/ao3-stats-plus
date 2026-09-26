import { MarkerGlyph } from "../../lib/markerShapes";
import { formatNumber } from "../../lib/formatNumber";
import type { DateAxisEntry, SeriesAxisEntry } from "../../lib/tableOrientation";
import { computeRowDelta, deltaLabel, deltaValence } from "../../lib/pointComparison";

// Cell-rendering helpers for SyncedDataTable.tsx, split into this sibling
// file to keep the parent within the .tsx file-length budget (plan §2.2's
// own contingency for this file). Shares the parent's Tailwind-slate style
// constants rather than importing them, since only the parent owns the
// disclosure/table chrome; these are the per-cell leaf styles.

// Maintenance item 7 (post-ship bug batch, 2026-09-23): text-sm, not
// text-xs - ~1.2x the prior size, and the nearest existing step on
// MASTER.md's documented type scale, which starts at text-sm/14px for
// captions/labels (design-system/ao3-stats-plus/MASTER.md's Typography
// section never names text-xs at all).
export const HEADER_CELL_BASE =
  "whitespace-nowrap px-3 py-1 text-left font-mono text-sm border-b border-ink/12";
export const DATA_CELL_BASE = "whitespace-nowrap px-3 py-1 text-left font-mono text-sm text-ink";
// Maintenance item 4 (post-ship bug batch, 2026-09-23): every sticky (left-0)
// cell gets this same light right-edge shadow - both a "more content this
// way" scroll affordance and a defensive fix for the seam/gap that
// `position: sticky` cells can otherwise show in a `border-collapse` table.
export const STICKY_COLUMN_SHADOW = "shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]";
export const STICKY_HEADER_BASE = `sticky left-0 z-10 max-w-[150px] bg-card px-2 py-1 text-left text-sm font-semibold text-ink ${STICKY_COLUMN_SHADOW}`;

// Maintenance item 6 (post-ship bug batch, 2026-09-23): thousands-separate
// numeric cell values (en-US comma grouping) so large stat counts stay
// readable at a glance. Non-numeric cells ("—" sparse, "Published (N)"
// placeholders built by syncedTableModel.ts) pass through unchanged.
function formatCellValue(cell: number | string | undefined): string {
  if (cell === undefined) return "—";
  return typeof cell === "number" ? formatNumber(cell) : cell;
}

export interface DateHeaderCellProps {
  entry: DateAxisEntry;
  as: "columnheader" | "rowheader";
  // Date-hierarchy-grouping.md §6/D2: the VISIBLE text (day-of-month, e.g.
  // "06"), distinct from `entry.label` - which stays the accessible name
  // (aria-label below) in full, e.g. "Before 2014 (estimated baseline)".
  // Belt-and-suspenders for uneven scope=colgroup/rowgroup screen-reader
  // support, and keeps the pin button's own accessible name meaningful.
  // Optional, defaulting to `entry.label` - SyncedDataTableHeader.tsx (the
  // only real caller once I7 lands) always supplies the real day-of-month;
  // the default keeps this component's own type backward-compatible.
  displayLabel?: string;
  activeDateKey: string | null;
  pinnedDateKey: string | null;
  onPinnedDateKeyChange?: (dateKey: string | null) => void;
  notifyActiveDateKeyChange: (dateKey: string | null) => void;
  togglePin: (dateKey: string) => void;
}

// A date header - rendered as either a column header (datesAsColumns, the
// default) or a row header (datesAsRows). Carries the hover/focus sync
// handlers, the active-date tint, and (when onPinnedDateKeyChange is
// provided) item 3's pin control - EVERY date header, lead-in included, is
// an equal pin target (C3b, no column-level selectability gate).
export function DateHeaderCell({
  entry,
  as,
  displayLabel = entry.label,
  activeDateKey,
  pinnedDateKey,
  onPinnedDateKeyChange,
  notifyActiveDateKeyChange,
  togglePin,
}: DateHeaderCellProps) {
  const isActive = entry.dateKey === activeDateKey;
  const isPinned = entry.dateKey === pinnedDateKey;
  const isRowHeader = as === "rowheader";
  const baseClass = isRowHeader
    ? STICKY_HEADER_BASE
    : isActive
      ? `${HEADER_CELL_BASE} bg-accent/10 font-semibold text-ink`
      : `${HEADER_CELL_BASE} text-ink-soft`;
  const rowHeaderActiveClass = isRowHeader && isActive ? " bg-accent/10" : "";

  return (
    <th
      data-date-key={entry.dateKey}
      scope={isRowHeader ? "row" : "col"}
      onMouseEnter={() => notifyActiveDateKeyChange(entry.dateKey)}
      onMouseLeave={() => notifyActiveDateKeyChange(null)}
      onFocus={() => notifyActiveDateKeyChange(entry.dateKey)}
      onBlur={() => notifyActiveDateKeyChange(null)}
      className={`${baseClass}${rowHeaderActiveClass}`}
      title={isRowHeader ? entry.label : undefined}
      // Pins the header's OWN accessible name to exactly entry.label,
      // overriding the default content-based computation - without this,
      // the pin button's "Compare from " sr-only prefix would leak into
      // this header's computed name (e.g. "Compare from 2026-01-03"
      // instead of "2026-01-03"), breaking exact-match columnheader/
      // rowheader name lookups in pre-existing TrendChart/RatioChart specs
      // that predate item 3's pin feature. The button's OWN accessible name
      // ("Compare from <label>") is unaffected - aria-label on an ancestor
      // only overrides how the ANCESTOR's name is computed, never a
      // descendant's.
      aria-label={entry.label}
    >
      {onPinnedDateKeyChange ? (
        <button
          type="button"
          aria-pressed={isPinned}
          // "Compare from " lives in aria-label (accessible-name only), NOT
          // as DOM text - a visible/sr-only text child would show up in
          // this button's own textContent. The visible text is
          // `displayLabel` (date-hierarchy-grouping.md §6/D2's day-of-month,
          // e.g. "06"), distinct from the full `entry.label` carried in
          // aria-label above - see this file's own DateHeaderCellProps
          // comment. The "pinned comparison point" suffix, by contrast,
          // stays a real sr-only DOM child (not aria-label) because
          // SyncedDataTable.pinDelta.test.tsx asserts on it via the
          // header's textContent directly, not the button's accessible
          // name.
          aria-label={`Compare from ${entry.label}`}
          onClick={() => togglePin(entry.dateKey)}
          className="min-w-0 max-w-full truncate text-left"
        >
          {displayLabel}
          {isPinned && <span className="sr-only"> — pinned comparison point</span>}
        </button>
      ) : isRowHeader ? (
        <span className="truncate">{displayLabel}</span>
      ) : (
        displayLabel
      )}
    </th>
  );
}

export interface SeriesHeaderCellProps {
  entry: SeriesAxisEntry;
  as: "columnheader" | "rowheader";
}

// A series header - rendered as either a row header (datesAsColumns, the
// default - today's shape) or a column header (datesAsRows). D5's identity
// (shape, color) description travels with the series axis regardless of
// which header it currently occupies.
export function SeriesHeaderCell({ entry, as }: SeriesHeaderCellProps) {
  const isRowHeader = as === "rowheader";
  const glyph =
    entry.shape && entry.colorHex ? (
      <MarkerGlyph shape={entry.shape} color={entry.colorHex} size={4} />
    ) : null;

  if (isRowHeader) {
    return (
      <th scope="row" className={STICKY_HEADER_BASE}>
        {/* max-w-[150px] caps the column so a long work title can't push
            the table wide before horizontal scroll kicks in; `title`
            carries the FULL text for a hover tooltip, and `truncate`
            (overflow-hidden + ellipsis) is CSS-only - it never removes the
            underlying DOM text, so non-hover/AT users still get the whole
            title via the row's own textContent. */}
        <span className="flex items-center gap-1.5" title={entry.title}>
          {glyph}
          <span className="min-w-0 flex-1 truncate">{entry.title}</span>
        </span>
        {entry.identityDescription && (
          <span className="sr-only">{` — ${entry.identityDescription}`}</span>
        )}
      </th>
    );
  }

  return (
    <th scope="col" className={`${HEADER_CELL_BASE} text-ink-soft`}>
      <span className="flex items-center gap-1.5">
        {glyph}
        {entry.title}
      </span>
      {entry.identityDescription && (
        <span className="sr-only">{` — ${entry.identityDescription}`}</span>
      )}
    </th>
  );
}

export interface DataCellProps {
  isActive: boolean;
  cellValue: number | string | undefined;
  showDelta: boolean;
  pinnedDateKey: string | null;
  activeDateKey: string | null;
  comparablePoints: { dateKey: string; value: number }[];
}

// A single value cell. Item 3's per-row backward-walk delta (C3a/C3b) is
// computed here, independent of the literal `cellValue` - a row with no OWN
// value exactly at the active date still gets a real delta chip carried
// forward from its most recent prior point, even though its literal cell
// reads "—" (the whole point of the backward-walk).
export function DataCell({
  isActive,
  cellValue,
  showDelta,
  pinnedDateKey,
  activeDateKey,
  comparablePoints,
}: DataCellProps) {
  const className = isActive ? `${DATA_CELL_BASE} bg-accent/10` : DATA_CELL_BASE;

  if (!showDelta || pinnedDateKey == null || activeDateKey == null) {
    return <td className={className}>{formatCellValue(cellValue)}</td>;
  }

  const result = computeRowDelta(comparablePoints, pinnedDateKey, activeDateKey);

  if (result.kind === "none") {
    return (
      <td className={className}>
        {formatCellValue(cellValue)}
        {/* Deliberately worded WITHOUT "work" immediately before "as of" -
            "work as" is a literal substring of the regex some tests use to
            select a specific row by name (e.g. /work a/i for "Work A"),
            and this sr-only text lives inside every row's accessible name
            computation, so an unrelated row's "no data ... as of" text
            would otherwise falsely match another row's name-based lookup. */}
        <span className="sr-only">{` — no data as of ${result.missingDateKey}`}</span>
      </td>
    );
  }

  const valence = deltaValence(result.delta);
  const valenceClass =
    valence === "up" ? "text-growth" : valence === "down" ? "text-destructive" : "text-ink-soft";
  const valenceWord = valence === "up" ? "increase" : valence === "down" ? "decrease" : "no change";
  const carriedForward = result.resolvedDateKeyB !== activeDateKey;

  return (
    <td className={className}>
      {formatCellValue(cellValue)}
      <span className={`ml-1.5 font-semibold ${valenceClass}`} data-testid="delta-chip">
        {deltaLabel(result.delta)}
      </span>
      <span className="sr-only">
        {valence === "flat" ? " — no change" : ` — ${valenceWord} of ${Math.abs(result.delta)}`}
      </span>
      {carriedForward && <span className="sr-only">{` — as of ${result.resolvedDateKeyB}`}</span>}
    </td>
  );
}
