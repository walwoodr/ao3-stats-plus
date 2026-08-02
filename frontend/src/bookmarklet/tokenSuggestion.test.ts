import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTokenSuggestion } from "./tokenSuggestion";

// generateTokenSuggestion picks two distinct random words from WORDLIST and
// joins them with "-" (docs/plans/memorable-token-and-recovery.md section 1,
// Q1: "generateTokenSuggestion(rng = Math.random): string"). WORDLIST is
// mocked here to a small, fixed, deterministic set so these tests exercise
// the picking/distinctness algorithm itself, independent of the real
// 300-word list's content (which wordlist.test.ts covers separately) and
// independent of exactly how many times a given implementation calls rng()
// to guarantee distinctness (a reject-and-retry loop and an
// exclude-the-first-pick approach are both valid implementations - these
// tests only assert the externally observable contract: format + always
// distinct + deterministic under a given rng).
// vi.mock factories are hoisted above all top-level code, including const
// declarations - referencing MOCK_WORDLIST directly here would throw
// "Cannot access before initialization". vi.hoisted runs alongside vi.mock
// itself, so the value exists by the time the factory needs it.
const MOCK_WORDLIST = vi.hoisted(() => ["aaaa", "bbbb", "cccc", "dddd", "eeee"] as const);
vi.mock("./wordlist", () => ({ WORDLIST: MOCK_WORDLIST }));

// Returns the sequence's values in order, clamping to (repeating) the last
// entry once exhausted - never undefined/NaN, so a well-behaved
// (terminating) implementation can call it more times than the sequence's
// length without the test itself producing garbage results. A poorly
// behaved implementation that never terminates would still hang here, same
// as it would in production against a real, effectively-infinite rng - that
// is a real bug this test is entitled to catch by timing out.
function makeSequenceRng(sequence: number[]): () => number {
  let index = 0;
  return () => {
    const value = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    return value;
  };
}

describe("generateTokenSuggestion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a string matching the word-word format", () => {
    const result = generateTokenSuggestion(makeSequenceRng([0, 0.9]));

    expect(result).toMatch(/^[a-z]{4,8}-[a-z]{4,8}$/);
  });

  it("picks words present in WORDLIST", () => {
    const result = generateTokenSuggestion(makeSequenceRng([0, 0.9]));
    const [first, second] = result.split("-");

    expect(MOCK_WORDLIST).toContain(first);
    expect(MOCK_WORDLIST).toContain(second);
  });

  it("never produces two equal words, even when the rng would naively pick the same index twice in a row", () => {
    // First two calls both map to the same index (a forced collision) -
    // a correct implementation must not settle for e.g. "aaaa-aaaa".
    const result = generateTokenSuggestion(makeSequenceRng([0, 0, 0.9]));
    const [first, second] = result.split("-");

    expect(first).not.toBe(second);
  });

  it("is deterministic: the same rng sequence produces the same output every time", () => {
    const first = generateTokenSuggestion(makeSequenceRng([0, 0.9]));
    const second = generateTokenSuggestion(makeSequenceRng([0, 0.9]));

    expect(first).toBe(second);
  });

  it("produces a different pair for a different rng sequence", () => {
    const low = generateTokenSuggestion(makeSequenceRng([0, 0.9]));
    const high = generateTokenSuggestion(makeSequenceRng([0.9, 0]));

    expect(low).not.toBe(high);
  });

  describe("default rng", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.9).mockReturnValue(0.9);
    });

    it("uses Math.random when no rng is provided", () => {
      generateTokenSuggestion();

      expect(Math.random).toHaveBeenCalled();
    });

    it("still returns a validly formatted, distinct pair when falling back to Math.random", () => {
      const result = generateTokenSuggestion();
      const [first, second] = result.split("-");

      expect(result).toMatch(/^[a-z]{4,8}-[a-z]{4,8}$/);
      expect(first).not.toBe(second);
    });
  });

  it("does not call Math.random when an rng is explicitly provided", () => {
    const randomSpy = vi.spyOn(Math, "random");

    generateTokenSuggestion(makeSequenceRng([0, 0.9]));

    expect(randomSpy).not.toHaveBeenCalled();
  });
});
