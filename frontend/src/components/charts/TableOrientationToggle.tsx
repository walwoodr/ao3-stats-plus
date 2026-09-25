import type { Orientation } from "../../lib/tableOrientation";

export interface TableOrientationToggleProps {
  orientation: Orientation;
  onOrientationChange: (orientation: Orientation) => void;
}

const BUTTON_BASE =
  "rounded border px-2 py-1 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
// Deliberately NOT bg-accent/10 for the pressed state - that class is
// reserved elsewhere in SyncedDataTable (and widely asserted on in tests,
// both here and in the chart components that embed this control) as the
// ACTIVE-DATE cell/header tint; reusing it on this always-one-pressed
// toggle would make a button falsely register as an "active date" match
// for any `[class*="bg-accent/10"]` query.
const BUTTON_ACTIVE = `${BUTTON_BASE} border-accent/40 text-ink`;
const BUTTON_INACTIVE = `${BUTTON_BASE} border-transparent text-ink-soft hover:text-ink`;

// Item 2's real, shipped orientation toggle (§3 item 2, §8): a labeled
// group of two native buttons ("Dates across" / "Dates down"), not a custom
// roving-tabindex tablist - a genuine two-option toggle needs no more than
// what native <button> Tab/Enter/Space already gives for free. Existing
// slate Tailwind styling, matching the disclosure header's font weight (§9),
// NOT MASTER design tokens.
export function TableOrientationToggle({
  orientation,
  onOrientationChange,
}: TableOrientationToggleProps) {
  function select(next: Orientation) {
    if (next !== orientation) onOrientationChange(next);
  }

  return (
    <div role="group" aria-label="Table orientation" className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={orientation === "datesAsColumns"}
        onClick={() => select("datesAsColumns")}
        className={orientation === "datesAsColumns" ? BUTTON_ACTIVE : BUTTON_INACTIVE}
      >
        Dates across
      </button>
      <button
        type="button"
        aria-pressed={orientation === "datesAsRows"}
        onClick={() => select("datesAsRows")}
        className={orientation === "datesAsRows" ? BUTTON_ACTIVE : BUTTON_INACTIVE}
      >
        Dates down
      </button>
    </div>
  );
}
