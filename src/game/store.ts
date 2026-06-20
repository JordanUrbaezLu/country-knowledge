import { create } from "zustand";
import type { Country } from "../data/types";
import { isCorrectName } from "./matching";
import { generateRound, type Difficulty, type Question } from "./questions";

export type GameStatus = "idle" | "playing" | "feedback" | "done";

export interface AnswerRecord {
  question: Question;
  correct: boolean;
  given: string;
}

interface GameState {
  status: GameStatus;
  difficulty: Difficulty;
  questions: Question[];
  index: number;
  score: number;
  lastCorrect: boolean | null;
  lastGiven: string;
  records: AnswerRecord[];
  best: number;
  setDifficulty: (d: Difficulty) => void;
  start: (countries: Country[], difficulty?: Difficulty) => void;
  answerTyped: (input: string) => void;
  answerClick: (country: Country) => void;
  next: () => void;
  reset: () => void;
}

const BEST_KEY = "ck.bestScore";
const loadBest = (): number => {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(BEST_KEY) : null;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
};

export const useGame = create<GameState>((set, get) => ({
  status: "idle",
  difficulty: "medium",
  questions: [],
  index: 0,
  score: 0,
  lastCorrect: null,
  lastGiven: "",
  records: [],
  best: loadBest(),

  setDifficulty: (d) => set({ difficulty: d }),

  start: (countries, difficulty) =>
    set((s) => {
      const diff = difficulty ?? s.difficulty;
      return {
        status: "playing",
        difficulty: diff,
        questions: generateRound(countries, 10, diff),
        index: 0,
        score: 0,
        lastCorrect: null,
        lastGiven: "",
        records: [],
      };
    }),

  answerTyped: (input) => {
    const { status, questions, index } = get();
    if (status !== "playing") return;
    const q = questions[index];
    const correct = isCorrectName(input, q.country);
    set((s) => ({
      status: "feedback",
      lastCorrect: correct,
      lastGiven: input.trim(),
      score: s.score + (correct ? 1 : 0),
      records: [...s.records, { question: q, correct, given: input.trim() }],
    }));
  },

  answerClick: (country) => {
    const { status, questions, index } = get();
    if (status !== "playing") return;
    const q = questions[index];
    const correct = country.id === q.country.id;
    set((s) => ({
      status: "feedback",
      lastCorrect: correct,
      lastGiven: country.name,
      score: s.score + (correct ? 1 : 0),
      records: [...s.records, { question: q, correct, given: country.name }],
    }));
  },

  next: () => {
    const { index, questions, score, best } = get();
    if (index + 1 >= questions.length) {
      const newBest = Math.max(best, score);
      if (newBest !== best && typeof localStorage !== "undefined") {
        localStorage.setItem(BEST_KEY, String(newBest));
      }
      set({ status: "done", best: newBest });
    } else {
      set({ index: index + 1, status: "playing", lastCorrect: null, lastGiven: "" });
    }
  },

  reset: () => set({ status: "idle", lastCorrect: null, lastGiven: "" }),
}));
