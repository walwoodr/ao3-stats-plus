import { describe, expect, it } from "vitest";
import {
  computeYDomain,
  formatDateTick,
  formatLeadInTick,
  leadInEpoch,
  toEpoch,
} from "./chartTimeAxis";

// Testing task 1 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.1, §3 item 4, D7): chartTimeAxis.ts does not exist yet -
// every test below fails at the import ("does not provide an export named
// ..."), a genuine red for this whole file. These signatures are this
// Testing stage's own translation of §2.1's prose into concrete, callable
// functions - Implementation must match them, or flag back if wrong.
//
// toEpoch/formatDateTick/formatLeadInTick are exercised as a real UTC-date
// round-trip (Date.UTC computed independently in each test, not imported
// from the module under test) so a bug in the module can't cancel itself out
// against an assertion built the same way.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("toEpoch: ISO date -> UTC epoch ms", () => {
  it("parses an ISO capturedOn date to its UTC midnight epoch", () => {
    expect(toEpoch("2026-01-03")).toBe(Date.UTC(2026, 0, 3));
  });

  it("is stable/idempotent for the same input", () => {
    expect(toEpoch("2026-02-20")).toBe(toEpoch("2026-02-20"));
  });

  it("orders two dates the same way their epochs order (later date -> larger epoch)", () => {
    expect(toEpoch("2026-02-20")).toBeGreaterThan(toEpoch("2026-01-04"));
  });

  // §7 error states: an unparseable capturedOn must resolve to NaN so the
  // CALLER can filter it before domain computation (defensive; the backend
  // guarantees ISO dates in practice) - toEpoch itself doesn't throw.
  it("returns NaN for an unparseable date, rather than throwing", () => {
    expect(() => toEpoch("not-a-date")).not.toThrow();
    expect(Number.isNaN(toEpoch("not-a-date"))).toBe(true);
  });
});

describe("formatDateTick: real-point tick text", () => {
  it("formats a real point's epoch back to its ISO capturedOn date", () => {
    expect(formatDateTick(toEpoch("2026-01-04"))).toBe("2026-01-04");
  });
});

describe("formatLeadInTick: year-only tick text for the estimated baseline", () => {
  // Deliberately coarser than formatDateTick (§3 item 1's lead-in tick
  // rationale, mirrored for item 4): a fabricated day-level tick would
  // overstate the estimate's precision.
  it("formats a lead-in epoch as year-only, not the full date", () => {
    expect(formatLeadInTick(toEpoch("2014-06-15"))).toBe("2014");
  });
});

describe("leadInEpoch: bounded synthetic offset before the first real point (§3 item 4 point 2)", () => {
  it("places the lead-in at firstRealEpoch minus the clamped median gap between real points", () => {
    // Three real points 40 days apart (within the [14d, 90d] clamp) -
    // median gap is exactly 40 days.
    const first = toEpoch("2026-03-01");
    const realEpochs = [first, toEpoch("2026-04-10"), toEpoch("2026-05-20")];

    const result = leadInEpoch(first, { realEpochs });

    expect(result).toBe(first - 40 * MS_PER_DAY);
  });

  it("clamps a tight median gap up to the MIN bound (~14 days)", () => {
    const first = toEpoch("2026-03-01");
    const realEpochs = [first, toEpoch("2026-03-03"), toEpoch("2026-03-05")]; // 2-day gaps

    const result = leadInEpoch(first, { realEpochs });

    expect(result).toBe(first - 14 * MS_PER_DAY);
  });

  it("clamps a wide median gap down to the MAX bound (~90 days)", () => {
    const first = toEpoch("2026-01-01");
    const realEpochs = [first, toEpoch("2026-09-01"), toEpoch("2027-05-01")]; // ~8-month gaps

    const result = leadInEpoch(first, { realEpochs });

    expect(result).toBe(first - 90 * MS_PER_DAY);
  });

  it("uses the MEDIAN gap, not the average, so one outlier gap doesn't dominate", () => {
    // Gaps: 2 days, 2 days, 100 days. Median = 2 days (clamped to 14),
    // average would be ~34.7 days (also within bounds) - this test only
    // passes if the implementation genuinely computes a median.
    const first = toEpoch("2026-01-01");
    const realEpochs = [first, toEpoch("2026-01-03"), toEpoch("2026-01-05"), toEpoch("2026-04-15")];

    const result = leadInEpoch(first, { realEpochs });

    expect(result).toBe(first - 14 * MS_PER_DAY);
  });

  it("falls back to a 30-day gap when there are no consecutive real points to compute a gap from", () => {
    const first = toEpoch("2026-01-01");

    const result = leadInEpoch(first, { realEpochs: [first] });

    expect(result).toBe(first - 30 * MS_PER_DAY);
  });

  it("always resolves strictly before firstRealEpoch (never zero/negative offset)", () => {
    const first = toEpoch("2026-01-01");
    const result = leadInEpoch(first, { realEpochs: [first] });

    expect(result).toBeLessThan(first);
  });
});

describe("computeYDomain: padded domain + broken-axis flag (§3 item 1, D1)", () => {
  it("D1: pins the floor at 0 and pads only the top when the lead-in's 0 is present (dataMin <= 0)", () => {
    const result = computeYDomain([0, 100, 140, 300], { hasLeadIn: true });

    // range = 300, pad = 300 * 0.08 = 24.
    expect(result.domain).toEqual([0, 324]);
    expect(result.broken).toBe(false);
  });

  it("lifts the floor off zero and sets broken=true when there is no lead-in and dataMin > 0", () => {
    const result = computeYDomain([100, 140, 300], { hasLeadIn: false });

    // range = 200, pad = 16, lo = 100 - 16 = 84.
    expect(result.domain).toEqual([84, 316]);
    expect(result.broken).toBe(true);
  });

  it("never lets the padded floor go negative even when the pad would overshoot zero", () => {
    const result = computeYDomain([2, 4], { hasLeadIn: false });

    // range = 2, pad = 0.16, lo = max(0, 2 - 0.16) = 1.84 (still > 0).
    expect(result.domain[0]).toBeGreaterThanOrEqual(0);
    expect(result.domain[0]).toBeCloseTo(1.84, 5);
    expect(result.broken).toBe(true);
  });

  it("gives a lone point (no lead-in) breathing room via the single-point fallback pad, and marks it broken", () => {
    const result = computeYDomain([50], { hasLeadIn: false });

    // range === 0 -> fallback = max(abs(50) * 0.1, 1) = 5; pad = 5 * 0.08 = 0.4.
    expect(result.domain[0]).toBeCloseTo(49.6, 5);
    expect(result.domain[1]).toBeCloseTo(50.4, 5);
    expect(result.broken).toBe(true);
  });

  it("a lone point plus the lead-in's 0 pins the floor at 0, not broken", () => {
    const result = computeYDomain([0, 50], { hasLeadIn: true });

    // range = 50, pad = 4.
    expect(result.domain).toEqual([0, 54]);
    expect(result.broken).toBe(false);
  });

  it("guards the all-zero series against a divide-by-range NaN, still floored at 0", () => {
    const result = computeYDomain([0, 0, 0], { hasLeadIn: true });

    expect(result.domain[0]).toBe(0);
    expect(Number.isFinite(result.domain[1])).toBe(true);
    expect(result.broken).toBe(false);
  });

  it("applies the fallback-pad floor of 1 for a near-zero single-point dataMax (never a zero-height pad)", () => {
    const result = computeYDomain([0.001], { hasLeadIn: false });

    // abs(0.001) * 0.1 is far below 1, so the max(..., 1) floor kicks in:
    // fallback = 1, pad = 0.08.
    expect(result.domain[1] - result.domain[0]).toBeCloseTo(0.08, 5);
  });
});
