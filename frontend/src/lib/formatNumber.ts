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
