/**
 * Standalone multiplayer server: one Node process that serves the built SPA
 * (so the whole app is one URL / one deploy) AND hosts the realtime game over
 * WebSockets. The game rules live entirely in the transport-agnostic `RoomGame`
 * engine (src/multiplayer/roomGame.ts) — this file is just the WS/HTTP wiring.
 * Deploy it to any always-on host (Render/Railway/Fly), or run it locally.
 *
 * Run: `tsx server/index.ts` (PORT env, default 1999). Serves ./dist if present.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import sirv from "sirv";
import { RoomGame, type RoomIO } from "../src/multiplayer/roomGame";
import { encode, type ClientMsg, type ServerMsg } from "../src/multiplayer/protocol";
import { handleApi } from "./api";
import { getData, type Data } from "./db";
import { readSession } from "./auth";
import { applyBroadcast, type RoomTrack } from "./mpStats";

// Load local dev secrets (DATABASE_URL, SESSION_SECRET) from env files if present.
// Node's loadEnvFile is FIRST-WINS (it never overwrites an already-set key) and
// reads only the path given, so load the higher-priority .env.local BEFORE .env.
// Real host/shell env still beats both files, so this is a no-op in production
// (Render/Fly/etc. inject env directly; neither file exists there).
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file absent — fine */
  }
}

const PORT = Number(process.env.PORT) || 1999;
const MAX_ROOMS = 5000;
const EMPTY_ROOM_GRACE_MS = 60_000;
const MAX_MESSAGE_BYTES = 64 * 1024; // our frames are tiny; reject anything huge

// One bad message or timer must never take down every other live game.
process.on("uncaughtException", (e) => console.error("[mp] uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("[mp] unhandledRejection:", e));

// Serve the production SPA build (no-op 404 in dev where dist may be absent).
const assets = sirv("dist", { single: true, dev: false, gzip: true });

// The accounts/stats data layer. Stays null (accounts disabled, guests still play)
// until a DATABASE_URL + SESSION_SECRET are configured and migrate() succeeds.
let data: Data | null = null;

const http = createServer(async (req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if ((req.url ?? "").startsWith("/api/")) {
    if (!data) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Accounts are not configured on this server" }));
      return;
    }
    try {
      if (await handleApi(req, res, { data })) return;
    } catch (e) {
      console.error("[api] unhandled:", e);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
      return;
    }
  }
  assets(req, res, () => {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });
});

interface Room {
  game: RoomGame;
  // a player id can have MORE THAN ONE live socket (e.g. two browser tabs); they
  // all share one player record and all receive broadcasts — no tab fighting.
  conns: Map<string, Set<WebSocket>>;
  gc: ReturnType<typeof setTimeout> | null;
  // per-room context for attributing results to accounts (logged-in players only)
  track: RoomTrack;
}

// Persist multiplayer results for logged-in players by observing the SAME
// broadcasts the engine already emits — so the dataset-free engine stays
// untouched. All writes are fire-and-forget and guarded: a DB hiccup must never
// affect a live game. No-op when accounts are disabled or all players are guests.
function persistFromBroadcast(track: RoomTrack, msg: ServerMsg): void {
  if (!data) return;
  try {
    const eff = applyBroadcast(track, msg, randomUUID);
    if (eff.attempts?.length) {
      data.recordAttempts(eff.attempts).catch((e) => console.error("[mp] attempt log:", e));
    }
    if (eff.mpResult && eff.mpResult.results.length) {
      data
        .recordMpResult(eff.mpResult.gameId, eff.mpResult.results)
        .catch((e) => console.error("[mp] mp result:", e));
    }
  } catch (e) {
    console.error("[mp] persistFromBroadcast:", e);
  }
}

const rooms = new Map<string, Room>();

function getRoom(code: string): Room {
  const existing = rooms.get(code);
  if (existing) {
    if (existing.gc) {
      clearTimeout(existing.gc);
      existing.gc = null;
    }
    return existing;
  }
  const conns = new Map<string, Set<WebSocket>>();
  const timer = { id: null as ReturnType<typeof setTimeout> | null };
  const track: RoomTrack = { userIds: new Map(), gameId: null, mode: null, difficulty: null };
  const sendTo = (ws: WebSocket, s: string) => {
    if (ws.readyState === ws.OPEN) ws.send(s);
  };
  const io: RoomIO = {
    now: () => Date.now(),
    send: (id, msg) => {
      const set = conns.get(id);
      if (!set) return;
      const s = encode(msg);
      for (const ws of set) sendTo(ws, s);
    },
    broadcast: (msg) => {
      const s = encode(msg);
      for (const set of conns.values()) for (const ws of set) sendTo(ws, s);
      persistFromBroadcast(track, msg);
    },
    scheduleTimer: (ms, fn) => {
      if (timer.id) clearTimeout(timer.id);
      timer.id = setTimeout(() => {
        try {
          fn();
        } catch (e) {
          console.error(`[mp] round timer error (room ${code}):`, e);
        }
      }, ms);
    },
    clearTimer: () => {
      if (timer.id) {
        clearTimeout(timer.id);
        timer.id = null;
      }
    },
  };
  const room: Room = { game: new RoomGame(code, io), conns, gc: null, track };
  rooms.set(code, room);
  return room;
}

function scheduleGc(code: string) {
  const room = rooms.get(code);
  if (!room || room.conns.size > 0) return;
  if (room.gc) clearTimeout(room.gc);
  room.gc = setTimeout(() => {
    const r = rooms.get(code);
    if (r && r.conns.size === 0) {
      r.game.dispose(); // stop any pending round timer so it can't fire on a dead room
      rooms.delete(code);
    }
  }, EMPTY_ROOM_GRACE_MS);
}

function dispatch(game: RoomGame, id: string, raw: string) {
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw) as ClientMsg;
  } catch {
    return;
  }
  switch (msg.t) {
    case "join":
      return game.join(id, msg.name);
    case "rename":
      return game.rename(id, msg.name);
    case "start":
    case "playAgain":
      return game.start(id, msg.difficulty, msg.sequence);
    case "answer":
      return game.answer(id, msg.accuracy, msg.pickedLabel, msg.pickedCountryId);
    case "skip":
      return game.skip(id, msg.expect, msg.round);
  }
}

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

wss.on("connection", (ws, req) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const code = (url.searchParams.get("room") || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    const id = (url.searchParams.get("id") || "").slice(0, 64);
    if (!code || !id) {
      ws.close();
      return;
    }
    if (!rooms.has(code) && rooms.size >= MAX_ROOMS) {
      ws.close();
      return;
    }

    const room = getRoom(code);
    // Attribute this connection to an account if it carries a valid session
    // cookie (same-origin WS upgrade → cookies are present). Guests stay unmapped.
    if (data) {
      try {
        const uid = readSession(req);
        if (uid) room.track.userIds.set(id, uid);
      } catch {
        /* no valid session — play as guest */
      }
    }
    let set = room.conns.get(id);
    if (!set) {
      set = new Set();
      room.conns.set(id, set);
    }
    set.add(ws);
    markAlive(ws);
    room.game.onConnect(id);

    ws.on("pong", () => markAlive(ws));
    ws.on("message", (data) => {
      try {
        dispatch(room.game, id, data.toString());
      } catch (e) {
        console.error(`[mp] message error (room ${code}):`, e);
      }
    });
    ws.on("close", () => {
      const s = room.conns.get(id);
      if (!s || !s.delete(ws)) return;
      // a player is only "gone" once ALL their sockets (tabs) have closed
      if (s.size === 0) {
        room.conns.delete(id);
        try {
          room.game.onClose(id);
        } catch (e) {
          console.error(`[mp] close error (room ${code}):`, e);
        }
        scheduleGc(code);
      }
    });
    ws.on("error", () => {
      /* the close handler does the cleanup */
    });
  } catch (e) {
    console.error("[mp] connection setup error:", e);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
});

// Heartbeat: drop sockets that stop responding (e.g. a phone that lost signal
// without a clean close), so the player list / answered tally stay accurate.
const alive = new WeakSet<WebSocket>();
const markAlive = (ws: WebSocket) => alive.add(ws);
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 30_000);
heartbeat.unref?.();

// Bring up the accounts DB if configured. Fire-and-forget so the server binds
// immediately; until migrate() resolves, /api returns 503 (guests are unaffected).
async function initData(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("[mp] DATABASE_URL not set — accounts/stats disabled (guests still play).");
    return;
  }
  if (!process.env.SESSION_SECRET) {
    console.error("[mp] SESSION_SECRET not set — accounts disabled. Set it to enable login.");
    return;
  }
  try {
    const d = await getData();
    await d.migrate();
    data = d;
    console.log("[mp] accounts DB ready");
  } catch (e) {
    console.error("[mp] accounts DB init failed — accounts disabled:", e);
  }
}

void initData();

http.listen(PORT, () => {
  console.log(`[mp] Globe Royale server ready on :${PORT} (serving ./dist + realtime /ws)`);
});
