import { describe, expect, it } from "vitest";
import { formatNumber } from "./formatNumber";

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
