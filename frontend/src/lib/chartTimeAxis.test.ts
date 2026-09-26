import { describe, expect, it } from "vitest";
import {
  computeYDomain,
  formatDateTick,
  formatDayTick,
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

// Testing task T8 (docs/plans/date-hierarchy-grouping.md §10, §2.2, D1):
// formatDayTick does not exist yet - every test below fails at the import
// (a real red for this whole file, not just this block). D1's chart day-
// tick text change ("06" not "2026-08-06") switches the three charts'
// real-tick `formatTick` from formatDateTick to this new function; month/
// year context is carried by DateGroupingOverlay's own labels instead.
describe("formatDayTick: bare day-of-month tick text (D1)", () => {
  it("formats a real point's epoch to its zero-padded day-of-month only", () => {
    expect(formatDayTick(toEpoch("2026-08-06"))).toBe("06");
  });

  it("zero-pads single-digit days", () => {
    expect(formatDayTick(toEpoch("2026-08-01"))).toBe("01");
  });

  it("does not zero-pad (stays two digits) for a double-digit day", () => {
    expect(formatDayTick(toEpoch("2026-08-23"))).toBe("23");
  });

  it("omits month/year entirely - two different months' same day-of-month format identically", () => {
    expect(formatDayTick(toEpoch("2026-07-15"))).toBe(formatDayTick(toEpoch("2026-08-15")));
  });

  // §8 error states: formatDateTick/formatLeadInTick both already tolerate
  // a NaN epoch (from toEpoch's own "return NaN, never throw" contract)
  // without throwing - formatDayTick must degrade the same way, per this
  // module's established defense-in-depth precedent, rather than crash the
  // whole chart on a malformed upstream date.
  it("does not throw for a NaN epoch (malformed upstream date), degrading gracefully instead", () => {
    expect(() => formatDayTick(NaN)).not.toThrow();
    expect(typeof formatDayTick(NaN)).toBe("string");
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
  // 324/316's raw pad-only ceilings are themselves the bug this batch fixes
  // (see the "nice-rounded ceiling" describe block below) - computeYDomain
  // now rounds the ceiling UP to a clean 2-significant-figure number
  // (324 -> 330, 316 -> 320) as part of its return contract, so these two
  // expected values were updated accordingly; the pad-ratio math itself
  // (range * 0.08) is unchanged and still verified via the comments below.
  it("D1: pins the floor at 0 and pads only the top when the lead-in's 0 is present (dataMin <= 0)", () => {
    const result = computeYDomain([0, 100, 140, 300], { hasLeadIn: true });

    // range = 300, pad = 300 * 0.08 = 24, raw ceiling = 324 -> nice-rounded to 330.
    expect(result.domain).toEqual([0, 330]);
    expect(result.broken).toBe(false);
  });

  it("lifts the floor off zero and sets broken=true when there is no lead-in and dataMin > 0", () => {
    const result = computeYDomain([100, 140, 300], { hasLeadIn: false });

    // range = 200, pad = 16, lo = 100 - 16 = 84, raw ceiling 316 -> nice-rounded to 320.
    expect(result.domain).toEqual([84, 320]);
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

    // range === 0 -> fallback = max(abs(50) * 0.1, 1) = 5; pad = 5 * 0.08 = 0.4;
    // raw ceiling 50.4 -> nice-rounded up to 51 (2 sig figs).
    expect(result.domain[0]).toBeCloseTo(49.6, 5);
    expect(result.domain[1]).toBeCloseTo(51, 5);
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

// Bug fix regression tests (2026-09-25 Preview finding, item 1): the raw
// padded ceiling used to be returned as an arbitrary unrounded float,
// producing an ugly Y-axis top tick ("141,823.44"/"778.68" alongside clean
// round ticks) that could also overflow the width Recharts allocated for
// the shorter round labels around it. Deliberately uses REAL, non-round
// magnitudes lifted straight from the Preview screenshots that exposed the
// bug (a ~131k-hit aggregate series, a ~721-hit per-work series) rather than
// small clean numbers - the pre-existing describe block above already used
// plenty of those and none of them caught this.
describe("computeYDomain: nice-rounded ceiling, realistic non-round magnitudes (bug fix, 2026-09-25)", () => {
  it("rounds a large aggregate-scale ceiling (dashboard 'Total hits', dataMax=131069) to a clean multiple of 10,000, not a raw decimal", () => {
    // Mirrors the real "Total hits" dashboard chart: hasLeadIn -> dataMin
    // 0 included. range = 131069, pad = 131069 * 0.08 = 10485.52, raw
    // ceiling = 141554.52 - confirmed live as the exact clipped/decimal tick.
    const result = computeYDomain([0, 130536, 130597, 130911, 131069], { hasLeadIn: true });

    expect(result.domain).toEqual([0, 150000]);
    expect(Number.isInteger(result.domain[1])).toBe(true);
  });

  it("rounds a small-but-not-round per-work ceiling (dataMax=721) to a clean integer, not a raw decimal", () => {
    // Mirrors the real per-work "Hits" comparison chart (pinned_compare.png):
    // raw ceiling = 721 + 721*0.08 = 778.68 - confirmed live as that exact
    // unrounded top tick.
    const result = computeYDomain([0, 720, 721], { hasLeadIn: true });

    expect(result.domain).toEqual([0, 780]);
    expect(Number.isInteger(result.domain[1])).toBe(true);
  });

  it("still preserves meaningful fractional precision for a RatioChart-scale ceiling (values well under 1), not blown up to an unrelated round number", () => {
    // A kudos-to-hits ratio never gets anywhere near the large-integer
    // magnitudes above - the rounding must stay proportionate at this scale
    // too, not regress RatioChart's legitimate fractional ticks.
    const result = computeYDomain([0, 0.041, 0.0623], { hasLeadIn: true });

    // range = 0.0623, pad = 0.0623 * 0.08 = 0.004984, raw ceiling =
    // 0.067284 -> nice-rounded (2 sig figs) up to 0.068.
    expect(result.domain[1]).toBeCloseTo(0.068, 10);
    // Nice-rounding must never pull the ceiling below the real data max -
    // no data point can be clipped out of the visible domain by this fix.
    expect(result.domain[1]).toBeGreaterThanOrEqual(0.0623);
  });

  it("never rounds the ceiling below the raw padded value, for any magnitude (no data point is ever clipped out of view)", () => {
    const inputs = [[0, 130536, 130597, 130911, 131069], [0, 720, 721], [100, 140, 300], [0.001]];

    for (const values of inputs) {
      const dataMax = Math.max(...values);
      const result = computeYDomain(values, { hasLeadIn: values.includes(0) });
      expect(result.domain[1]).toBeGreaterThanOrEqual(dataMax);
    }
  });
});
