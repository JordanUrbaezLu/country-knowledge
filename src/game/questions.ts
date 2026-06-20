import type { Country } from "../data/types";

export type QuestionMode = "locate" | "flag" | "name";

export interface Question {
  mode: QuestionMode;
  country: Country;
}

export const MODE_LABELS: Record<QuestionMode, string> = {
  locate: "Name the highlighted country",
  flag: "Whose flag is this?",
  name: "Find this country on the globe",
};

/** How long each mode gets in a timed (multiplayer) round. */
export const MODE_DURATION_MS: Record<QuestionMode, number> = {
  locate: 18000,
  flag: 18000,
  name: 25000, // finding on the globe takes longer, especially with the crosshair
};

const MODES: QuestionMode[] = ["locate", "flag", "name"];

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: "Famous, well-known countries",
  medium: "A broader mix of nations",
  hard: "Anything — including obscure ones",
};

/**
 * How many of the most-prominent countries each difficulty draws from. Harder
 * levels *add* less-famous nations to the easier pool (inclusive, not disjoint),
 * so "hard" can still surface the easy ones but reaches deep into the long tail.
 */
const POOL_SIZE: Record<Difficulty, number> = {
  easy: 50,
  medium: 120,
  hard: Infinity,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Quizzable countries ordered by "fame" — a 50/50 blend of population and GDP,
 * each normalized to the dataset max. This surfaces both the populous (India,
 * Nigeria) and the rich-but-small (Switzerland, Norway) near the top, and sinks
 * obscure micro-states to the tail. Countries missing both metrics rank last.
 */
export function fameRanked(countries: Country[]): Country[] {
  const pool = countries.filter((c) => c.quizzable && c.iso2);
  const maxPop = Math.max(1, ...pool.map((c) => c.population ?? 0));
  const maxGdp = Math.max(1, ...pool.map((c) => c.gdpMd ?? 0));
  const fame = (c: Country) =>
    0.5 * ((c.population ?? 0) / maxPop) + 0.5 * ((c.gdpMd ?? 0) / maxGdp);
  return [...pool].sort((a, b) => fame(b) - fame(a));
}

/** The countries eligible for a round at the given difficulty. */
export function difficultyPool(countries: Country[], difficulty: Difficulty): Country[] {
  const ranked = fameRanked(countries);
  const size = POOL_SIZE[difficulty];
  return Number.isFinite(size) ? ranked.slice(0, size) : ranked;
}

/**
 * Build a round of `count` questions from distinct countries in the difficulty's
 * pool, with a balanced mix of the three modes in randomized order.
 */
export function generateRound(
  countries: Country[],
  count = 10,
  difficulty: Difficulty = "medium",
): Question[] {
  const pool = difficultyPool(countries, difficulty);
  const picked = shuffle(pool).slice(0, Math.min(count, pool.length));
  return shuffle(picked.map((country, i) => ({ mode: MODES[i % MODES.length], country })));
}
