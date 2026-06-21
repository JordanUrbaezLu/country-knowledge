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
import { WebSocketServer, type WebSocket } from "ws";
import sirv from "sirv";
import { RoomGame, type RoomIO } from "../src/multiplayer/roomGame";
import { encode, type ClientMsg } from "../src/multiplayer/protocol";

const PORT = Number(process.env.PORT) || 1999;
const MAX_ROOMS = 5000;
const EMPTY_ROOM_GRACE_MS = 60_000;
const MAX_MESSAGE_BYTES = 64 * 1024; // our frames are tiny; reject anything huge

// One bad message or timer must never take down every other live game.
process.on("uncaughtException", (e) => console.error("[mp] uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("[mp] unhandledRejection:", e));

// Serve the production SPA build (no-op 404 in dev where dist may be absent).
const assets = sirv("dist", { single: true, dev: false, gzip: true });

const http = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
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
  const room: Room = { game: new RoomGame(code, io), conns, gc: null };
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
      return game.answer(id, msg.correct, msg.pickedLabel, msg.pickedCountryId);
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

http.listen(PORT, () => {
  console.log(`[mp] Country Knowledge server ready on :${PORT} (serving ./dist + realtime /ws)`);
});
