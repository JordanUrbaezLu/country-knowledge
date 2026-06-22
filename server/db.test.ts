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

  it("renames the display name while keeping id and username (so stats stay attributed)", async () => {
    const u = await newUser(data, "Robisaurus");
    const updated = await data.updateDisplayName(u.id, "  Rob  ");
    expect(updated?.id).toBe(u.id);
    expect(updated?.display_name).toBe("Rob"); // trimmed
    expect(updated?.username).toBe("Robisaurus"); // login id unchanged
    expect(updated?.username_lower).toBe("robisaurus");
    // Re-reading the row reflects the new display name; login still finds it.
    expect((await data.findUserById(u.id))?.display_name).toBe("Rob");
    expect((await data.findUserByUsername("robisaurus"))?.id).toBe(u.id);
  });

  it("returns null when renaming a non-existent user", async () => {
    expect(await data.updateDisplayName("00000000-0000-0000-0000-000000000000", "Ghost")).toBeNull();
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

  it("derives XP from attempts, scaled by difficulty", async () => {
    const u = await newUser(data, "Xavier");
    await data.recordAttempts([
      { ...soloAttempt(u.id, "g1", "locate", true), difficulty: "hard" }, // (2 + 10)·2 = 24
      { ...soloAttempt(u.id, "g1", "flag", false), difficulty: "easy" }, // (2 + 0)·1 = 2
    ]);
    expect((await data.getProfileStats(u.id)).xp).toBe(26);
  });
});

describe("multiplayer record + leaderboard", () => {
  let data: Data;
  beforeEach(async () => {
    data = await makeData();
  });

  it("tracks wins/games and ranks the leaderboard by total XP", async () => {
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
    // Alpha has no answered questions — XP is just the single win bonus (25).
    expect(aStats.xp).toBe(25);
    const bStats = await data.getProfileStats(b.id);
    expect(bStats.mp.wins).toBe(0);

    // Bravo answers two medium solo questions correctly: (2 + 10)·1.5 = 18 each.
    await data.recordAttempts([
      soloAttempt(b.id, "s1", "locate", true),
      soloAttempt(b.id, "s1", "flag", true),
    ]);
    expect((await data.getProfileStats(b.id)).xp).toBe(36);

    const board = await data.getLeaderboard(10);
    // Ranked by XP: Bravo (36) now leads Alpha (25) despite Alpha's win.
    expect(board[0].username).toBe("Bravo");
    expect(board[0].xp).toBe(36);
    expect(board[1].username).toBe("Alpha");
    expect(board[1].xp).toBe(25);
  });

  it("excludes reserved zz_ test accounts from the leaderboard", async () => {
    const real = await newUser(data, "Realio");
    const bot = await newUser(data, "zz_bot");
    // both play, so neither is filtered for lack of activity — only the prefix matters
    await data.recordAttempts([soloAttempt(real.id, "r1", "locate", true)]);
    await data.recordAttempts([soloAttempt(bot.id, "b1", "locate", true)]);

    const board = await data.getLeaderboard(10);
    const names = board.map((e) => e.username);
    expect(names).toContain("Realio");
    expect(names).not.toContain("zz_bot");
  });
});

describe("user settings", () => {
  let data: Data;
  beforeEach(async () => {
    data = await makeData();
  });

  it("defaults when unset, then persists merged updates (upsert)", async () => {
    const u = await newUser(data, "Pat");
    expect(await data.getSettings(u.id)).toEqual({ globeMode: "guided", showPoles: true });

    // partial update merges over the defaults...
    const s1 = await data.updateSettings(u.id, { globeMode: "free" });
    expect(s1).toEqual({ globeMode: "free", showPoles: true });
    expect(await data.getSettings(u.id)).toEqual({ globeMode: "free", showPoles: true });

    // ...and over the prior persisted value (not back to defaults).
    const s2 = await data.updateSettings(u.id, { showPoles: false });
    expect(s2).toEqual({ globeMode: "free", showPoles: false });
    expect(await data.getSettings(u.id)).toEqual({ globeMode: "free", showPoles: false });
  });

  it("coerces invalid values, keeping the current settings", async () => {
    const u = await newUser(data, "Quinn");
    await data.updateSettings(u.id, { globeMode: "free" });
    const bad = await data.updateSettings(
      u.id,
      { globeMode: "sideways", showPoles: "yes" } as unknown as Parameters<Data["updateSettings"]>[1],
    );
    expect(bad).toEqual({ globeMode: "free", showPoles: true });
  });
});
