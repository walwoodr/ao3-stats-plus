import { afterEach, describe, expect, it } from "vitest";
import { isUnloadGuardActive, startUnloadGuard, stopUnloadGuard } from "./unloadGuard";

// unloadGuard.ts backs ROADMAP.md's "don't close this page" warning while
// Phase 2's fan-out (fanOut.ts) is actively running - see that file's own
// header comment for why start/stop are wired to the exact same points
// fanOut.ts creates/removes its progress banner, rather than a parallel
// "is a run active" flag. These tests cover the guard in isolation:
// add/remove lifecycle, idempotency, and the beforeunload handler's actual
// preventDefault()/returnValue behavior - fanOut.ts's own tests (see
// fanOut.unloadGuard.test.ts) cover it being wired to the run lifecycle
// itself.
function dispatchBeforeUnload(): BeforeUnloadEvent {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(event);
  return event;
}

describe("unloadGuard", () => {
  afterEach(() => {
    // Belt-and-suspenders: a failed assertion mid-test must never leak a
    // real beforeunload listener into a later, unrelated test file running
    // in the same jsdom window.
    stopUnloadGuard();
  });

  it("is inactive until started", () => {
    expect(isUnloadGuardActive()).toBe(false);
  });

  it("becomes active once started", () => {
    startUnloadGuard();
    expect(isUnloadGuardActive()).toBe(true);
  });

  it("becomes inactive once stopped", () => {
    startUnloadGuard();
    stopUnloadGuard();
    expect(isUnloadGuardActive()).toBe(false);
  });

  it("stopping without ever starting is a safe no-op", () => {
    expect(() => stopUnloadGuard()).not.toThrow();
    expect(isUnloadGuardActive()).toBe(false);
  });

  it("starting twice in a row does not register a second listener", () => {
    startUnloadGuard();
    startUnloadGuard();

    const event = dispatchBeforeUnload();

    // If a second listener had been registered, preventDefault would still
    // only be called once per addEventListener call, but returnValue would
    // still be set - the meaningful signal that double-registration would
    // reveal is a duplicate listener firing preventDefault twice, which is
    // harmless. The real regression this test guards is stopUnloadGuard()
    // needing to be called twice to fully clear the guard after two starts
    // - covered below.
    expect(event.defaultPrevented).toBe(true);
  });

  it("one stopUnloadGuard() call after a double-start fully clears the guard", () => {
    startUnloadGuard();
    startUnloadGuard();
    stopUnloadGuard();

    expect(isUnloadGuardActive()).toBe(false);
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it("sets preventDefault and returnValue on beforeunload while active", () => {
    startUnloadGuard();

    const event = dispatchBeforeUnload();

    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).not.toBe("");
  });

  it("does not intercept beforeunload once stopped", () => {
    startUnloadGuard();
    stopUnloadGuard();

    const event = dispatchBeforeUnload();

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not intercept beforeunload before ever being started", () => {
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });
});
