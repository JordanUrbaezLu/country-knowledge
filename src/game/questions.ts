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

const MODES: QuestionMode[] = ["locate", "flag", "name"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a round of `count` questions from distinct quizzable countries,
 * with a balanced mix of the three modes in randomized order.
 */
export function generateRound(countries: Country[], count = 10): Question[] {
  const pool = countries.filter((c) => c.quizzable && c.iso2);
  const picked = shuffle(pool).slice(0, Math.min(count, pool.length));
  return shuffle(picked.map((country, i) => ({ mode: MODES[i % MODES.length], country })));
}
