export interface InfoBoxProps {
  message: string;
}

// Hand-authored inline SVG (this app's established icon convention - see
// BookmarkFeedItem.tsx's ExternalLinkIcon and lib/markerShapes.tsx; no icon
// library is installed or approved, per TECH_STACK.md's ask-before-adding
// policy and MASTER.md's Anti-Patterns section). `aria-hidden`: purely
// decorative - the message text beside it is the real, accessible content.
// Drawn from primitive shapes (a stroked circle, a filled dot, a rounded
// bar) rather than a literal glyph, matching this app's other hand-rolled
// icons.
function InfoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className="inline-block shrink-0"
    >
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="6.25" r="1.1" fill="currentColor" />
      <rect x="9" y="9" width="2" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

// Shared "info box" visual treatment (Maintenance, 2026-10-14 - Preview
// feedback on item 3, batch fix/maintenance-2026-10-13): an icon ("i" in a
// circle) plus a message, with a blue background/border/icon. A
// deliberate, direct-instruction exception to this app's existing ink/
// accent/growth/destructive token set - `colorTokens.ts`/`index.css` have
// no blue/"info" role, but the user gave an explicit, specific color
// instruction (not an open design question), so this uses Tailwind's
// built-in blue utilities directly rather than treating it as a new
// design-token decision needing Design/Planning consultation. Extracted
// here once it had >=2 call sites (TrendChart.tsx, MultiSeriesTrendChart.
// tsx) - both render this in place of their chart when every real captured
// value is 0, keeping the data table itself visible alongside it.
export function InfoBox({ message }: InfoBoxProps) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-300 bg-blue-50 p-4">
      <span className="mt-0.5 shrink-0 text-blue-500">
        <InfoIcon />
      </span>
      <p className="text-sm text-blue-800">{message}</p>
    </div>
  );
}
