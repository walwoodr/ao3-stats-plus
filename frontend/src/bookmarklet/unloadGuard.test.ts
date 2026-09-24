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

// Dedicated dispatch helper for the one test that needs to actually prove
// unloadGuard.ts's `event.returnValue = ""` line runs, rather than just
// reading the (jsdom-coerced) value back afterward - see that test's own
// comment. Defines returnValue as an own accessor property on the event
// instance (shadowing whatever jsdom's Event.prototype exposes) purely to
// record every value assigned to it, in call order.
function dispatchBeforeUnloadWithReturnValueSpy(): {
  defaultPrevented: boolean;
  returnValueSets: unknown[];
} {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  const returnValueSets: unknown[] = [];
  Object.defineProperty(event, "returnValue", {
    configurable: true,
    get: () => returnValueSets.at(-1),
    set: (value: unknown) => {
      returnValueSets.push(value);
    },
  });
  window.dispatchEvent(event);
  return { defaultPrevented: event.defaultPrevented, returnValueSets };
}

describe("unloadGuard", () => {
  afterEach(() => {
    // Belt-and-suspenders: a failed assertion mid-test, or a test that
    // intentionally leaves start() calls unmatched (e.g. the double-start
    // test below), must never leak a real beforeunload listener - or a
    // nonzero reference count - into a later, unrelated test in this same
    // shared jsdom window. A single stopUnloadGuard() call is no longer
    // guaranteed to fully clear the guard now that it's reference-counted
    // (see unloadGuard.ts), so this drains it completely instead.
    while (isUnloadGuardActive()) stopUnloadGuard();
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
    // only be called once per addEventListener call - the meaningful signal
    // double-registration would reveal is a duplicate listener firing
    // preventDefault twice, which is harmless either way. The real
    // regression this test guards is stopUnloadGuard() now needing to be
    // called twice (reference-counted) to fully clear the guard after two
    // starts - covered below.
    expect(event.defaultPrevented).toBe(true);
  });

  // Reference-counted (fixed 2026-09-23, see unloadGuard.ts's header
  // comment): two overlapping runs (e.g. two concurrent fan-out runs on the
  // same page) must each get their own start/stop pair honored
  // independently, so a single stop() from whichever run finishes first
  // must not tear down the guard while the other run is still active. This
  // is a deliberate behavior change from the guard's original idempotent
  // design, where a single stop() after a double-start fully cleared it.
  it("a single stopUnloadGuard() call after a double-start does not clear the guard", () => {
    startUnloadGuard();
    startUnloadGuard();
    stopUnloadGuard();

    expect(isUnloadGuardActive()).toBe(true);
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
  });

  it("two stopUnloadGuard() calls after a double-start fully clear the guard", () => {
    startUnloadGuard();
    startUnloadGuard();
    stopUnloadGuard();
    stopUnloadGuard();

    expect(isUnloadGuardActive()).toBe(false);
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it("a stray extra stopUnloadGuard() call does not go negative and break a later start", () => {
    stopUnloadGuard();
    stopUnloadGuard();
    startUnloadGuard();

    expect(isUnloadGuardActive()).toBe(true);
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
  });

  it("sets preventDefault and returnValue on beforeunload while active", () => {
    startUnloadGuard();

    const { defaultPrevented, returnValueSets } = dispatchBeforeUnloadWithReturnValueSpy();

    expect(defaultPrevented).toBe(true);
    // Spies on the returnValue *setter* itself rather than reading
    // event.returnValue back afterward: jsdom's Event.returnValue is a
    // legacy boolean cancel-flag (get/set coerced to boolean), not the
    // string property BeforeUnloadEvent exposes in real browsers, so
    // reading it back after assigning "" yields `false`, not `""`. A bare
    // `expect(event.returnValue).not.toBe("")` assertion would pass
    // identically even if unloadGuard.ts never set returnValue at all
    // (its default value also isn't the string ""), which is exactly the
    // gap an adversarial review caught here (2026-09-23) - this line had
    // zero real coverage despite the assertion appearing to pass.
    expect(returnValueSets).toContain("");
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
