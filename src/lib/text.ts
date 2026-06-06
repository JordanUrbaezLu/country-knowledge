/**
 * Text helpers shared by the answer-alias builder and the quiz matcher.
 */

/**
 * Normalize a country name / typed answer into a comparable key:
 * lowercase, strip diacritics, drop punctuation, collapse whitespace.
 * e.g. "Côte d'Ivoire" -> "cote d ivoire", "U.S.A." -> "usa".
 */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .toLowerCase()
    .replace(/[.''`]/g, "") // drop apostrophes/periods entirely (usa, divoire)
    .replace(/[^a-z0-9]+/g, " ") // any other punctuation -> space
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Classic Levenshtein edit distance (iterative, two-row). Used to accept
 * minor typos in typed answers.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
