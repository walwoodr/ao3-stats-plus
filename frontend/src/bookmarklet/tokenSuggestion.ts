import { WORDLIST } from "./wordlist";

// generateTokenSuggestion produces a memorable "word-word" capability-token
// suggestion (docs/plans/memorable-token-and-recovery.md section 1/Q1):
// two distinct words picked at random from WORDLIST, joined by "-". The rng
// is injectable (defaulting to Math.random) so callers can make the pick
// deterministic in tests without depending on WORDLIST's real contents.
export function generateTokenSuggestion(rng: () => number = Math.random): string {
  const first = pickWord(rng);
  let second = pickWord(rng);

  // Reject-and-retry rather than excluding the first pick from the pool:
  // simpler, and collisions are rare enough (1/300 per retry) not to matter.
  while (second === first) {
    second = pickWord(rng);
  }

  return `${first}-${second}`;
}

function pickWord(rng: () => number): string {
  const index = Math.min(Math.floor(rng() * WORDLIST.length), WORDLIST.length - 1);
  return WORDLIST[index];
}
