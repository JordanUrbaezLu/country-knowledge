/**
 * Wire protocol shared by the browser client (`src/multiplayer/*`) and the
 * authoritative game server (`server/index.ts`). Keep this transport-agnostic:
 * plain data + pure functions only, so both sides import one source of truth.
 */
import type { Difficulty, QuestionMode } from "../game/questions";

export type { Difficulty, QuestionMode };

export const TOTAL_ROUNDS = 10;
/** How long the per-round results stay up before auto-advancing. */
export const REVEAL_MS = 6500;
/** Number of distinct player identity colors (must equal PLAYER_COLORS.length). */
export const COLOR_SLOTS = 10;
/** A correct answer is worth this at t=0, decaying to MIN_CORRECT_POINTS at the buzzer. */
export const MAX_POINTS = 1000;
export const MIN_CORRECT_POINTS = 100;

/** GeoGuessr-style speed bonus: full marks for instant, a floor for a last-second correct, 0 for wrong. */
export function scorePoints(correct: boolean, elapsedMs: number, durationMs: number): number {
  if (!correct) return 0;
  const frac = durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 1;
  return Math.round(MIN_CORRECT_POINTS + (MAX_POINTS - MIN_CORRECT_POINTS) * (1 - frac));
}

/** One question in a host-generated round sequence. The server stays dataset-free. */
export interface SeqItem {
  countryId: string;
  mode: QuestionMode;
  durationMs: number;
}

export type RoomStatus = "lobby" | "question" | "reveal" | "gameover";

export interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** stable identity color slot, assigned on join (index into PLAYER_COLORS) */
  colorIndex: number;
  /** has answered the *current* question (reset each round) */
  answered: boolean;
}

/** Full room snapshot — sent on join and whenever the lobby/player set changes. */
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  difficulty: Difficulty | null;
  /** 0-based index of the current/last round */
  round: number;
  totalRounds: number;
  players: PlayerInfo[];
  hostId: string | null;
}

/** One player's outcome for a single round, shown in the reveal. */
export interface RoundResult {
  id: string;
  name: string;
  correct: boolean;
  points: number;
  /** what they typed/clicked, or "" if they didn't answer in time */
  pickedLabel: string;
  /** the country they guessed (so the reveal can light it up); null if unresolved/no answer */
  pickedCountryId: string | null;
  elapsedMs: number | null;
  /** running total after this round */
  score: number;
}

// ---------- client -> server ----------
export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "rename"; name: string }
  | { t: "start"; difficulty: Difficulty; sequence: SeqItem[] }
  | { t: "answer"; correct: boolean; pickedLabel: string; pickedCountryId: string | null }
  // `expect`/`round` make skip idempotent: the server ignores a stale click that
  // arrives after the round already auto-advanced, so it can't skip the NEXT one.
  | { t: "skip"; expect?: "question" | "reveal"; round?: number }
  | { t: "playAgain"; difficulty: Difficulty; sequence: SeqItem[] };

// ---------- server -> client ----------
export type ServerMsg =
  | { t: "state"; room: RoomSnapshot }
  | {
      t: "question";
      round: number;
      totalRounds: number;
      mode: QuestionMode;
      countryId: string;
      /** full length of this round, for the timer ring's scale */
      durationMs: number;
      /** server-computed time left at send — so late joiners/laggy clients show the *same* countdown */
      remainingMs: number;
    }
  | {
      t: "reveal";
      round: number;
      totalRounds: number;
      // clients resolve the country name from countryId via their own dataset
      countryId: string;
      results: RoundResult[];
      leaderboard: PlayerInfo[];
      nextInMs: number;
    }
  | { t: "gameover"; leaderboard: PlayerInfo[] }
  | { t: "error"; message: string };

export const encode = (m: ClientMsg | ServerMsg): string => JSON.stringify(m);
