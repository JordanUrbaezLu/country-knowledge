// @vitest-environment node
process.env.SESSION_SECRET = "test-secret-for-api";
import { describe, it, expect, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { newDb } from "pg-mem";
import { createData, type Data, type Queryable } from "./db";
import { handleApi } from "./api";

async function makeData(): Promise<Data> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const data = createData(new Pool() as unknown as Queryable);
  await data.migrate();
  return data;
}

interface CallOpts {
  method?: string;
  path: string;
  body?: unknown;
  cookie?: string;
  insightsPath?: string;
}

interface FakeRes {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
}

async function call(data: Data, opts: CallOpts) {
  const payload = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const req = Readable.from(payload ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    socket: { remoteAddress: string; encrypted: boolean };
  };
  req.method = opts.method ?? "GET";
  req.url = opts.path;
  req.headers = { cookie: opts.cookie };
  req.socket = { remoteAddress: "127.0.0.1", encrypted: false };

  const res: FakeRes = { statusCode: 0, headers: {}, body: "" };
  const resLike = {
    setHeader(k: string, v: string | string[]) {
      res.headers[k.toLowerCase()] = v;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      res.statusCode = status;
      if (headers) for (const k of Object.keys(headers)) res.headers[k.toLowerCase()] = headers[k];
      return this;
    },
    end(s?: string) {
      if (s) res.body = s;
    },
  } as unknown as ServerResponse;

  const handled = await handleApi(req, resLike, { data, insightsPath: opts.insightsPath });
  return { handled, status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

const cookieFrom = (headers: Record<string, string | string[]>): string => {
  const sc = String(headers["set-cookie"] ?? "");
  const m = /gr_session=([^;]+)/.exec(sc);
  return `gr_session=${m?.[1] ?? ""}`;
};

describe("auth API", () => {
  let data: Data;
  beforeEach(async () => {
    data = await makeData();
  });

  it("signs up, sets an httpOnly cookie, and /api/me returns the user", async () => {
    const signup = await call(data, { method: "POST", path: "/api/signup", body: { username: "Jordan", password: "secret1" } });
    expect(signup.status).toBe(200);
    expect(signup.json.user).toMatchObject({ username: "Jordan", displayName: "Jordan" });
    expect(signup.json.user.id).toBeTruthy();
    expect(String(signup.headers["set-cookie"])).toContain("HttpOnly");

    const cookie = cookieFrom(signup.headers);
    const me = await call(data, { path: "/api/me", cookie });
    expect(me.status).toBe(200);
    expect(me.json.user.username).toBe("Jordan");
    // sliding renewal re-sets the cookie
    expect(me.headers["set-cookie"]).toBeTruthy();
  });

  it("returns user:null (200) when logged out — never blocks the boot check", async () => {
    const me = await call(data, { path: "/api/me" });
    expect(me.status).toBe(200);
    expect(me.json.user).toBeNull();
  });

  it("rejects duplicate usernames and invalid input", async () => {
    await call(data, { method: "POST", path: "/api/signup", body: { username: "Sam", password: "secret1" } });
    const dup = await call(data, { method: "POST", path: "/api/signup", body: { username: "sam", password: "secret1" } });
    expect(dup.status).toBe(409);

    const bad = await call(data, { method: "POST", path: "/api/signup", body: { username: "x", password: "secret1" } });
    expect(bad.status).toBe(400);
    const weak = await call(data, { method: "POST", path: "/api/signup", body: { username: "okname", password: "123" } });
    expect(weak.status).toBe(400);
  });

  it("logs in with the right password and rejects the wrong one with a generic message", async () => {
    await call(data, { method: "POST", path: "/api/signup", body: { username: "Ann", password: "correct1" } });
    const good = await call(data, { method: "POST", path: "/api/login", body: { username: "ann", password: "correct1" } });
    expect(good.status).toBe(200);
    expect(good.json.user.username).toBe("Ann");

    const bad = await call(data, { method: "POST", path: "/api/login", body: { username: "ann", password: "nope" } });
    expect(bad.status).toBe(401);
    expect(bad.json.error).toBe("Wrong username or password");
    const ghost = await call(data, { method: "POST", path: "/api/login", body: { username: "nobody", password: "x" } });
    expect(ghost.json.error).toBe("Wrong username or password");
  });

  it("records a solo result and reflects it in /api/me stats", async () => {
    const signup = await call(data, { method: "POST", path: "/api/signup", body: { username: "Bee", password: "secret1" } });
    const cookie = cookieFrom(signup.headers);
    const post = await call(data, {
      method: "POST",
      path: "/api/solo/result",
      cookie,
      body: {
        gameId: "g1",
        difficulty: "medium",
        attempts: [
          { mode: "locate", countryId: "FRA", correctAnswer: "France", givenAnswer: "France", isCorrect: true },
          { mode: "flag", countryId: "ESP", correctAnswer: "Spain", givenAnswer: "Italy", isCorrect: false },
          { mode: "bogus", countryId: "X", isCorrect: true }, // invalid mode is dropped
        ],
      },
    });
    expect(post.status).toBe(200);
    expect(post.json.recorded).toBe(2);
    expect(post.json.stats.solo.games).toBe(1);

    const me = await call(data, { path: "/api/me", cookie });
    expect(me.json.stats.solo.bestScore).toBe(1);
    expect(me.json.stats.perMode.find((m: { mode: string }) => m.mode === "locate").accuracy).toBe(1);
    // XP for the round: correct medium (2+10)·1.5 = 18, wrong medium (2)·1.5 = 3.
    expect(me.json.stats.xp).toBe(21);
  });

  it("requires a session to post solo results", async () => {
    const res = await call(data, { method: "POST", path: "/api/solo/result", body: { attempts: [] } });
    expect(res.status).toBe(401);
  });

  it("changes the display name (keeping username) and reflects it in /api/me", async () => {
    const signup = await call(data, { method: "POST", path: "/api/signup", body: { username: "Zoe", password: "secret1" } });
    const cookie = cookieFrom(signup.headers);

    const rename = await call(data, { method: "POST", path: "/api/account/name", cookie, body: { displayName: "Zo the Great" } });
    expect(rename.status).toBe(200);
    expect(rename.json.user).toMatchObject({ username: "Zoe", displayName: "Zo the Great" });
    expect(rename.json.user.id).toBe(signup.json.user.id); // stats id unchanged

    const me = await call(data, { path: "/api/me", cookie });
    expect(me.json.user.displayName).toBe("Zo the Great");
    expect(me.json.user.username).toBe("Zoe");
  });

  it("rejects a rename when logged out or invalid", async () => {
    const out = await call(data, { method: "POST", path: "/api/account/name", body: { displayName: "Nope" } });
    expect(out.status).toBe(401);

    const signup = await call(data, { method: "POST", path: "/api/signup", body: { username: "Yan", password: "secret1" } });
    const cookie = cookieFrom(signup.headers);
    const blank = await call(data, { method: "POST", path: "/api/account/name", cookie, body: { displayName: "  " } });
    expect(blank.status).toBe(400);
    const tooLong = await call(data, { method: "POST", path: "/api/account/name", cookie, body: { displayName: "x".repeat(25) } });
    expect(tooLong.status).toBe(400);
    const angle = await call(data, { method: "POST", path: "/api/account/name", cookie, body: { displayName: "<script>" } });
    expect(angle.status).toBe(400);
  });

  it("serves the leaderboard ranked by XP", async () => {
    const cee = await call(data, { method: "POST", path: "/api/signup", body: { username: "Cee", password: "secret1" } });
    await call(data, { method: "POST", path: "/api/signup", body: { username: "Dot", password: "secret1" } });
    // Cee earns XP from a solo round; Dot has none.
    await call(data, {
      method: "POST",
      path: "/api/solo/result",
      cookie: cookieFrom(cee.headers),
      body: { gameId: "g1", difficulty: "hard", attempts: [{ mode: "locate", countryId: "FRA", isCorrect: true }] },
    });
    const board = await call(data, { path: "/api/leaderboard" });
    expect(board.status).toBe(200);
    const entry = (name: string) =>
      board.json.leaderboard.find((e: { username: string }) => e.username === name);
    expect(entry("Cee").xp).toBe(24); // correct hard answer: (2 + 10)·2
    expect(entry("Dot").xp).toBe(0);
    // Ranked by XP — Cee is ahead of Dot.
    const names = board.json.leaderboard.map((e: { username: string }) => e.username);
    expect(names.indexOf("Cee")).toBeLessThan(names.indexOf("Dot"));
  });

  it("returns the user's committed insight, gated by session", async () => {
    const signup = await call(data, { method: "POST", path: "/api/signup", body: { username: "Dee", password: "secret1" } });
    const cookie = cookieFrom(signup.headers);
    const userId = signup.json.user.id;

    const dir = mkdtempSync(join(tmpdir(), "gr-insights-"));
    const insightsPath = join(dir, "insights.json");
    writeFileSync(insightsPath, JSON.stringify({ [userId]: { message: "You love flags.", generated_at: "2026-06-21" } }));

    const got = await call(data, { path: "/api/insights", cookie, insightsPath });
    expect(got.status).toBe(200);
    expect(got.json.insight.message).toBe("You love flags.");

    // logged out → 401
    const out = await call(data, { path: "/api/insights", insightsPath });
    expect(out.status).toBe(401);

    // missing file → null insight (not an error)
    const none = await call(data, { path: "/api/insights", cookie, insightsPath: join(dir, "missing.json") });
    expect(none.json.insight).toBeNull();
  });

  it("returns globe settings, updates them, and reflects in /api/me", async () => {
    const signup = await call(data, { method: "POST", path: "/api/signup", body: { username: "Settings", password: "secret1" } });
    const cookie = cookieFrom(signup.headers);
    expect(signup.json.settings).toEqual({ globeMode: "guided", showPoles: true });

    const got = await call(data, { path: "/api/settings", cookie });
    expect(got.json.settings).toEqual({ globeMode: "guided", showPoles: true });

    const upd = await call(data, { method: "POST", path: "/api/settings", cookie, body: { globeMode: "free", showPoles: false } });
    expect(upd.status).toBe(200);
    expect(upd.json.settings).toEqual({ globeMode: "free", showPoles: false });

    const me = await call(data, { path: "/api/me", cookie });
    expect(me.json.settings).toEqual({ globeMode: "free", showPoles: false });

    // invalid values are ignored (current kept); logged out is rejected.
    const bad = await call(data, { method: "POST", path: "/api/settings", cookie, body: { globeMode: "upside-down" } });
    expect(bad.json.settings).toEqual({ globeMode: "free", showPoles: false });
    const out = await call(data, { method: "POST", path: "/api/settings", body: { globeMode: "guided" } });
    expect(out.status).toBe(401);
  });
});
