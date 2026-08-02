import { describe, expect, it } from "vitest";
import { WORDLIST } from "./wordlist";

// WORDLIST is the plain in-repo data source for word-pair token suggestions
// (docs/plans/memorable-token-and-recovery.md section 1/Q1/Q2): exactly 300
// lowercase words, 4-8 letters each, no duplicates. It lives once, in TS -
// the backend never generates or validates token format, so there is no
// second copy anywhere else in the codebase.
describe("WORDLIST", () => {
  it("is an array", () => {
    expect(Array.isArray(WORDLIST)).toBe(true);
  });

  it("has exactly 300 entries", () => {
    expect(WORDLIST.length).toBe(300);
  });

  it("contains only lowercase ASCII words 4-8 letters long", () => {
    for (const word of WORDLIST) {
      expect(word).toMatch(/^[a-z]{4,8}$/);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(WORDLIST).size).toBe(WORDLIST.length);
  });
});
