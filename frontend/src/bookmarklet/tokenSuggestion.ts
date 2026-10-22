import { WORDLIST } from "./wordlist";

// generateTokenSuggestion produces a memorable "word-word" capability-token
// suggestion (docs/plans/memorable-token-and-recovery.md section 1/Q1):
// two distinct words picked at random from WORDLIST, joined by "-". The rng
// is injectable (defaulting to Math.random) so callers can make the pick
// deterministic in tests without depending on WORDLIST's real contents.

// Bounds the reject-and-retry loop below (TECH_DEBT.md, 2026-08-02 entry) -
// not reachable via the real Math.random default (1/300 collision odds per
// retry against the real WORDLIST), only a defensive cap against an
// adversarial/buggy injected rng that always collides. Sized generously
// relative to those real odds, not tuned to any specific rng.
const MAX_SECOND_WORD_ATTEMPTS = 50;

export function generateTokenSuggestion(rng: () => number = Math.random): string {
  const first = pickWord(rng);
  let second = pickWord(rng);

  // Reject-and-retry rather than excluding the first pick from the pool:
  // simpler, and collisions are rare enough (1/300 per retry) not to matter.
  let attempts = 1;
  while (second === first && attempts < MAX_SECOND_WORD_ATTEMPTS) {
    second = pickWord(rng);
    attempts += 1;
  }

  if (second === first) {
    // The cap above was hit (only possible against a pathological rng,
    // e.g. one that always returns the same value) - fall back to the next
    // word in the list, wrapping around. Always distinct from `first`
    // since WORDLIST has more than one entry (wordlist.test.ts pins this
    // at 300 unique words), and deterministic/non-rng so this always
    // terminates rather than ever throwing for what remains a cosmetic
    // suggestion feature the user can freely edit anyway.
    const firstIndex = WORDLIST.indexOf(first);
    second = WORDLIST[(firstIndex + 1) % WORDLIST.length];
  }

  return `${first}-${second}`;
}

function pickWord(rng: () => number): string {
  const index = Math.min(Math.floor(rng() * WORDLIST.length), WORDLIST.length - 1);
  return WORDLIST[index];
}
