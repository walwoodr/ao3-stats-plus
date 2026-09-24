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
//
// Reference-counted rather than a plain boolean/idempotent flag (fixed
// 2026-09-23 after an adversarial review caught a real bug in the original
// design - see git history for unloadGuard.ts around commit 008771c):
// entrypoint.ts can legitimately have two runFanOut() invocations in flight
// on the same page at once (e.g. a rapid double-click on the networkError
// retry banner's Retry button, each resolving as a server-side dedup
// "success" and each starting its own fan-out - entrypoint.ts now also
// guards against that at the source, but this module must be safe under
// overlap regardless of what causes it, not just for that one known path).
// With a plain boolean, the FIRST run to finish called stopUnloadGuard(),
// tearing down the one shared listener out from under the still-running
// SECOND run - from that point the browser would let the tab close with no
// warning while the second run's data was still unsaved, and that run's own
// eventual stopUnloadGuard() no-op'd since the flag was already clear.
// Reference counting means the listener only comes down once every active
// run has called stop().
let handler: ((event: BeforeUnloadEvent) => void) | null = null;
let activeCount = 0;

function beforeUnloadHandler(event: BeforeUnloadEvent): void {
  // Both are set per the standard cross-browser pattern: preventDefault()
  // is the modern spec'd way to trigger the browser's native prompt;
  // returnValue is legacy support some browsers still key off. Neither
  // custom string is ever actually shown by current browsers.
  event.preventDefault();
  event.returnValue = "";
}

// Safe to call concurrently from multiple in-flight runs: increments the
// reference count every time, but only actually registers the DOM listener
// once (on the 0->1 transition). Note this is a deliberate behavior change
// from this function's original idempotent design - a mismatched extra
// start() now does require a matching extra stop() to fully clear the
// guard, which is the correct tradeoff once overlapping starts are an
// expected, legitimate case rather than only ever a call-site bug.
export function startUnloadGuard(): void {
  activeCount++;
  if (handler) return;
  handler = beforeUnloadHandler;
  window.addEventListener("beforeunload", handler);
}

// Safe to call when never started (e.g. a run that never gets past a
// synchronous early-return before starting) - the count never goes
// negative, so a stray extra stop() can't leave the guard in a state where
// a later, legitimate start() fails to re-register the listener.
export function stopUnloadGuard(): void {
  if (activeCount === 0) return;
  activeCount--;
  if (activeCount > 0) return;
  if (!handler) return;
  window.removeEventListener("beforeunload", handler);
  handler = null;
}

export function isUnloadGuardActive(): boolean {
  return handler !== null;
}
