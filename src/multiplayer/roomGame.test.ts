import { describe, expect, it } from "vitest";
import { MIN_CORRECT_POINTS, REVEAL_MS, scorePoints, type SeqItem, type ServerMsg } from "./protocol";
import { RoomGame, cleanName, sanitizeSequence, type RoomIO } from "./roomGame";

/** Deterministic IO: manual clock + a single manually-fired timer. */
class FakeIO implements RoomIO {
  clock = 1000;
  broadcasts: ServerMsg[] = [];
  sends: { connId: string; msg: ServerMsg }[] = [];
  private timerFn: (() => void) | null = null;

  now() {
    return this.clock;
  }
  send(connId: string, msg: ServerMsg) {
    this.sends.push({ connId, msg });
  }
  broadcast(msg: ServerMsg) {
    this.broadcasts.push(msg);
  }
  scheduleTimer(_ms: number, fn: () => void) {
    this.timerFn = fn;
  }
  clearTimer() {
    this.timerFn = null;
  }

  /** simulate the round/reveal timer expiring */
  fireTimer() {
    const fn = this.timerFn;
    this.timerFn = null;
    fn?.();
  }
  advance(ms: number) {
    this.clock += ms;
  }
  latest<T extends ServerMsg["t"]>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    for (let i = this.broadcasts.length - 1; i >= 0; i--) {
      if (this.broadcasts[i].t === t) return this.broadcasts[i] as Extract<ServerMsg, { t: T }>;
    }
    return undefined;
  }
}

function seq(...ids: string[]): SeqItem[] {
  return ids.map((countryId) => ({ countryId, mode: "locate" as const, durationMs: 10000 }));
}

function setup() {
  const io = new FakeIO();
  const game = new RoomGame("ROOM", io);
  return { io, game };
}

describe("scorePoints (speed bonus)", () => {
  it("is max at t=0 and floors a last-second correct, 0 for wrong", () => {
    expect(scorePoints(true, 0, 10000)).toBe(1000);
    expect(scorePoints(true, 10000, 10000)).toBe(MIN_CORRECT_POINTS);
    expect(scorePoints(false, 0, 10000)).toBe(0);
    // halfway through = halfway between floor and max
    expect(scorePoints(true, 5000, 10000)).toBe(550);
  });
  it("clamps out-of-range elapsed", () => {
    expect(scorePoints(true, -100, 10000)).toBe(1000);
    expect(scorePoints(true, 99999, 10000)).toBe(MIN_CORRECT_POINTS);
  });
});

describe("RoomGame — lobby + colors", () => {
  it("assigns distinct color slots 0,1,2 and makes the first joiner host", () => {
    const { game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.join("c", "Cy");
    expect(game.hostId).toBe("a");
    const colors = [...game.players.values()].map((p) => p.colorIndex);
    expect(colors).toEqual([0, 1, 2]);
  });

  it("reuses a departed player's color slot for a newcomer (no ghost hogging)", () => {
    const { game } = setup();
    game.join("a", "Ann"); // 0
    game.join("b", "Bob"); // 1
    game.join("c", "Cy"); // 2
    game.onClose("b"); // frees slot 1
    game.join("d", "Dee");
    expect(game.players.get("d")!.colorIndex).toBe(1);
  });

  it("rejoin with the same id keeps score AND color", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.start("a", "medium", seq("FRA", "JPN"));
    io.advance(2000);
    game.answer("a", true, "France", "FRA"); // Ann scores
    const before = game.players.get("a")!;
    const score = before.score;
    const color = before.colorIndex;
    expect(score).toBeGreaterThan(0);
    game.onClose("a");
    expect(game.players.get("a")!.connected).toBe(false);
    game.join("a", "Ann"); // same id reconnects
    expect(game.players.get("a")!.score).toBe(score);
    expect(game.players.get("a")!.colorIndex).toBe(color);
    expect(game.players.get("a")!.connected).toBe(true);
  });
});

describe("RoomGame — host controls", () => {
  it("rejects start from a non-host", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.start("b", "easy", seq("FRA"));
    expect(io.sends.some((s) => s.connId === "b" && s.msg.t === "error")).toBe(true);
    expect(game.status).toBe("lobby");
  });

  it("hands off host when the host disconnects; the new host can start", () => {
    const { game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.onClose("a");
    expect(game.hostId).toBe("b");
    game.start("b", "easy", seq("FRA"));
    expect(game.status).toBe("question");
  });

  it("returns host to the creator after a connection blip — a late joiner can't steal it", () => {
    const { game } = setup();
    game.join("owner", "Ann"); // creator
    game.join("friend", "Bob");
    expect(game.hostId).toBe("owner");

    game.onClose("owner"); // owner's socket blips
    expect(game.hostId).toBe("friend"); // temp host so the game can still be driven

    game.join("late", "Cy"); // a newcomer does NOT become host
    expect(game.hostId).toBe("friend");

    game.join("owner", "Ann"); // owner reconnects → reclaims host
    expect(game.hostId).toBe("owner");
  });

  it("owner reclaims host even after being briefly the only (disconnected) player", () => {
    // exact reported bug: creator alone in lobby drops, a friend joins and grabs host
    const { game } = setup();
    game.join("owner", "Ann");
    game.onClose("owner");
    expect(game.hostId).toBeNull();
    game.join("friend", "Bob"); // friend is temp host while owner away
    expect(game.hostId).toBe("friend");
    game.join("owner", "Ann"); // owner returns → host comes back to them
    expect(game.hostId).toBe("owner");
  });

  it("ignores a stale skip whose phase/round no longer matches (no accidental skip)", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.start("a", "medium", seq("FRA", "JPN"));

    game.skip("a", "reveal", 0); // wrong phase → ignored
    expect(game.status).toBe("question");
    game.skip("a", "question", 9); // wrong round → ignored
    expect(game.status).toBe("question");

    game.skip("a", "question", 0); // valid → reveal
    expect(game.status).toBe("reveal");
    game.skip("a", "question", 0); // stale "skip question" during reveal → ignored
    expect(game.status).toBe("reveal");

    game.skip("a", "reveal", 0); // valid → next question
    expect(game.status).toBe("question");
    expect(io.latest("question")!.round).toBe(1);
  });
});

describe("RoomGame — round engine + scoring", () => {
  it("plays a full game: question -> reveal -> ... -> gameover", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.start("a", "medium", seq("FRA", "JPN"));

    expect(game.status).toBe("question");
    expect(io.latest("question")!.round).toBe(0);

    // both answer round 0 -> ends early into reveal
    io.advance(1000);
    game.answer("a", true, "France", "FRA");
    game.answer("b", false, "Spain", "ESP");
    expect(game.status).toBe("reveal");
    const reveal0 = io.latest("reveal")!;
    expect(reveal0.countryId).toBe("FRA");
    expect(reveal0.results.find((r) => r.id === "a")!.correct).toBe(true);
    expect(reveal0.results.find((r) => r.id === "a")!.pickedCountryId).toBe("FRA");
    expect(reveal0.results.find((r) => r.id === "b")!.pickedCountryId).toBe("ESP");

    // reveal timer advances to round 1
    io.fireTimer();
    expect(game.status).toBe("question");
    expect(io.latest("question")!.round).toBe(1);

    // round 1: only A answers, timer expires for B
    io.advance(500);
    game.answer("a", true, "Japan", "JPN");
    expect(game.status).toBe("question"); // B hasn't answered yet
    io.fireTimer(); // question timer fires
    expect(game.status).toBe("reveal");
    const reveal1 = io.latest("reveal")!;
    expect(reveal1.results.find((r) => r.id === "b")!.pickedCountryId).toBeNull(); // no answer

    // final reveal -> gameover
    io.fireTimer();
    expect(game.status).toBe("gameover");
    const go = io.latest("gameover")!;
    expect(go.leaderboard[0].id).toBe("a"); // Ann answered both correctly
    expect(go.leaderboard[0].score).toBeGreaterThan(go.leaderboard[1].score);
  });

  it("faster correct answers score higher (server clock)", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.start("a", "medium", seq("FRA"));
    io.advance(500);
    game.answer("a", true, "France", "FRA"); // fast
    io.advance(6000);
    game.answer("b", true, "France", "FRA"); // slow but correct
    const r = io.latest("reveal")!;
    const ann = r.results.find((x) => x.id === "a")!;
    const bob = r.results.find((x) => x.id === "b")!;
    expect(ann.points).toBeGreaterThan(bob.points);
    expect(bob.points).toBeGreaterThanOrEqual(MIN_CORRECT_POINTS);
  });

  it("a double answer or post-reveal frame can't double-score", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.start("a", "medium", seq("FRA"));
    io.advance(1000);
    game.answer("a", true, "France", "FRA");
    const score = game.players.get("a")!.score;
    game.answer("a", true, "France", "FRA"); // ignored (already answered)
    expect(game.players.get("a")!.score).toBe(score);
  });
});

describe("RoomGame — never stalls", () => {
  it("ends the round immediately when the last unanswered player disconnects", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.join("b", "Bob");
    game.start("a", "medium", seq("FRA", "JPN"));
    io.advance(1000);
    game.answer("a", true, "France", "FRA"); // A done, B still owes
    expect(game.status).toBe("question");
    game.onClose("b"); // the only one left owing leaves
    expect(game.status).toBe("reveal");
  });

  it("reveal nextInMs equals REVEAL_MS", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.start("a", "easy", seq("FRA"));
    io.advance(100);
    game.answer("a", true, "France", "FRA");
    expect(io.latest("reveal")!.nextInMs).toBe(REVEAL_MS);
  });
});

describe("RoomGame — late joiner catch-up + synced timer", () => {
  it("sends a mid-round joiner the current question with the REMAINING time, not a fresh clock", () => {
    const { io, game } = setup();
    game.join("a", "Ann");
    game.start("a", "medium", seq("FRA")); // durationMs 10000, questionStart=clock
    io.advance(7000); // 3s left
    game.join("late", "Late");
    const q = io.sends.filter((s) => s.connId === "late" && s.msg.t === "question").pop();
    expect(q).toBeDefined();
    const msg = q!.msg as Extract<ServerMsg, { t: "question" }>;
    expect(msg.remainingMs).toBe(3000);
    expect(msg.durationMs).toBe(10000);
  });
});

describe("input hardening", () => {
  it("cleanName trims, collapses whitespace, caps length", () => {
    expect(cleanName("  Bob   Smith ")).toBe("Bob Smith");
    expect(cleanName("x".repeat(50)).length).toBe(24);
    expect(cleanName(null)).toBe("");
  });
  it("sanitizeSequence drops junk, validates mode, clamps duration", () => {
    const out = sanitizeSequence([
      { countryId: "FRA", mode: "locate", durationMs: 5000 },
      { countryId: "", mode: "flag", durationMs: 1000 }, // no id
      { countryId: "JPN", mode: "bogus", durationMs: 1000 }, // bad mode
      { countryId: "USA", mode: "name", durationMs: 999999 }, // clamp
      "nope",
    ]);
    expect(out.map((s) => s.countryId)).toEqual(["FRA", "USA"]);
    expect(out[1].durationMs).toBe(120000);
  });
  it("sanitizeSequence handles non-arrays", () => {
    expect(sanitizeSequence(null)).toEqual([]);
    expect(sanitizeSequence("x")).toEqual([]);
  });
});
