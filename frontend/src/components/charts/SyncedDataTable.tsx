import { useState, type KeyboardEvent, type MouseEvent } from "react";
import type { SyncedTableModel } from "../../lib/syncedTableModel";
import { MarkerGlyph } from "../../lib/markerShapes";

export interface SyncedDataTableProps {
  title: string;
  rowHeaderLabel: string;
  model: SyncedTableModel;
  activeDateKey: string | null;
  onActiveDateKeyChange: (dateKey: string | null) => void;
  // D-A: open/collapsible everywhere by default, EXCEPT the By-Work
  // Bookmarks view (up to 10 stacked charts), which passes false.
  defaultOpen?: boolean;
}

const HEADER_CELL_BASE =
  "whitespace-nowrap px-3 py-1 text-left font-mono text-xs border-b border-ink/12";
const DATA_CELL_BASE = "whitespace-nowrap px-3 py-1 text-left font-mono text-xs text-ink";

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
export function SyncedDataTable({
  title,
  rowHeaderLabel,
  model,
  activeDateKey,
  onActiveDateKeyChange,
  defaultOpen = true,
}: SyncedDataTableProps) {
  const [open, setOpen] = useState(defaultOpen);

  function toggleOpen(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    setOpen((previous) => !previous);
  }

  function handleSummaryKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      toggleOpen(event);
    }
  }

  return (
    <details
      open={open}
      className="mt-4 rounded-lg border border-ink/12 bg-card transition-colors duration-200"
    >
      <summary
        onClick={toggleOpen}
        onKeyDown={handleSummaryKeyDown}
        className="cursor-pointer select-none px-4 py-2 text-sm font-semibold text-ink"
      >
        Data table
      </summary>
      {/* WCAG 2.1.1/axe scrollable-region-focusable: a horizontally
          scrollable region with no naturally focusable content (no links/
          inputs here) must itself be a keyboard-operable tab stop, or
          keyboard-only users have no way to scroll it. */}
      <div
        className="overflow-x-auto px-4 pb-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        tabIndex={0}
        role="region"
        aria-label={`${title} data table, scrollable`}
      >
        <table aria-label={title} className="w-full border-collapse">
          <thead>
            <tr>
              <th
                scope="col"
                className={`${HEADER_CELL_BASE} sticky left-0 z-10 bg-card text-ink-soft`}
              >
                <span className="sr-only">{rowHeaderLabel}</span>
              </th>
              {model.columns.map((column) => {
                const isActive = column.dateKey === activeDateKey;
                return (
                  <th
                    key={column.dateKey}
                    scope="col"
                    onMouseEnter={() => onActiveDateKeyChange(column.dateKey)}
                    onMouseLeave={() => onActiveDateKeyChange(null)}
                    onFocus={() => onActiveDateKeyChange(column.dateKey)}
                    onBlur={() => onActiveDateKeyChange(null)}
                    className={
                      isActive
                        ? `${HEADER_CELL_BASE} bg-accent/10 font-semibold text-ink`
                        : `${HEADER_CELL_BASE} text-ink-soft`
                    }
                  >
                    {column.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.seriesKey}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[150px] bg-card px-2 py-1 text-left text-xs font-semibold text-ink"
                >
                  {/* max-w-[150px] caps the column so a long work title can't
                      push the table wide before horizontal scroll kicks in;
                      `title` carries the FULL text for a hover tooltip, and
                      `truncate` (overflow-hidden + ellipsis) is CSS-only - it
                      never removes the underlying DOM text, so non-hover/AT
                      users still get the whole title via the row's own
                      textContent (verified by SyncedDataTable.
                      rowHeaderTruncation.test.tsx). */}
                  <span className="flex items-center gap-1.5" title={row.title}>
                    {row.shape && row.colorHex && (
                      <MarkerGlyph shape={row.shape} color={row.colorHex} size={4} />
                    )}
                    <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  </span>
                  {row.identityDescription && (
                    <span className="sr-only">{` — ${row.identityDescription}`}</span>
                  )}
                </th>
                {row.cells.map((cell, index) => {
                  const column = model.columns[index];
                  const isActive = column !== undefined && column.dateKey === activeDateKey;
                  return (
                    <td
                      key={column?.dateKey ?? index}
                      className={isActive ? `${DATA_CELL_BASE} bg-accent/10` : DATA_CELL_BASE}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
