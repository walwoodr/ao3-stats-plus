export interface PinnedComparisonBarProps {
  pinnedLabel: string;
  // From pointComparison.elapsedLabel, or omitted/null when nothing is
  // currently hovered - item 3<->4's elapsed-time annotation, only
  // meaningful once both a pin and an active hover exist.
  elapsedLabel?: string | null;
  onClear: () => void;
}

// Item 3's "Comparing from <date> · N days · Clear" summary strip (§1.3,
// D5). Stateless/presentational - the caller (each chart component) owns
// pinnedDateKey/activeDateKey and computes elapsedLabel itself. Existing
// slate Tailwind styling, matching the surrounding chart chrome (§9), NOT
// MASTER design tokens.
export function PinnedComparisonBar({ pinnedLabel, elapsedLabel, onClear }: PinnedComparisonBarProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
      <span className="font-semibold text-ink">{`Comparing from ${pinnedLabel}`}</span>
      {elapsedLabel != null && <span>· {elapsedLabel}</span>}
      <button
        type="button"
        onClick={onClear}
        className="rounded px-1.5 py-0.5 text-sm font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Clear comparison
      </button>
    </div>
  );
}
