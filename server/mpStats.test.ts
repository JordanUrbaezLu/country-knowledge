// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ServerMsg } from "../src/multiplayer/protocol";
import { applyBroadcast, attemptsFromReveal, mpResultsFromGameover, type RoomTrack } from "./mpStats";

const reveal = [
  { id: "p1", accuracy: 1, pickedLabel: "France", elapsedMs: 3000, points: 800 },
  { id: "p2", accuracy: 0.5, pickedLabel: "Frans", elapsedMs: 5000, points: 300 },
  { id: "guest", accuracy: 0, pickedLabel: "", elapsedMs: null, points: 0 },
];

describe("attemptsFromReveal", () => {
  it("emits rows only for logged-in players, mapping accuracy → isCorrect", () => {
    const userIds = new Map([
      ["p1", "user-1"],
      ["p2", "user-2"],
      // "guest" intentionally absent
    ]);
    const rows = attemptsFromReveal(reveal, "FRA", { gameId: "g1", mode: "flag", difficulty: "hard" }, userIds);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId: "user-1",
      gameId: "g1",
      source: "mp",
      mode: "flag",
      difficulty: "hard",
      countryId: "FRA",
      givenAnswer: "France",
      isCorrect: true,
      accuracy: 1,
      scoreAwarded: 800,
    });
    // near-miss: kept as accuracy 0.5 but not counted as a strict correct
    expect(rows[1]).toMatchObject({ userId: "user-2", isCorrect: false, accuracy: 0.5 });
  });

  it("returns nothing when no player is logged in", () => {
    expect(attemptsFromReveal(reveal, "FRA", { gameId: "g1", mode: "flag", difficulty: null }, new Map())).toEqual([]);
  });
});

describe("mpResultsFromGameover", () => {
  it("marks the top player the winner and records placements", () => {
    const lb = [
      { id: "p1", score: 5000 },
      { id: "p2", score: 3000 },
    ];
    const out = mpResultsFromGameover(lb, new Map([["p1", "user-1"], ["p2", "user-2"]]));
    expect(out).toEqual([
      { userId: "user-1", won: true, placement: 1, score: 5000, players: 2 },
      { userId: "user-2", won: false, placement: 2, score: 3000, players: 2 },
    ]);
  });

  it("does not award a win in a solo (1-player) game", () => {
    const out = mpResultsFromGameover([{ id: "p1", score: 100 }], new Map([["p1", "user-1"]]));
    expect(out[0].won).toBe(false);
    expect(out[0].placement).toBe(1);
  });

  it("skips guests", () => {
    const out = mpResultsFromGameover([{ id: "p1", score: 100 }], new Map());
    expect(out).toEqual([]);
  });
});

describe("applyBroadcast lifecycle", () => {
  const newTrack = (): RoomTrack => ({
    userIds: new Map([["p1", "u1"]]),
    gameId: null,
    mode: null,
    difficulty: null,
  });
  let n = 0;
  const gid = () => `game-${++n}`;

  it("captures difficulty, starts a game, logs reveals, finalizes on gameover", () => {
    const t = newTrack();

    applyBroadcast(
      t,
      { t: "state", room: { code: "AAAA", status: "lobby", difficulty: "hard", round: 0, totalRounds: 10, players: [], hostId: "p1" } } as ServerMsg,
      gid,
    );
    expect(t.difficulty).toBe("hard");

    applyBroadcast(
      t,
      { t: "question", round: 0, totalRounds: 10, mode: "flag", countryId: "FRA", durationMs: 18000, remainingMs: 18000 } as ServerMsg,
      gid,
    );
    expect(t.gameId).toBeTruthy();
    expect(t.mode).toBe("flag");
    const g = t.gameId;

    const reveal = applyBroadcast(
      t,
      {
        t: "reveal",
        round: 0,
        totalRounds: 10,
        countryId: "FRA",
        results: [{ id: "p1", accuracy: 1, points: 800, pickedLabel: "France", pickedCountryId: "FRA", elapsedMs: 3000, score: 800 }],
        leaderboard: [],
        nextInMs: 6500,
      } as ServerMsg,
      gid,
    );
    expect(reveal.attempts).toHaveLength(1);
    expect(reveal.attempts?.[0]).toMatchObject({ userId: "u1", gameId: g, mode: "flag", difficulty: "hard", source: "mp" });

    const over = applyBroadcast(
      t,
      { t: "gameover", leaderboard: [{ id: "p1", score: 800, name: "x", connected: true, colorIndex: 0, answered: true }] } as ServerMsg,
      gid,
    );
    expect(over.mpResult?.gameId).toBe(g);
    expect(over.mpResult?.results[0]).toMatchObject({ userId: "u1", placement: 1 });
    expect(t.gameId).toBeNull(); // cleared, ready for the next match
  });

  it("ignores a reveal with no active game", () => {
    const t = newTrack();
    const eff = applyBroadcast(
      t,
      { t: "reveal", round: 0, totalRounds: 10, countryId: "FRA", results: [], leaderboard: [], nextInMs: 0 } as ServerMsg,
      gid,
    );
    expect(eff).toEqual({});
  });
});
