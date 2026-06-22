// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import { createData, UsernameTakenError, type Data, type Queryable, type AttemptInput } from "./db";

function freshDb(): Queryable {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as Queryable;
}

async function makeData(): Promise<Data> {
  const data = createData(freshDb());
  await data.migrate();
  return data;
}

const newUser = (data: Data, username: string) =>
  data.createUser({
    username,
    displayName: username,
    passwordHash: "h",
    passwordSalt: "s",
  });

function soloAttempt(userId: string, gameId: string, mode: string, correct: boolean): AttemptInput {
  return {
    userId,
    gameId,
    source: "solo",
    difficulty: "medium",
    mode,
    countryId: "FRA",
    promptLabel: "France",
    givenAnswer: correct ? "France" : "Spain",
    correctAnswer: "France",
    isCorrect: correct,
    accuracy: correct ? 1 : 0,
    timeMs: 4000,
    scoreAwarded: null,
  };
}

describe("users", () => {
  let data: Data;
  beforeEach(async () => {
    data = await makeData();
  });

  it("creates and finds a user (case-insensitive)", async () => {
    const u = await newUser(data, "Jordan");
    expect(u.username).toBe("Jordan");
    expect(u.username_lower).toBe("jordan");
    expect((await data.findUserByUsername("JORDAN"))?.id).toBe(u.id);
    expect((await data.findUserById(u.id))?.username).toBe("Jordan");
    expect(await data.findUserByUsername("nope")).toBeNull();
  });

  it("rejects a duplicate username regardless of case", async () => {
    await newUser(data, "Sam");
    await expect(newUser(data, "sam")).rejects.toBeInstanceOf(UsernameTakenError);
  });
});

describe("solo stats derived from attempts", () => {
  let data: Data;
  beforeEach(async () => {
    data = await makeData();
  });

  it("aggregates games, best score, avg accuracy, and per-mode accuracy", async () => {
    const u = await newUser(data, "Ann");
    // Game 1: 2/3 correct across modes
    await data.recordAttempts([
      soloAttempt(u.id, "g1", "locate", true),
      soloAttempt(u.id, "g1", "flag", true),
      soloAttempt(u.id, "g1", "name", false),
    ]);
    // Game 2: 1/2 correct
    await data.recordAttempts([
      soloAttempt(u.id, "g2", "locate", true),
      soloAttempt(u.id, "g2", "flag", false),
    ]);

    const stats = await data.getProfileStats(u.id);
    expect(stats.solo.games).toBe(2);
    expect(stats.solo.bestScore).toBe(2); // game 1 had 2 correct
    expect(stats.solo.avgAccuracy).toBeCloseTo(3 / 5); // 3 correct of 5 attempts

    const locate = stats.perMode.find((m) => m.mode === "locate")!;
    expect(locate.attempts).toBe(2);
    expect(locate.correct).toBe(2);
    expect(locate.accuracy).toBe(1);
    const flag = stats.perMode.find((m) => m.mode === "flag")!;
    expect(flag.accuracy).toBeCloseTo(0.5);
  });

  it("returns the raw attempt feed oldest-first", async () => {
    const u = await newUser(data, "Ben");
    await data.recordAttempts([soloAttempt(u.id, "g1", "locate", true), soloAttempt(u.id, "g1", "flag", false)]);
    const feed = await data.getUserAttempts(u.id);
    expect(feed).toHaveLength(2);
    expect(feed[0].country_id).toBe("FRA");
    expect(feed[0].is_correct).toBe(true);
  });
});

describe("multiplayer record + leaderboard", () => {
  let data: Data;
  beforeEach(async () => {
    data = await makeData();
  });

  it("tracks wins/games and orders the leaderboard by wins then best solo", async () => {
    const a = await newUser(data, "Alpha");
    const b = await newUser(data, "Bravo");

    // Alpha wins one game; Bravo loses it.
    await data.recordMpResult("game-1", [
      { userId: a.id, won: true, placement: 1, score: 5000, players: 2 },
      { userId: b.id, won: false, placement: 2, score: 3000, players: 2 },
    ]);
    // Idempotent: same game id should not double-count.
    await data.recordMpResult("game-1", [
      { userId: a.id, won: true, placement: 1, score: 5000, players: 2 },
    ]);

    const aStats = await data.getProfileStats(a.id);
    expect(aStats.mp).toEqual({ games: 1, wins: 1, winRate: 1 });
    const bStats = await data.getProfileStats(b.id);
    expect(bStats.mp.wins).toBe(0);

    // Give Bravo a strong solo game so we can check the tiebreak ordering.
    await data.recordAttempts([
      soloAttempt(b.id, "s1", "locate", true),
      soloAttempt(b.id, "s1", "flag", true),
    ]);

    const board = await data.getLeaderboard(10);
    expect(board[0].username).toBe("Alpha"); // more wins
    expect(board[0].wins).toBe(1);
    expect(board[1].username).toBe("Bravo");
    expect(board[1].bestSolo).toBe(2);
  });
});
