// Maintenance item 6 (chart-synced-data-table.md, post-ship bug batch,
// 2026-09-23): a single shared en-US thousands-separator formatter, reused
// by SyncedDataTable's numeric cells and each chart's Y-axis tick labels, so
// large stat counts (hits, kudos, etc.) stay readable at a glance wherever
// they're rendered.
// maximumFractionDigits: 20 (the highest Intl allows) rather than the
// default 3 - this formatter is also reused for RatioChart's fractional
// cell/tick values (e.g. a kudos-to-hits ratio), and the default would
// silently round/truncate real decimal precision there. Integers are
// unaffected either way (no fractional digits to round).
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 20 });
}

// Chart-table-polish-batch item 2 (docs/plans/chart-table-polish-batch.md
// §4/§8 T2, OD-1): a sibling formatter for the count charts' (TrendChart,
// MultiSeriesTrendChart - NOT RatioChart, per OD-1) Y-axis tick labels,
// which must never show a decimal even when Recharts' own tick-value
// generation would otherwise produce one for a small-max domain. Comma
// grouping is preserved; only the fractional-digit behavior differs -
// rounds to the nearest whole number (maximumFractionDigits: 0) rather
// than truncating. Guards non-finite input (NaN/Infinity) to a stable "0"
// rather than leaking a literal "NaN"/"Infinity" string onto a real axis,
// matching formatDayTick's/toEpoch's existing defense-in-depth precedent.
export function formatWholeNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
