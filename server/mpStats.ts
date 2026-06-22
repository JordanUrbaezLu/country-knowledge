/**
 * Pure mappers from multiplayer broadcasts → DB rows. Kept separate from the
 * (stateful, hot-path) server wiring so the logic is unit-testable and can't
 * disrupt a live game. The server adapter tracks the per-room context
 * (`RoomTrack`) and calls these on each reveal / gameover.
 *
 * The engine is dataset-free, so the server only knows countryIds — we store the
 * id for prompt/correct fields and let the local insights script (which has the
 * country dataset) resolve names later.
 */
import type { ServerMsg } from "../src/multiplayer/protocol";
import type { AttemptInput, MpResultInput } from "./db";

export interface RoomTrack {
  /** player id (localStorage uuid) → account user id, for logged-in players only */
  userIds: Map<string, string>;
  /** stable id for the current match (one per start→gameover); null between matches */
  gameId: string | null;
  /** mode of the in-flight question (reveal messages don't carry it) */
  mode: string | null;
  /** difficulty of the current match (captured from the room snapshot) */
  difficulty: string | null;
}

interface RevealResult {
  id: string;
  accuracy: number;
  pickedLabel: string;
  elapsedMs: number | null;
  points: number;
}

/** One attempt row per LOGGED-IN player who was in this round. */
export function attemptsFromReveal(
  results: RevealResult[],
  countryId: string,
  ctx: { gameId: string; mode: string | null; difficulty: string | null },
  userIds: Map<string, string>,
): AttemptInput[] {
  const rows: AttemptInput[] = [];
  for (const r of results) {
    const userId = userIds.get(r.id);
    if (!userId) continue; // guest — not recorded
    rows.push({
      userId,
      gameId: ctx.gameId,
      source: "mp",
      difficulty: ctx.difficulty,
      mode: ctx.mode ?? "unknown",
      countryId,
      promptLabel: countryId,
      givenAnswer: r.pickedLabel || null,
      correctAnswer: countryId,
      isCorrect: r.accuracy >= 1, // exact; near-miss (0.5) kept in `accuracy`
      accuracy: r.accuracy,
      timeMs: r.elapsedMs,
      scoreAwarded: r.points,
    });
  }
  return rows;
}

/** Final placement per logged-in player. Winner = rank 1 (only if >1 player). */
export function mpResultsFromGameover(
  leaderboard: { id: string; score: number }[],
  userIds: Map<string, string>,
): MpResultInput[] {
  const players = leaderboard.length;
  const out: MpResultInput[] = [];
  leaderboard.forEach((p, i) => {
    const userId = userIds.get(p.id);
    if (!userId) return;
    out.push({ userId, won: i === 0 && players > 1, placement: i + 1, score: p.score, players });
  });
  return out;
}

/**
 * Pure reducer over the server→client broadcast stream: mutates the per-room
 * `track` (gameId lifecycle, current mode, difficulty) and returns the DB writes
 * to perform. `newGameId` is injected so this stays deterministic in tests. The
 * server adapter is a thin wrapper that just performs the returned writes.
 */
export function applyBroadcast(
  track: RoomTrack,
  msg: ServerMsg,
  newGameId: () => string,
): { attempts?: AttemptInput[]; mpResult?: { gameId: string; results: MpResultInput[] } } {
  switch (msg.t) {
    case "state":
      track.difficulty = msg.room.difficulty;
      return {};
    case "question":
      if (msg.round === 0 || !track.gameId) track.gameId = newGameId();
      track.mode = msg.mode;
      return {};
    case "reveal": {
      if (!track.gameId) return {};
      return {
        attempts: attemptsFromReveal(
          msg.results,
          msg.countryId,
          { gameId: track.gameId, mode: track.mode, difficulty: track.difficulty },
          track.userIds,
        ),
      };
    }
    case "gameover": {
      if (!track.gameId) return {};
      const results = mpResultsFromGameover(msg.leaderboard, track.userIds);
      const gameId = track.gameId;
      track.gameId = null;
      track.mode = null;
      return { mpResult: { gameId, results } };
    }
    default:
      return {};
  }
}
