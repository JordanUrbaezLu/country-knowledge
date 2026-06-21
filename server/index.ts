/**
 * Standalone multiplayer server: one Node process that serves the built SPA
 * (so the whole app is one URL / one deploy) AND hosts the realtime game over
 * WebSockets. The game rules live entirely in the transport-agnostic `RoomGame`
 * engine (src/multiplayer/roomGame.ts) — this file is just the WS/HTTP wiring,
 * the sibling of party/server.ts but for a normal host (Render/Railway/Fly, or
 * `npm start` + a tunnel).
 *
 * Run: `tsx server/index.ts` (PORT env, default 1999). Serves ./dist if present.
 */
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import sirv from "sirv";
import { RoomGame, type RoomIO } from "../src/multiplayer/roomGame";
import { encode, type ClientMsg } from "../src/multiplayer/protocol";

const PORT = Number(process.env.PORT) || 1999;
const MAX_ROOMS = 5000;
const EMPTY_ROOM_GRACE_MS = 60_000;

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
  conns: Map<string, WebSocket>;
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
  const conns = new Map<string, WebSocket>();
  const timer = { id: null as ReturnType<typeof setTimeout> | null };
  const io: RoomIO = {
    now: () => Date.now(),
    send: (id, msg) => {
      const ws = conns.get(id);
      if (ws && ws.readyState === ws.OPEN) ws.send(encode(msg));
    },
    broadcast: (msg) => {
      const s = encode(msg);
      for (const ws of conns.values()) if (ws.readyState === ws.OPEN) ws.send(s);
    },
    scheduleTimer: (ms, fn) => {
      if (timer.id) clearTimeout(timer.id);
      timer.id = setTimeout(fn, ms);
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
    if (r && r.conns.size === 0) rooms.delete(code);
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

const wss = new WebSocketServer({ server: http });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const code = (url.searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
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
  // Reconnect / same-id: drop any stale socket so "last connection wins".
  const prev = room.conns.get(id);
  if (prev && prev !== ws) prev.terminate();
  room.conns.set(id, ws);
  room.game.onConnect(id);

  ws.on("message", (data) => dispatch(room.game, id, data.toString()));
  ws.on("close", () => {
    // Only react if THIS socket is still the live one for the id (guards the
    // race where a reconnect already replaced it).
    if (room.conns.get(id) === ws) {
      room.conns.delete(id);
      room.game.onClose(id);
      scheduleGc(code);
    }
  });
  ws.on("error", () => {
    /* close handler does the cleanup */
  });
});

function lanAddress(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

http.listen(PORT, () => {
  const lan = lanAddress();
  console.log("");
  console.log("  🌍  Country Knowledge — game server running");
  console.log("  ────────────────────────────────────────────");
  console.log(`  On this computer:    http://localhost:${PORT}`);
  if (lan) console.log(`  Same Wi-Fi (family): http://${lan}:${PORT}`);
  console.log(`  Family anywhere:     use "npm run share" for a public link`);
  console.log("  ────────────────────────────────────────────");
  console.log("  Open the link, pick Family, create a room, share its invite. Ctrl-C to stop.");
  console.log("");
});
