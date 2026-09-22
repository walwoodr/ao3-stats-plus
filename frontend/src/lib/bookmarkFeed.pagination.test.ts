import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, buildPageWindow, paginate } from "./bookmarkFeed";

// Pagination slice of bookmarkFeed.ts's pure-logic test suite, split out of
// the original bookmarkFeed.test.ts (CODE_STANDARDS.md's 400-line .ts
// budget - see bookmarkFeedTestSupport.ts's header comment). Not to be
// confused with the component-level BookmarkFeed.pagination.test.tsx.

describe("paginate (D3: client-side page-slicing with out-of-range clamping)", () => {
  function items(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  it("slices the requested page at the given page size", () => {
    const result = paginate(items(30), 1, 25);
    expect(result.items).toEqual(items(25));
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it("slices the second page correctly, including a short final page", () => {
    const result = paginate(items(30), 2, 25);
    expect(result.items).toEqual(items(30).slice(25));
    expect(result.currentPage).toBe(2);
  });

  it("reports exactly one page when everything fits", () => {
    const result = paginate(items(10), 1, 25);
    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual(items(10));
  });

  it("reports one page (not zero) for an empty list", () => {
    const result = paginate([], 1, 25);
    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual([]);
  });

  // C10: clamps a page index that's out of range (e.g. left over from a
  // filter change that shrank the list) to the last valid page, rather than
  // throwing or returning an empty slice for an in-bounds-looking request.
  it("clamps a too-high page index down to the last valid page", () => {
    const result = paginate(items(30), 99, 25);
    expect(result.currentPage).toBe(2);
    expect(result.items).toEqual(items(30).slice(25));
  });

  it("clamps a page index below 1 up to page 1", () => {
    const result = paginate(items(30), 0, 25);
    expect(result.currentPage).toBe(1);
    expect(result.items).toEqual(items(25));
  });

  it("exposes the default page size as 25 (plan-specified default)", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(25);
  });
});

// Item 6 (TECH_DEBT.md 2026-09-14 Review finding/2026-09-22): windows the
// page-number buttons - first page, last page, and the current page with
// up to 2 pages before/after it - instead of one button per page with no
// cap, with a non-interactive "ellipsis" gap indicator between non-adjacent
// groups.
describe("buildPageWindow (item 6: first + last + current-page±2, ellipsis-gapped)", () => {
  it("shows every page with no ellipsis when the total is small enough to need no windowing", () => {
    expect(buildPageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  // Boundary case: a naive current±2 window with no small-total shortcut
  // would leave a gap (e.g. current=1 of 5 -> window [1..3], missing page 4
  // before the forced-included last page 5) even though 5 total pages never
  // needs windowing at all, regardless of which page is current.
  it("shows every page with no ellipsis for every current page when the total is 5, including at the edges", () => {
    for (let current = 1; current <= 5; current++) {
      expect(buildPageWindow(current, 5)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("shows every page with no ellipsis for a single page", () => {
    expect(buildPageWindow(1, 1)).toEqual([1]);
  });

  // The prompt's own worked example: 20 total pages, current page 10.
  it("windows a large total around a middle current page (1 … 8 9 [10] 11 12 … 20)", () => {
    expect(buildPageWindow(10, 20)).toEqual([1, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 20]);
  });

  it("omits the leading ellipsis when current page 1 already overlaps the window's start", () => {
    expect(buildPageWindow(1, 20)).toEqual([1, 2, 3, "ellipsis", 20]);
  });

  // Explicit boundary case named in the spec: current page 2 of 20 - the
  // window (1..4) already touches page 1, so there must be no leading
  // ellipsis AND no double-counted "1" entry.
  it("omits the leading ellipsis and does not double-count page 1 when current page is 2", () => {
    expect(buildPageWindow(2, 20)).toEqual([1, 2, 3, 4, "ellipsis", 20]);
  });

  it("omits the trailing ellipsis when current page is the last page", () => {
    expect(buildPageWindow(20, 20)).toEqual([1, "ellipsis", 18, 19, 20]);
  });

  it("omits the trailing ellipsis and does not double-count the last page when current page is second-to-last", () => {
    expect(buildPageWindow(19, 20)).toEqual([1, "ellipsis", 17, 18, 19, 20]);
  });

  it("never produces two adjacent ellipsis entries", () => {
    for (let current = 1; current <= 20; current++) {
      const result = buildPageWindow(current, 20);
      for (let i = 1; i < result.length; i++) {
        expect(!(result[i] === "ellipsis" && result[i - 1] === "ellipsis")).toBe(true);
      }
    }
  });

  it("always includes both the first and last page", () => {
    const result = buildPageWindow(10, 20);
    expect(result[0]).toBe(1);
    expect(result[result.length - 1]).toBe(20);
  });
});
