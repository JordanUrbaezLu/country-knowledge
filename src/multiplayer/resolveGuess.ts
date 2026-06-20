import { isCorrectName } from "../game/matching";
import type { Country } from "../data/types";
import { normalize } from "../lib/text";

/**
 * Best-effort: which country did this typed answer name? Used so a *wrong* typed
 * guess still lights up the country the player meant on the reveal map (e.g. you
 * typed "Slovakia", it was Slovenia — Slovakia glows in your color). Exact
 * accepted-name matches win; otherwise fall back to the same typo-tolerant
 * matcher the quiz uses. Returns null if nothing plausibly matches.
 */
export function resolveGuessCountryId(input: string, countries: Country[]): string | null {
  const g = normalize(input);
  if (!g) return null;
  for (const c of countries) if (c.acceptedNames.includes(g)) return c.id;
  for (const c of countries) if (isCorrectName(input, c)) return c.id;
  return null;
}
