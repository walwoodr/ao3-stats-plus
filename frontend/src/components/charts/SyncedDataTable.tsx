import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { SyncedTableModel } from "../../lib/syncedTableModel";
import {
  normalizeTableModel,
  type DateAxisEntry,
  type NormalizedTableModel,
  type Orientation,
  type SeriesAxisEntry,
} from "../../lib/tableOrientation";
import { buildDateHierarchy, dedupeDateAxisEntries } from "../../lib/dateHierarchy";
import {
  animateScrollLeft,
  computeTargetScrollLeft,
  prefersReducedMotion,
  type ColumnLayout,
} from "../../lib/scrollColumnIntoView";
import { DataCell, SeriesHeaderCell } from "./SyncedDataTableCells";
import {
  DateAxisRowCells,
  flattenDateAxisRows,
  SyncedDataTableHeader,
} from "./SyncedDataTableHeader";
import { TableOrientationToggle } from "./TableOrientationToggle";

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

  // Maintenance fix (TECH_DEBT.md, 2026-09-23 entry: "selfTriggeredRef
  // stuck-true flaw"). The flag used to be set unconditionally here, then
  // reset by the auto-scroll effect below on its next run. But when the
  // table hovers a column whose dateKey the parent ALREADY holds, the
  // parent's setState is a same-value no-op - React bails that re-render,
  // so this component's own activeDateKey prop never changes, and the
  // effect (keyed on [activeDateKey]) never reruns to clear the flag. It
  // then stayed stuck true until the next genuine external chart-hover
  // change happened to arrive, silently suppressing that one auto-scroll.
  // Only set the flag when this actually WILL change the prop (dateKey !==
  // the current activeDateKey) - exactly the cases where the effect is
  // guaranteed to rerun afterward and clear it again, so it can never get
  // stuck: a no-op notify now never sets it in the first place.
  function notifyActiveDateKeyChange(dateKey: string | null) {
    if (dateKey !== activeDateKey) {
      selfTriggeredRef.current = true;
    }
    onActiveDateKeyChange(dateKey);
  }

  // Maintenance fix (2026-10-15, TECH_DEBT.md 2026-09-23 entry: "SyncedDataTable
  // zombie scroll-animation leak"). animateScrollLeft now returns a cancel
  // handle (see scrollColumnIntoView.ts); this effect's cleanup calls it
  // unconditionally on every re-run (a new activeDateKey arriving mid-
  // animation) AND on unmount, so a still-running ~1.5s animation targeting
  // this effect's OWN container/targetScrollLeft is always stopped before
  // either a new one starts or the DOM node is torn down - no more writes to
  // a detached node from a prior hover's zombie rAF loop.
  useEffect(() => {
    const wasSelfTriggered = selfTriggeredRef.current;
    selfTriggeredRef.current = false;
    if (wasSelfTriggered || activeDateKey === null) return undefined;

    const container = scrollContainerRef.current;
    const stickyCorner = stickyCornerRef.current;
    if (!container || !stickyCorner) return undefined;

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
    if (targetScrollLeft === null) return undefined;

    const cancelScroll = animateScrollLeft({
      container,
      targetScrollLeft,
      prefersReducedMotion: prefersReducedMotion(),
    });

    return () => {
      cancelScroll();
    };
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
  // Maintenance fix (TECH_DEBT.md, 2026-09-27 entry: "duplicate-dateKey
  // header/body misalignment"). The <tbody> below renders from
  // columnSlots/rowSlots - previously built straight off
  // normalized.dateAxis, undeduplicated - while the header
  // (SyncedDataTableHeader) renders off dateHierarchy, which already
  // dedupes via buildDateHierarchy's own first-occurrence-wins rule. If
  // dateAxis ever carried a duplicate dateKey, the header would have fewer
  // date columns/rows than the body, silently misaligning the two. Applying
  // the SAME dedupeDateAxisEntries rule here closes that gap at the source,
  // rather than each of this component's two consumers of dateAxis having
  // to independently agree not to diverge.
  const dedupedDateAxis = dedupeDateAxisEntries(normalized.dateAxis);
  const columnSlots: AxisSlot[] = isDatesAsColumns
    ? dateSlots(dedupedDateAxis)
    : seriesSlots(normalized.seriesAxis);
  const rowSlots: AxisSlot[] = isDatesAsColumns
    ? seriesSlots(normalized.seriesAxis)
    : dateSlots(dedupedDateAxis);
  // The shared Year->Month->Day model (docs/plans/date-hierarchy-grouping.md
  // §3) drives BOTH the thead (SyncedDataTableHeader) and, in datesAsRows,
  // each tbody row's leading date-tier cells (DateAxisRowCells) - a single
  // source of truth for the grouping, not two divergent implementations.
  const dateHierarchy = buildDateHierarchy(normalized.dateAxis);
  // Maintenance fix (TECH_DEBT.md, 2026-09-27 entry: "flattenDateAxisRows
  // O(N^2)"). Flattened ONCE per render here, then passed to every
  // DateAxisRowCells instance below - previously each of the N per-row
  // instantiations recomputed this same flatten itself just to read its
  // own one row (O(N) work x N rows = O(N^2) total for N date rows).
  const flattenedDateAxisRows = flattenDateAxisRows(dateHierarchy);
  // In datesAsRows, EVERY rowSlot is a date slot (rowSlots is built from
  // dateSlots(dedupedDateAxis) above) - each one's position among just the
  // date slots now always equals the hierarchy's own flattened day-row
  // index exactly, including under a duplicate dateKey (both rowSlots and
  // dateHierarchy dedup via the same dedupeDateAxisEntries rule - see the
  // Maintenance fix above). Computed functionally (no mutable counter, per
  // this codebase's render-purity lint rule) rather than incremented inside
  // the JSX .map() below.
  const rowSlotsWithDateIndex = rowSlots.reduce<{ rowSlot: AxisSlot; dateRowIndex: number }[]>(
    (acc, rowSlot) => {
      const previousDateIndex = acc.length > 0 ? acc[acc.length - 1].dateRowIndex : -1;
      const dateRowIndex = rowSlot.kind === "date" ? previousDateIndex + 1 : previousDateIndex;
      return [...acc, { rowSlot, dateRowIndex }];
    },
    [],
  );

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
          // entirely. The real, shared TableOrientationToggle.tsx (plan
          // §2.1/§3 item 2) renders here directly - no separate inline
          // toggle; its own no-op-on-already-active-option contract is the
          // standardized behavior for both surfaces.
          <div className="absolute right-4 top-2">
            <TableOrientationToggle
              orientation={orientation}
              onOrientationChange={onOrientationChange}
            />
          </div>
        )}
        {/* WCAG 2.1.1/axe scrollable-region-focusable: a horizontally
          scrollable region with no naturally focusable content (no links/
          inputs here) must itself be a keyboard-operable tab stop, or
          keyboard-only users have no way to scroll it.
          Maintenance (2026-10-13, item 4): `padding-left: 0` per direct
          instruction - was `px-4` (padding on both sides), stacking an
          extra left inset nothing else here relies on (every cell, incl.
          the sticky row-header column, carries its own independent
          padding/shadow treatment regardless of this container's own).
          Right/bottom padding (`pr-4`/`pb-4`) are unchanged. Known
          tradeoff, accepted per explicit instruction: the <summary> toggle
          label above (still `px-4`) no longer visually aligns with the
          table's own first column. */}
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto bg-card pr-4 pb-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          tabIndex={0}
          role="region"
          aria-label={`${title} data table, scrollable`}
        >
          <table aria-label={title} className="w-full border-collapse">
            <SyncedDataTableHeader
              rowHeaderLabel={rowHeaderLabel}
              dateAxis={normalized.dateAxis}
              seriesAxis={normalized.seriesAxis}
              orientation={orientation}
              activeDateKey={activeDateKey}
              pinnedDateKey={pinnedDateKey}
              onPinnedDateKeyChange={onPinnedDateKeyChange}
              notifyActiveDateKeyChange={notifyActiveDateKeyChange}
              togglePin={togglePin}
              cornerRef={stickyCornerRef}
            />
            <tbody>
              {rowSlotsWithDateIndex.map(({ rowSlot, dateRowIndex }) => (
                <tr key={slotKey(rowSlot)}>
                  {rowSlot.kind === "date" ? (
                    <DateAxisRowCells
                      rows={flattenedDateAxisRows}
                      rowIndex={dateRowIndex}
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
