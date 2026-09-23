// Maintenance item 5 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): when a column becomes highlighted via chart->table sync (a
// chart hover, NOT a table-originated hover - see SyncedDataTable.tsx's own
// self-triggered-suppression note, which avoids a jarring self-scroll loop),
// SyncedDataTable animates its horizontal scroll container to bring that
// column to roughly the 3rd visible position from the left, with a real
// ~1.5s eased animation (not an instant jump, not browser-default
// `scroll-behavior: smooth`, whose duration isn't controllable/consistent
// enough). Split out as its own DOM-layout-independent module so the
// placement math and the animation driver are both directly unit-testable
// without depending on jsdom's (nonexistent) real layout engine.

export interface ColumnLayout {
  dateKey: string;
  // Pixel offset of this column's LEFT edge within the table's own
  // coordinate space (i.e. `<th>.offsetLeft`), INCLUDING the sticky
  // row-header column's own width (columns start after it).
  offsetLeft: number;
  width: number;
}

export interface ComputeTargetScrollLeftParams {
  // Date columns only (never the sticky row-header column), left-to-right.
  columns: ColumnLayout[];
  targetDateKey: string;
  // The sticky row-header column's own rendered width - always visible, so
  // the first "visible position" date column must start exactly here.
  stickyColumnWidth: number;
  // scrollWidth - clientWidth: the hard ceiling scrollLeft can never exceed.
  maxScrollLeft: number;
  // Defaults to 3 (the user-specified target) - kept a parameter rather
  // than a hardcoded literal purely for testability.
  targetPosition?: number;
}

// Places `targetDateKey` at `targetPosition` (default 3, 1-indexed) from
// the left, preferring whole columns (the computed scrollLeft always aligns
// exactly to some column's own offsetLeft, never mid-column) and clamping
// sensibly at both ends of the actual scrollable range: near the start,
// where fewer than `targetPosition - 1` real columns precede the target,
// it clamps to scrollLeft 0 (showing the target as far left as it can be);
// near the end, where the naive 3rd-position placement would overscroll
// past the table's real scrollable width, it clamps to maxScrollLeft
// instead. Returns null (a no-op signal, never a throw) if the target
// dateKey isn't found - defensive against a stale/racing dateKey.
export function computeTargetScrollLeft({
  columns,
  targetDateKey,
  stickyColumnWidth,
  maxScrollLeft,
  targetPosition = 3,
}: ComputeTargetScrollLeftParams): number | null {
  const targetIndex = columns.findIndex((column) => column.dateKey === targetDateKey);
  if (targetIndex === -1) return null;

  const startIndex = Math.max(0, targetIndex - (targetPosition - 1));
  const startColumn = columns[startIndex];
  const naiveScrollLeft = startColumn.offsetLeft - stickyColumnWidth;

  return Math.min(Math.max(naiveScrollLeft, 0), Math.max(maxScrollLeft, 0));
}

// Standard ease-in-out cubic (https://easings.net/#easeInOutCubic) - eases
// in from a stop, eases out to a stop, no overshoot.
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface AnimateScrollLeftOptions {
  container: Pick<HTMLElement, "scrollLeft">;
  targetScrollLeft: number;
  // ~1.5s per the user's explicit spec - a real requestAnimationFrame-driven
  // animation, not left to browser-default `scroll-behavior: smooth`.
  durationMs?: number;
  prefersReducedMotion?: boolean;
  // Injectable for deterministic testing (default to the real globals).
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
}

// Drives `container.scrollLeft` from its current value to targetScrollLeft
// over durationMs, eased via easeInOutCubic. Jumps instantly (no frames
// scheduled) when prefersReducedMotion is set or the container is already
// at the target - both matching this app's existing "respect the user's
// motion preference" discipline (see MASTER.md's restrained-motion rule;
// no prior prefers-reduced-motion convention existed in this codebase to
// match, so this establishes one via the standard media query).
export function animateScrollLeft({
  container,
  targetScrollLeft,
  durationMs = 1500,
  prefersReducedMotion = false,
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
}: AnimateScrollLeftOptions): void {
  const startScrollLeft = container.scrollLeft;
  const distance = targetScrollLeft - startScrollLeft;

  if (prefersReducedMotion || distance === 0) {
    container.scrollLeft = targetScrollLeft;
    return;
  }

  const startTime = now();

  function step(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    container.scrollLeft = startScrollLeft + distance * easeInOutCubic(progress);
    if (progress < 1) {
      requestFrame(step);
    }
  }

  requestFrame(step);
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
