import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, paginate } from "./bookmarkFeed";

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
