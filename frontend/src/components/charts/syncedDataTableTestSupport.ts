// Test-only helper for the date-hierarchy-grouping feature's T5 regression
// pass (docs/plans/date-hierarchy-grouping.md §4/§10 T5). The new 3-tier
// table header adds YEAR (`th[scope=colgroup]`/`th[scope=rowgroup]`) and
// MONTH (same) grouping cells alongside the existing, unchanged DAY tier
// (`th[scope=col]`/`th[scope=row]`, still carrying `data-date-key`) and
// corner cell (also `scope=col`). Per the HTML-AAM scope->role mapping
// (verified against the installed aria-query source,
// node_modules/aria-query/lib/etc/roles/literal/{columnheader,rowheader}
// Role.js: both "col"/"colgroup" map to columnheader, both "row"/"rowgroup"
// map to rowheader), `getByRole("columnheader"|"rowheader")` now ALSO
// matches the new grouping tiers - every PRE-EXISTING test in this suite
// that counts "how many date columns/rows" via an unfiltered
// getAllByRole(...) call predates the 3-tier header and would silently
// start counting grouping cells too, not because of a bug in those tests'
// own intent, but because the accessible-role surface genuinely grew.
// These helpers restore the original, narrower "day tier (+corner) only"
// semantics those tests actually intend, filtering on the exact `scope`
// value (`col`/`row`, never `colgroup`/`rowgroup`) that the corner cell and
// DateHeaderCell/SeriesHeaderCell keep unchanged.
export function leafColumnHeaders(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('th[scope="col"]'));
}

export function leafRowHeaders(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('th[scope="row"]'));
}
