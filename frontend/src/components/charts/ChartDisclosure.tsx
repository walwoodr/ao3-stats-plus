import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

export interface ChartDisclosureProps {
  children: ReactNode;
}

// Maintenance item 9 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): the chart figure and the below-it SyncedDataTable get TWO
// INDEPENDENT collapse/expand controls - collapsing one must never hide the
// other. This wraps just the figure in its own native <details>/<summary>
// disclosure, always defaulting open (unlike SyncedDataTable's By-Work
// exception, there's no stated reason to default any chart closed), with
// its own accessible label ("Chart") distinct from the table's own
// ("Data table") so the two controls are clearly distinguishable to a
// screen-reader user navigating the page. Mirrors SyncedDataTable's own
// explicit click/Enter/Space summary handling (not left to the UA's
// implicit <summary> activation) so both disclosures behave identically.
// A standalone, chart-shape-agnostic component (not duplicated per chart)
// so TrendChart/RatioChart/MultiSeriesTrendChart each stay lean.
export function ChartDisclosure({ children }: ChartDisclosureProps) {
  const [open, setOpen] = useState(true);

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
    <details open={open}>
      <summary
        onClick={toggleOpen}
        onKeyDown={handleSummaryKeyDown}
        className="cursor-pointer select-none text-sm font-semibold text-ink"
      >
        Chart
      </summary>
      {children}
    </details>
  );
}
