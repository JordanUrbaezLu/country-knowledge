/**
 * PartyKit transport adapter. One PartyKit room == one game lobby, keyed by the
 * room code in the URL. All rules live in the pure `RoomGame` engine; this class
 * just wires PartyKit's connection/broadcast/clock to the engine's `RoomIO`.
 */
import type * as Party from "partykit/server";
import { RoomGame, type RoomIO } from "../src/multiplayer/roomGame";
import { encode, type ClientMsg } from "../src/multiplayer/protocol";

export default class GameRoom implements Party.Server {
  private game: RoomGame;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {
    const io: RoomIO = {
      now: () => Date.now(),
      send: (connId, msg) => this.room.getConnection(connId)?.send(encode(msg)),
      broadcast: (msg) => this.room.broadcast(encode(msg)),
      scheduleTimer: (ms, fn) => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(fn, ms);
      },
      clearTimer: () => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
      },
    };
    this.game = new RoomGame(this.room.id, io);
  }

  onConnect(conn: Party.Connection) {
    this.game.onConnect(conn.id);
  }

  onClose(conn: Party.Connection) {
    this.game.onClose(conn.id);
  }

  onMessage(raw: string, sender: Party.Connection) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    switch (msg.t) {
      case "join":
        return this.game.join(sender.id, msg.name);
      case "rename":
        return this.game.rename(sender.id, msg.name);
      case "start":
      case "playAgain":
        return this.game.start(sender.id, msg.difficulty, msg.sequence);
      case "answer":
        return this.game.answer(sender.id, msg.correct, msg.pickedLabel, msg.pickedCountryId);
      case "skip":
        return this.game.skip(sender.id, msg.expect, msg.round);
    }
  }
}
