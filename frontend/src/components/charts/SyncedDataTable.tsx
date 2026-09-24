import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { SyncedTableModel } from "../../lib/syncedTableModel";
import {
  normalizeTableModel,
  type DateAxisEntry,
  type NormalizedTableModel,
  type Orientation,
  type SeriesAxisEntry,
} from "../../lib/tableOrientation";
import {
  animateScrollLeft,
  computeTargetScrollLeft,
  prefersReducedMotion,
  type ColumnLayout,
} from "../../lib/scrollColumnIntoView";
import {
  DataCell,
  DateHeaderCell,
  HEADER_CELL_BASE,
  SeriesHeaderCell,
  STICKY_COLUMN_SHADOW,
} from "./SyncedDataTableCells";

export interface SyncedDataTableProps {
  title: string;
  rowHeaderLabel: string;
  model: SyncedTableModel;
  activeDateKey: string | null;
  onActiveDateKeyChange: (dateKey: string | null) => void;
  // D-A: open/collapsible everywhere by default, EXCEPT the By-Work
  // Bookmarks view (up to 10 stacked charts), which passes false.
  defaultOpen?: boolean;
  // Item 2 (§3 item 2): both optional, backward-compatible defaults, so
  // every pre-existing call site keeps compiling/rendering unmodified.
  // Defaults to today's datesAsColumns shape; the toggle control itself
  // only renders when onOrientationChange is provided.
  orientation?: Orientation;
  onOrientationChange?: (orientation: Orientation) => void;
  // Item 3 (§2.3, §3 item 3, C3b): also optional/backward-compatible. Pin
  // controls only render on date headers when onPinnedDateKeyChange is
  // provided; every date header (lead-in included) is an equal pin target.
  pinnedDateKey?: string | null;
  onPinnedDateKeyChange?: (dateKey: string | null) => void;
}

type AxisSlot = { kind: "date"; entry: DateAxisEntry } | { kind: "series"; entry: SeriesAxisEntry };

function dateSlots(axis: DateAxisEntry[]): AxisSlot[] {
  return axis.map((entry) => ({ kind: "date", entry }) as const);
}
function seriesSlots(axis: SeriesAxisEntry[]): AxisSlot[] {
  return axis.map((entry) => ({ kind: "series", entry }) as const);
}
function isDateSlot(slot: AxisSlot): slot is { kind: "date"; entry: DateAxisEntry } {
  return slot.kind === "date";
}
function isSeriesSlot(slot: AxisSlot): slot is { kind: "series"; entry: SeriesAxisEntry } {
  return slot.kind === "series";
}

// The single presentational transposed table shared by TrendChart,
// RatioChart, and MultiSeriesTrendChart (single-series is the N=1 case of
// the same shape, plan §2.1/§5.3). Purely controlled with respect to the
// chart<->table SYNC (it holds no sync state of its own - just reports
// hover/focus on a date column header via onActiveDateKeyChange and renders
// the bg-accent/10 tint when a column's dateKey matches the caller's
// activeDateKey). The disclosure's open/closed state, however, is this
// component's own - `defaultOpen` (D-A) seeds it once. The summary's own
// click/Enter/Space handling is explicit (not left to the UA's implicit
// <summary> activation behavior) so the toggle is exercised the same way in
// every environment.
//
// Item 2/3 (this batch): renders from tableOrientation.ts's normalized
// dateAxis/seriesAxis/valueAt triple rather than a hardcoded columns=dates/
// rows=series loop, so BOTH orientations render off the same source of
// truth - whichever axis is the "primary" (header row, across the top) vs
// "secondary" (row headers, down the sticky left side) just swaps per
// `orientation`. A cell's dateKey/seriesKey pair is always resolved from
// whichever of {row, column} carries each kind, independent of which one
// is currently rendered as headers vs rows (§2.2's a11y-tied-to-meaning
// design).
export function SyncedDataTable({
  title,
  rowHeaderLabel,
  model,
  activeDateKey,
  onActiveDateKeyChange,
  defaultOpen = true,
  orientation = "datesAsColumns",
  onOrientationChange,
  pinnedDateKey = null,
  onPinnedDateKeyChange,
}: SyncedDataTableProps) {
  const [open, setOpen] = useState(defaultOpen);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stickyCornerRef = useRef<HTMLTableCellElement>(null);
  // Maintenance item 5 (post-ship bug batch, 2026-09-23): distinguishes a
  // TABLE-originated activeDateKey change (this component's own column
  // hover/focus handlers, wrapped below to set this flag first) from an
  // EXTERNAL one (a chart hover, driving the same prop from the parent) -
  // only the latter should auto-scroll. Scrolling the table out from under
  // a user who is already hovering a column header inside it would be a
  // jarring self-scroll loop, so table-originated changes are suppressed.
  const selfTriggeredRef = useRef(false);

  function notifyActiveDateKeyChange(dateKey: string | null) {
    selfTriggeredRef.current = true;
    onActiveDateKeyChange(dateKey);
  }

  useEffect(() => {
    const wasSelfTriggered = selfTriggeredRef.current;
    selfTriggeredRef.current = false;
    if (wasSelfTriggered || activeDateKey === null) return;

    const container = scrollContainerRef.current;
    const stickyCorner = stickyCornerRef.current;
    if (!container || !stickyCorner) return;

    const columnElements = container.querySelectorAll<HTMLTableCellElement>("th[data-date-key]");
    const columns: ColumnLayout[] = Array.from(columnElements).map((element) => ({
      dateKey: element.dataset.dateKey ?? "",
      offsetLeft: element.offsetLeft,
      width: element.offsetWidth,
    }));

    const targetScrollLeft = computeTargetScrollLeft({
      columns,
      targetDateKey: activeDateKey,
      stickyColumnWidth: stickyCorner.offsetWidth,
      maxScrollLeft: Math.max(container.scrollWidth - container.clientWidth, 0),
    });
    if (targetScrollLeft === null) return;

    animateScrollLeft({
      container,
      targetScrollLeft,
      prefersReducedMotion: prefersReducedMotion(),
    });
  }, [activeDateKey]);

  function toggleOpen(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    setOpen((previous) => !previous);
  }

  function handleSummaryKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      toggleOpen(event);
    }
  }

  function togglePin(dateKey: string) {
    if (!onPinnedDateKeyChange) return;
    onPinnedDateKeyChange(pinnedDateKey === dateKey ? null : dateKey);
  }

  const normalized: NormalizedTableModel = normalizeTableModel(model);
  const isDatesAsColumns = orientation === "datesAsColumns";
  const columnSlots: AxisSlot[] = isDatesAsColumns
    ? dateSlots(normalized.dateAxis)
    : seriesSlots(normalized.seriesAxis);
  const rowSlots: AxisSlot[] = isDatesAsColumns
    ? seriesSlots(normalized.seriesAxis)
    : dateSlots(normalized.dateAxis);

  function slotKey(slot: AxisSlot): string {
    return slot.kind === "date" ? slot.entry.dateKey : slot.entry.seriesKey;
  }

  return (
    <div className="relative">
      <details
        open={open}
        className="mt-4 rounded-lg border border-ink/12 bg-card transition-colors duration-200"
      >
        <summary
          onClick={toggleOpen}
          onKeyDown={handleSummaryKeyDown}
          className="cursor-pointer select-none px-4 py-2 pr-40 text-sm font-semibold text-ink"
        >
          Data table
        </summary>
        {onOrientationChange && (
          // Positioned absolutely (relative to this component's outer
          // wrapping div, not <details>) rather than nested inside
          // <summary> - axe flags "summary has focusable descendants" as a
          // serious WCAG 4.1.2 violation when a native, independently
          // focusable control sits inside a <summary>'s own interactive
          // semantics. A sibling of <summary> (still a child of <details>,
          // so it hides along with the table when collapsed - it has
          // nothing useful to toggle while hidden) sidesteps that
          // entirely, and no longer needs its own click-stopPropagation
          // guard either, since it's no longer a descendant of <summary>'s
          // click handler.
          <div
            role="group"
            aria-label="Table orientation"
            className="absolute right-4 top-2 flex items-center gap-1"
          >
            {/* Deliberately NOT bg-accent/10 for the pressed state here -
                that class is reserved elsewhere in this table (and widely
                asserted on in tests) as the ACTIVE-DATE cell/header tint;
                reusing it on this always-one-pressed toggle would make a
                button falsely register as an "active date" match for any
                `[class*="bg-accent/10"]` query. */}
            <button
              type="button"
              aria-pressed={orientation === "datesAsColumns"}
              onClick={() => onOrientationChange("datesAsColumns")}
              className={
                orientation === "datesAsColumns"
                  ? "rounded border border-accent/40 px-2 py-1 text-sm font-semibold text-ink"
                  : "rounded border border-transparent px-2 py-1 text-sm font-semibold text-ink-soft hover:text-ink"
              }
            >
              Dates across
            </button>
            <button
              type="button"
              aria-pressed={orientation === "datesAsRows"}
              onClick={() => onOrientationChange("datesAsRows")}
              className={
                orientation === "datesAsRows"
                  ? "rounded border border-accent/40 px-2 py-1 text-sm font-semibold text-ink"
                  : "rounded border border-transparent px-2 py-1 text-sm font-semibold text-ink-soft hover:text-ink"
              }
            >
              Dates down
            </button>
          </div>
        )}
        {/* WCAG 2.1.1/axe scrollable-region-focusable: a horizontally
          scrollable region with no naturally focusable content (no links/
          inputs here) must itself be a keyboard-operable tab stop, or
          keyboard-only users have no way to scroll it. */}
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto bg-card px-4 pb-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          tabIndex={0}
          role="region"
          aria-label={`${title} data table, scrollable`}
        >
          <table aria-label={title} className="w-full border-collapse">
            <thead>
              <tr>
                <th
                  ref={stickyCornerRef}
                  scope="col"
                  className={`${HEADER_CELL_BASE} sticky left-0 z-10 bg-card text-ink-soft ${STICKY_COLUMN_SHADOW}`}
                >
                  {/* Plain rowHeaderLabel, no suffix - the pin button's
                    "Compare from " text lives in aria-label now
                    (SyncedDataTableCells.tsx), not DOM text/textContent, so
                    it no longer risks concatenating with this corner's text
                    into an accidental substring collision (e.g. the earlier
                    "Work" + "Compare" reading as "...work c..." to some
                    other case-insensitive lookup) - and several pre-existing
                    specs (e.g. WorkComparisonSection.bookmarksByWork.test.
                    tsx) assert this corner cell's textContent equals
                    rowHeaderLabel exactly. */}
                  <span className="sr-only">{rowHeaderLabel}</span>
                </th>
                {columnSlots.map((slot) =>
                  slot.kind === "date" ? (
                    <DateHeaderCell
                      key={slotKey(slot)}
                      entry={slot.entry}
                      as="columnheader"
                      activeDateKey={activeDateKey}
                      pinnedDateKey={pinnedDateKey}
                      onPinnedDateKeyChange={onPinnedDateKeyChange}
                      notifyActiveDateKeyChange={notifyActiveDateKeyChange}
                      togglePin={togglePin}
                    />
                  ) : (
                    <SeriesHeaderCell key={slotKey(slot)} entry={slot.entry} as="columnheader" />
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rowSlots.map((rowSlot) => (
                <tr key={slotKey(rowSlot)}>
                  {rowSlot.kind === "date" ? (
                    <DateHeaderCell
                      entry={rowSlot.entry}
                      as="rowheader"
                      activeDateKey={activeDateKey}
                      pinnedDateKey={pinnedDateKey}
                      onPinnedDateKeyChange={onPinnedDateKeyChange}
                      notifyActiveDateKeyChange={notifyActiveDateKeyChange}
                      togglePin={togglePin}
                    />
                  ) : (
                    <SeriesHeaderCell entry={rowSlot.entry} as="rowheader" />
                  )}
                  {columnSlots.map((colSlot) => {
                    const dateEntry = isDateSlot(rowSlot)
                      ? rowSlot.entry
                      : isDateSlot(colSlot)
                        ? colSlot.entry
                        : null;
                    const seriesEntry = isSeriesSlot(rowSlot)
                      ? rowSlot.entry
                      : isSeriesSlot(colSlot)
                        ? colSlot.entry
                        : null;
                    // Exactly one of {rowSlot, colSlot} is always the date
                    // axis and the other the series axis, by construction
                    // (columnSlots/rowSlots are built from opposite axes per
                    // orientation) - both resolve on every real render.
                    const dateKey = dateEntry?.dateKey ?? "";
                    const seriesKey = seriesEntry?.seriesKey ?? "";
                    const isActive = dateKey === activeDateKey;
                    const cellValue = normalized.valueAt(seriesKey, dateKey);
                    const seriesRow = model.rows.find((r) => r.seriesKey === seriesKey);
                    const showDelta = isActive && pinnedDateKey != null && activeDateKey != null;
                    return (
                      <DataCell
                        key={slotKey(colSlot)}
                        isActive={isActive}
                        cellValue={cellValue}
                        showDelta={showDelta}
                        pinnedDateKey={pinnedDateKey}
                        activeDateKey={activeDateKey}
                        comparablePoints={seriesRow?.comparablePoints ?? []}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
