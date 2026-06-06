import type { Country } from "../data/types";
import { levenshtein, normalize } from "../lib/text";

/**
 * Does a typed answer match the country? Exact match against any accepted name,
 * otherwise allow a small edit distance scaled to the answer length (typo tolerance).
 */
export function isCorrectName(input: string, country: Country): boolean {
  const guess = normalize(input);
  if (!guess) return false;
  if (country.acceptedNames.includes(guess)) return true;

  const tolerance = guess.length <= 4 ? 0 : guess.length <= 7 ? 1 : 2;
  if (tolerance === 0) return false;

  return country.acceptedNames.some((name) => {
    if (Math.abs(name.length - guess.length) > tolerance) return false;
    return levenshtein(name, guess) <= tolerance;
  });
}
