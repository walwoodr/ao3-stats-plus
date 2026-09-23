// Backs ROADMAP.md's "don't close this page" warning for Phase 2's fan-out
// (fanOut.ts): a native `beforeunload` confirmation while a run is actively
// in progress, so navigating away or closing the AO3 tab mid-run is a
// deliberate choice rather than silent, unnoticed data loss (only whatever
// was already incrementally POSTed survives - see fanOut.ts's header
// comment). Modern browsers ignore any custom message and show their own
// generic copy, so this deliberately doesn't invest in one - only the
// standard preventDefault()/returnValue pattern matters.
//
// start/stop are called by fanOut.ts at exactly the same points it
// creates/removes its live progress banner (renderProgressBanner/
// progressBanner.remove()) - not a separate "is a run active" flag computed
// in parallel, so the banner and this guard can never disagree about
// whether a run is in progress.

let handler: ((event: BeforeUnloadEvent) => void) | null = null;

function beforeUnloadHandler(event: BeforeUnloadEvent): void {
  // Both are set per the standard cross-browser pattern: preventDefault()
  // is the modern spec'd way to trigger the browser's native prompt;
  // returnValue is legacy support some browsers still key off. Neither
  // custom string is ever actually shown by current browsers.
  event.preventDefault();
  event.returnValue = "";
}

// Idempotent: calling this while already active is a no-op rather than
// stacking a second listener, so a mismatched extra start() (e.g. a future
// call site bug) can't require two stop() calls to fully clear the guard.
export function startUnloadGuard(): void {
  if (handler) return;
  handler = beforeUnloadHandler;
  window.addEventListener("beforeunload", handler);
}

// Also idempotent/safe to call when never started (e.g. a run that never
// gets past a synchronous early-return before starting).
export function stopUnloadGuard(): void {
  if (!handler) return;
  window.removeEventListener("beforeunload", handler);
  handler = null;
}

export function isUnloadGuardActive(): boolean {
  return handler !== null;
}
