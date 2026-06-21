import type { Country } from "../data/types";
import { levenshtein, normalize } from "../lib/text";

/**
 * How close a typed answer is to the country, 0..1 (case-insensitive — `normalize`
 * lowercases and strips accents):
 *   1.0  exact, or within a small typo tolerance
 *   0.5  a genuine misspelling of a longer name (a couple more chars off)
 *   0    wrong
 *
 * Full-credit tolerance stays strict for SHORT names so different countries that
 * happen to be one edit apart (Iran/Iraq, Mali/Bali, Chad) never collide, and
 * partial credit only kicks in for names ≥6 chars where a 2-3 char slip is
 * clearly a spelling mistake rather than a different country.
 */
export function matchAccuracy(input: string, country: Country): number {
  const guess = normalize(input);
  if (!guess) return 0;
  if (country.acceptedNames.includes(guess)) return 1;

  const len = guess.length;
  const fullTol = len <= 4 ? 0 : len <= 7 ? 1 : 2;
  const halfTol = fullTol + 2;

  let best = Infinity;
  for (const name of country.acceptedNames) {
    if (Math.abs(name.length - len) > halfTol) continue;
    const d = levenshtein(name, guess);
    if (d < best) best = d;
    if (best <= fullTol) return 1;
  }
  if (best <= fullTol) return 1;
  if (len >= 6 && best <= halfTol && best <= Math.ceil(len * 0.4)) return 0.5;
  return 0;
}

/** Binary correctness (solo + the "was it right" check) — full credit only. */
export function isCorrectName(input: string, country: Country): boolean {
  return matchAccuracy(input, country) >= 1;
}
