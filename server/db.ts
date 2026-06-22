/**
 * Postgres data layer for accounts, the per-answer attempt log, and derived stats.
 *
 * Design notes:
 * - One source of truth: `attempts` (one row per answered question). Every stat
 *   (solo summary, per-mode accuracy, leaderboard) is DERIVED from it — no rollup
 *   tables, so nothing can drift out of sync.
 * - `mp_games` is the one exception: "who won the room" is a per-game fact that a
 *   per-question row can't express, so we keep a small placement row per player.
 * - Dependency-injected `Queryable` (not a hard `pg.Pool`) so tests can run the
 *   exact same SQL against an in-memory Postgres (`pg-mem`) with no live DB.
 * - UUIDs are generated in JS (crypto.randomUUID) rather than via a pg extension,
 *   so the schema needs no `pgcrypto`/`uuid-ossp` (also keeps pg-mem happy).
 */
import { randomUUID } from "node:crypto";

/** Minimal surface both `pg.Pool` and pg-mem's Pool satisfy. */
export interface Queryable {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface UserRow {
  id: string;
  username: string;
  username_lower: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  guest_id: string | null;
  created_at: string;
}

/** Public shape (never leak password fields to the client). */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
}

export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.id, username: u.username, displayName: u.display_name };
}

export type AttemptSource = "solo" | "mp";

export interface AttemptInput {
  userId: string;
  gameId: string;
  source: AttemptSource;
  difficulty: string | null;
  mode: string; // QuestionMode: "locate" | "flag" | "name"
  countryId: string;
  promptLabel: string | null;
  givenAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean;
  accuracy: number | null;
  timeMs: number | null;
  scoreAwarded: number | null;
}

export interface AttemptRow {
  id: string;
  user_id: string;
  game_id: string;
  source: AttemptSource;
  difficulty: string | null;
  mode: string;
  country_id: string;
  prompt_label: string | null;
  given_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean;
  accuracy: number | null;
  time_ms: number | null;
  score_awarded: number | null;
  created_at: string;
}

export interface MpResultInput {
  userId: string;
  won: boolean;
  placement: number;
  score: number;
  players: number;
}

export interface ProfileStats {
  solo: { games: number; bestScore: number; avgAccuracy: number };
  perMode: { mode: string; attempts: number; correct: number; accuracy: number }[];
  mp: { games: number; wins: number; winRate: number };
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  wins: number;
  mpGames: number;
  bestSolo: number;
}

/** Thrown by createUser when the (case-insensitive) username already exists. */
export class UsernameTakenError extends Error {
  constructor() {
    super("That username is taken");
    this.name = "UsernameTakenError";
  }
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function createData(db: Queryable) {
  async function migrate(): Promise<void> {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        username text NOT NULL,
        username_lower text NOT NULL UNIQUE,
        display_name text NOT NULL,
        password_hash text NOT NULL,
        password_salt text NOT NULL,
        guest_id text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS attempts (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        game_id text NOT NULL,
        source text NOT NULL,
        difficulty text,
        mode text NOT NULL,
        country_id text NOT NULL,
        prompt_label text,
        given_answer text,
        correct_answer text,
        is_correct boolean NOT NULL,
        accuracy real,
        time_ms integer,
        score_awarded integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS mp_games (
        game_id text NOT NULL,
        user_id text NOT NULL,
        won boolean NOT NULL,
        placement integer,
        score integer,
        players integer,
        played_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (game_id, user_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS attempts_user_created ON attempts (user_id, created_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS attempts_user_mode ON attempts (user_id, mode)`);
    await db.query(`CREATE INDEX IF NOT EXISTS mp_games_user ON mp_games (user_id)`);
  }

  async function findUserByUsername(username: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>(
      `SELECT * FROM users WHERE username_lower = $1`,
      [username.trim().toLowerCase()],
    );
    return rows[0] ?? null;
  }

  async function findUserById(id: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async function createUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    passwordSalt: string;
    guestId?: string | null;
  }): Promise<UserRow> {
    const usernameLower = input.username.trim().toLowerCase();
    // App-level pre-check for a friendly error; the UNIQUE index is the real guard.
    if (await findUserByUsername(usernameLower)) throw new UsernameTakenError();
    const id = randomUUID();
    try {
      const { rows } = await db.query<UserRow>(
        `INSERT INTO users (id, username, username_lower, display_name, password_hash, password_salt, guest_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id,
          input.username.trim(),
          usernameLower,
          input.displayName.trim(),
          input.passwordHash,
          input.passwordSalt,
          input.guestId ?? null,
        ],
      );
      return rows[0];
    } catch (e) {
      // Unique-violation backstop in case two signups raced past the pre-check.
      if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
        throw new UsernameTakenError();
      }
      throw e;
    }
  }

  async function recordAttempts(rows: AttemptInput[]): Promise<void> {
    for (const a of rows) {
      await db.query(
        `INSERT INTO attempts
           (user_id, game_id, source, difficulty, mode, country_id, prompt_label,
            given_answer, correct_answer, is_correct, accuracy, time_ms, score_awarded)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          a.userId,
          a.gameId,
          a.source,
          a.difficulty,
          a.mode,
          a.countryId,
          a.promptLabel,
          a.givenAnswer,
          a.correctAnswer,
          a.isCorrect,
          a.accuracy,
          a.timeMs,
          a.scoreAwarded,
        ],
      );
    }
  }

  async function recordMpResult(gameId: string, results: MpResultInput[]): Promise<void> {
    for (const r of results) {
      await db.query(
        `INSERT INTO mp_games (game_id, user_id, won, placement, score, players)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (game_id, user_id) DO NOTHING`,
        [gameId, r.userId, r.won, r.placement, r.score, r.players],
      );
    }
  }

  async function getProfileStats(userId: string): Promise<ProfileStats> {
    // Solo: one row per game with its correct-count, reduced in JS.
    const solo = await db.query<{ correct: unknown; total: unknown }>(
      `SELECT SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct, COUNT(*) AS total
       FROM attempts WHERE user_id = $1 AND source = 'solo'
       GROUP BY game_id`,
      [userId],
    );
    let bestScore = 0;
    let soloCorrect = 0;
    let soloTotal = 0;
    for (const r of solo.rows) {
      const c = num(r.correct);
      bestScore = Math.max(bestScore, c);
      soloCorrect += c;
      soloTotal += num(r.total);
    }

    const perModeRes = await db.query<{ mode: string; attempts: unknown; correct: unknown }>(
      `SELECT mode, COUNT(*) AS attempts, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct
       FROM attempts WHERE user_id = $1 GROUP BY mode`,
      [userId],
    );
    const perMode = perModeRes.rows.map((r) => {
      const attempts = num(r.attempts);
      const correct = num(r.correct);
      return { mode: r.mode, attempts, correct, accuracy: attempts ? correct / attempts : 0 };
    });

    const mpRes = await db.query<{ games: unknown; wins: unknown }>(
      `SELECT COUNT(*) AS games, SUM(CASE WHEN won THEN 1 ELSE 0 END) AS wins
       FROM mp_games WHERE user_id = $1`,
      [userId],
    );
    const mpGames = num(mpRes.rows[0]?.games);
    const mpWins = num(mpRes.rows[0]?.wins);

    return {
      solo: {
        games: solo.rows.length,
        bestScore,
        avgAccuracy: soloTotal ? soloCorrect / soloTotal : 0,
      },
      perMode,
      mp: { games: mpGames, wins: mpWins, winRate: mpGames ? mpWins / mpGames : 0 },
    };
  }

  /**
   * Top players, joined in JS to keep the SQL trivial (pg-mem-safe) — fine at the
   * family/friends scale this serves. Ordered by MP wins, then best solo score.
   */
  async function getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const users = await db.query<{
      id: string;
      username: string;
      display_name: string;
      created_at: string;
    }>(`SELECT id, username, display_name, created_at FROM users`);

    const mp = await db.query<{ user_id: string; wins: unknown; games: unknown }>(
      `SELECT user_id, SUM(CASE WHEN won THEN 1 ELSE 0 END) AS wins, COUNT(*) AS games
       FROM mp_games GROUP BY user_id`,
    );
    const winsByUser = new Map<string, { wins: number; games: number }>();
    for (const r of mp.rows) winsByUser.set(r.user_id, { wins: num(r.wins), games: num(r.games) });

    const soloGames = await db.query<{ user_id: string; c: unknown }>(
      `SELECT user_id, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS c
       FROM attempts WHERE source = 'solo' GROUP BY user_id, game_id`,
    );
    const bestByUser = new Map<string, number>();
    for (const r of soloGames.rows) {
      bestByUser.set(r.user_id, Math.max(bestByUser.get(r.user_id) ?? 0, num(r.c)));
    }

    return users.rows
      .map((u) => {
        const mpRec = winsByUser.get(u.id) ?? { wins: 0, games: 0 };
        return {
          userId: u.id,
          username: u.username,
          displayName: u.display_name,
          wins: mpRec.wins,
          mpGames: mpRec.games,
          bestSolo: bestByUser.get(u.id) ?? 0,
          createdAt: u.created_at,
        };
      })
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.bestSolo - a.bestSolo ||
          String(a.createdAt).localeCompare(String(b.createdAt)),
      )
      .slice(0, limit)
      .map(({ createdAt: _createdAt, ...rest }) => rest);
  }

  /** All of one user's attempts, oldest first — the raw feed the insights script analyzes. */
  async function getUserAttempts(userId: string): Promise<AttemptRow[]> {
    const { rows } = await db.query<AttemptRow>(
      `SELECT * FROM attempts WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
      [userId],
    );
    return rows;
  }

  return {
    migrate,
    findUserByUsername,
    findUserById,
    createUser,
    recordAttempts,
    recordMpResult,
    getProfileStats,
    getLeaderboard,
    getUserAttempts,
  };
}

export type Data = ReturnType<typeof createData>;

/**
 * Lazily build the production data layer from a real `pg` Pool (DATABASE_URL).
 * Imported dynamically so unit tests that inject pg-mem never load `pg`.
 */
let prodData: Data | null = null;
export async function getData(): Promise<Data> {
  if (prodData) return prodData;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { Pool } = await import("pg");
  // We pass `ssl` explicitly, so drop sslmode/channel_binding from the URL — they
  // are redundant and otherwise trigger a noisy pg-connection-string deprecation
  // warning on every boot. Neon and most managed PGs require SSL; rejectUnauthorized
  // is false because the managed cert chain isn't in Node's default trust store.
  let connectionString = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("channel_binding");
    connectionString = parsed.toString();
  } catch {
    /* not a parseable URL — pass through unchanged */
  }
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  prodData = createData(pool as unknown as Queryable);
  return prodData;
}
