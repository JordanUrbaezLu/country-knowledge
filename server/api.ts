/**
 * HTTP JSON API for accounts, stats, leaderboard, and (read-only) insights.
 * Mounted at `/api/*` by server/index.ts, before the static SPA handler.
 *
 * Auth is a server-set httpOnly cookie (see auth.ts). `/api/me` is intentionally
 * NOT an error when logged out — it returns `{ user: null }` so the client's boot
 * check is non-blocking and guests are never interrupted.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  type Data,
  type AttemptInput,
  type MpResultInput,
  toPublicUser,
  UsernameTakenError,
} from "./db";
import {
  hashPassword,
  verifyPassword,
  signSession,
  readSession,
  sessionCookie,
  clearSessionCookie,
  validateUsername,
  validatePassword,
  createRateLimiter,
} from "./auth";

const MAX_BODY_BYTES = 32 * 1024;
const VALID_MODES = new Set(["locate", "flag", "name"]);
const MAX_ATTEMPTS_PER_POST = 50;

export interface ApiDeps {
  data: Data;
  /** Path to the committed insights snapshot; overridable for tests. */
  insightsPath?: string;
}

// Auth endpoints are the only abuse surface — cap attempts per IP.
const authLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 30 });

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(s);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer | string) => {
      const buf = typeof c === "string" ? Buffer.from(c) : c;
      size += buf.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function isSecure(req: IncomingMessage): boolean {
  const xfp = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(xfp) ? xfp[0] : xfp;
  if (proto) return proto.split(",")[0].trim() === "https";
  return (req.socket as { encrypted?: boolean }).encrypted === true;
}

function clientIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  const v = Array.isArray(xff) ? xff[0] : xff;
  return v?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Read one user's entry from the committed insights snapshot (or null). */
function readInsight(path: string, userId: string): { message: string; generated_at?: string } | null {
  try {
    statSync(path); // cheap existence check; file is absent until the script runs once
    const all = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      { message: string; generated_at?: string }
    >;
    return all[userId] ?? null;
  } catch {
    return null;
  }
}

/** Returns true if the request was an `/api/*` route this handled. */
export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ApiDeps,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/api/")) return false;

  const { data } = deps;
  const secure = isSecure(req);
  const method = req.method ?? "GET";

  try {
    // ---- POST /api/signup ----
    if (path === "/api/signup" && method === "POST") {
      if (!authLimiter(clientIp(req))) return sendJson(res, 429, { error: "Too many attempts — try again soon" }), true;
      const body = (await readBody(req)) as Record<string, unknown>;
      const username = asString(body.username)?.trim() ?? "";
      const password = asString(body.password) ?? "";
      const guestId = asString(body.guestId);
      const uErr = validateUsername(username);
      if (uErr) return sendJson(res, 400, { error: uErr }), true;
      const pErr = validatePassword(password);
      if (pErr) return sendJson(res, 400, { error: pErr }), true;

      const { hash, salt } = hashPassword(password);
      try {
        const user = await data.createUser({
          username,
          displayName: username,
          passwordHash: hash,
          passwordSalt: salt,
          guestId,
        });
        res.setHeader("set-cookie", sessionCookie(signSession(user.id), { secure }));
        const stats = await data.getProfileStats(user.id);
        return sendJson(res, 200, { user: toPublicUser(user), stats }), true;
      } catch (e) {
        if (e instanceof UsernameTakenError) return sendJson(res, 409, { error: e.message }), true;
        throw e;
      }
    }

    // ---- POST /api/login ----
    if (path === "/api/login" && method === "POST") {
      if (!authLimiter(clientIp(req))) return sendJson(res, 429, { error: "Too many attempts — try again soon" }), true;
      const body = (await readBody(req)) as Record<string, unknown>;
      const username = asString(body.username)?.trim() ?? "";
      const password = asString(body.password) ?? "";
      const user = await data.findUserByUsername(username);
      // Same message whether the user exists or not (no account enumeration).
      if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
        return sendJson(res, 401, { error: "Wrong username or password" }), true;
      }
      res.setHeader("set-cookie", sessionCookie(signSession(user.id), { secure }));
      const stats = await data.getProfileStats(user.id);
      return sendJson(res, 200, { user: toPublicUser(user), stats }), true;
    }

    // ---- POST /api/logout ----
    if (path === "/api/logout" && method === "POST") {
      res.setHeader("set-cookie", clearSessionCookie({ secure }));
      return sendJson(res, 200, { ok: true }), true;
    }

    // ---- GET /api/me ----  (not an error when logged out)
    if (path === "/api/me" && method === "GET") {
      const userId = readSession(req);
      if (!userId) return sendJson(res, 200, { user: null }), true;
      const user = await data.findUserById(userId);
      if (!user) return sendJson(res, 200, { user: null }), true;
      // Sliding renewal: refresh the cookie so active players never expire.
      res.setHeader("set-cookie", sessionCookie(signSession(user.id), { secure }));
      const stats = await data.getProfileStats(user.id);
      return sendJson(res, 200, { user: toPublicUser(user), stats }), true;
    }

    // ---- POST /api/solo/result ----  (authed)
    if (path === "/api/solo/result" && method === "POST") {
      const userId = readSession(req);
      if (!userId) return sendJson(res, 401, { error: "Not logged in" }), true;
      const body = (await readBody(req)) as Record<string, unknown>;
      const gameId = asString(body.gameId) ?? randomUUID();
      const difficulty = asString(body.difficulty);
      const raw = Array.isArray(body.attempts) ? body.attempts : [];
      const rows: AttemptInput[] = [];
      for (const item of raw.slice(0, MAX_ATTEMPTS_PER_POST)) {
        const a = item as Record<string, unknown>;
        const mode = asString(a.mode);
        const countryId = asString(a.countryId);
        if (!mode || !VALID_MODES.has(mode) || !countryId) continue;
        const accuracy = typeof a.accuracy === "number" ? a.accuracy : a.isCorrect ? 1 : 0;
        rows.push({
          userId,
          gameId,
          source: "solo",
          difficulty,
          mode,
          countryId,
          promptLabel: asString(a.promptLabel),
          givenAnswer: asString(a.givenAnswer),
          correctAnswer: asString(a.correctAnswer),
          isCorrect: a.isCorrect === true,
          accuracy,
          timeMs: typeof a.timeMs === "number" ? a.timeMs : null,
          scoreAwarded: typeof a.scoreAwarded === "number" ? a.scoreAwarded : null,
        });
      }
      if (rows.length) await data.recordAttempts(rows);
      const stats = await data.getProfileStats(userId);
      return sendJson(res, 200, { ok: true, recorded: rows.length, stats }), true;
    }

    // ---- GET /api/leaderboard ----
    if (path === "/api/leaderboard" && method === "GET") {
      const n = Number(url.searchParams.get("limit"));
      const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 20;
      const leaderboard = await data.getLeaderboard(limit);
      return sendJson(res, 200, { leaderboard }), true;
    }

    // ---- GET /api/insights ----  (authed; reads the committed snapshot)
    if (path === "/api/insights" && method === "GET") {
      const userId = readSession(req);
      if (!userId) return sendJson(res, 401, { error: "Not logged in" }), true;
      const path0 = deps.insightsPath ?? `${process.cwd()}/data/insights.json`;
      return sendJson(res, 200, { insight: readInsight(path0, userId) }), true;
    }

    return sendJson(res, 404, { error: "Not found" }), true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "body too large" ? 413 : msg === "invalid json" ? 400 : 500;
    if (status === 500) console.error("[api] error:", e);
    return sendJson(res, status, { error: status === 500 ? "Server error" : msg }), true;
  }
}

export type { MpResultInput };
