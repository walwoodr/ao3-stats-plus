import { describe, expect, it } from "vitest";
import { formatNumber, formatWholeNumber } from "./formatNumber";

// Maintenance item 6 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): a single shared en-US thousands-separator formatter, reused
// by SyncedDataTable's numeric cells and each chart's Y-axis tick labels
// (see TrendChart/RatioChart/MultiSeriesTrendChart's tickFormatter), so the
// grouping behavior stays identical wherever a raw stat count is rendered.
describe("formatNumber", () => {
  it("adds en-US comma grouping to a large number", () => {
    expect(formatNumber(12000)).toBe("12,000");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("leaves a small number (no grouping needed) unchanged in string form", () => {
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(0)).toBe("0");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-1234)).toBe("-1,234");
  });

  // RatioChart also reuses this formatter for its fractional ratio values -
  // full decimal precision must survive, not the Intl default 3-digit round.
  it("preserves full decimal precision (does not round to 3 digits) for a fractional value", () => {
    expect(formatNumber(0.123456)).toBe("0.123456");
  });
});

// Chart-table-polish-batch item 2 (docs/plans/chart-table-polish-batch.md
// §4/§8 T2, OD-1): a sibling formatter for the count charts' (TrendChart,
// MultiSeriesTrendChart - NOT RatioChart, per OD-1) Y-axis tick labels,
// which must never show a decimal even when Recharts' own tick-value
// generation would otherwise produce one for a small-max domain. Comma
// grouping is preserved (same en-US Intl formatting as formatNumber), only
// the fractional-digit behavior differs.
describe("formatWholeNumber", () => {
  it("rounds a fractional value to the nearest whole number, with no decimal point", () => {
    expect(formatWholeNumber(1.25)).toBe("1");
    expect(formatWholeNumber(2.5)).toBe("3");
  });

  it("adds en-US comma grouping to a large whole number", () => {
    expect(formatWholeNumber(141554)).toBe("141,554");
  });

  it("leaves an already-whole number unchanged in string form", () => {
    expect(formatWholeNumber(42)).toBe("42");
    expect(formatWholeNumber(0)).toBe("0");
  });

  it("handles a negative fractional value, rounding toward the nearer integer", () => {
    expect(formatWholeNumber(-1.6)).toBe("-2");
  });

  // §6 error states: guard against leaking a bare "NaN" string onto a real
  // Y-axis, matching formatDayTick's/toEpoch's existing defense-in-depth
  // precedent for a malformed/non-finite upstream value.
  it("does not throw and does not leak a literal 'NaN' string for a non-finite input", () => {
    expect(() => formatWholeNumber(NaN)).not.toThrow();
    expect(formatWholeNumber(NaN)).not.toBe("NaN");
    expect(() => formatWholeNumber(Infinity)).not.toThrow();
    expect(formatWholeNumber(Infinity)).not.toContain("Infinity");
  });
});
