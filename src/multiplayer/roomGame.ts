/**
 * Pure, transport-agnostic multiplayer game engine. Holds ALL room state and
 * rules (players, scoring, round progression, host hand-off, rejoin) with zero
 * dependency on the network/transport — every side effect goes through the
 * injected `RoomIO`, and the clock + timer are injected too. That makes the
 * whole state machine deterministically unit-testable (see roomGame.test.ts),
 * and keeps `server/index.ts` a thin adapter.
 *
 * It is deliberately dataset-free: the host's browser generates the question
 * `sequence` (countryId + mode + duration) and ships it in `start`, so the
 * server never needs the country data.
 */
import {
  COLOR_SLOTS,
  REVEAL_MS,
  scorePoints,
  type Difficulty,
  type PlayerInfo,
  type RoomSnapshot,
  type RoomStatus,
  type RoundResult,
  type SeqItem,
  type ServerMsg,
} from "./protocol";

export interface RoomIO {
  now(): number;
  /** send to a single connection */
  send(connId: string, msg: ServerMsg): void;
  /** send to every connection */
  broadcast(msg: ServerMsg): void;
  /** schedule the room's single active timer (replaces any pending one) */
  scheduleTimer(ms: number, fn: () => void): void;
  clearTimer(): void;
}

interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  colorIndex: number;
  // reset every round:
  answered: boolean;
  accuracy: number; // 1 exact, 0.5 near-miss, 0 wrong
  points: number;
  pickedLabel: string;
  pickedCountryId: string | null;
  elapsedMs: number | null;
}

const MAX_NAME = 24;
const MAX_SEQUENCE = 50;

export class RoomGame {
  players = new Map<string, Player>();
  /** The room creator. Host privileges always belong to them while connected. */
  ownerId: string | null = null;
  status: RoomStatus = "lobby";
  difficulty: Difficulty | null = null;
  sequence: SeqItem[] = [];
  round = 0;
  private questionStart = 0;

  constructor(
    readonly code: string,
    private readonly io: RoomIO,
  ) {}

  /**
   * Who currently holds host controls. Computed LIVE (not stored) so a temporary
   * blip in the creator's connection can't permanently hand the room to someone
   * else: the owner reclaims host the instant they reconnect. Falls back to the
   * first connected player only while the owner is away, so the game can still
   * be driven.
   */
  get hostId(): string | null {
    if (this.ownerId && this.players.get(this.ownerId)?.connected) return this.ownerId;
    for (const p of this.players.values()) if (p.connected) return p.id;
    return null;
  }

  // ---- connection lifecycle ----

  /** Stop any pending round timer (called when the host GCs an empty room). */
  dispose() {
    this.io.clearTimer();
  }

  /** A socket connected but hasn't joined with a name yet — just catch it up. */
  onConnect(connId: string) {
    this.io.send(connId, { t: "state", room: this.snapshot() });
  }

  onClose(connId: string) {
    const p = this.players.get(connId);
    if (!p) return;
    p.connected = false;

    // host is derived live (see `hostId`), so nothing to reassign here — if the
    // owner just left, controls fall to a connected player until they're back.
    this.broadcastState();
    // Don't stall a round on someone who just left mid-question.
    this.maybeEndQuestionEarly();
  }

  // ---- messages ----

  join(connId: string, rawName: string) {
    const name = cleanName(rawName) || "Player";
    const existing = this.players.get(connId);
    if (existing) {
      existing.name = name;
      existing.connected = true;
    } else {
      this.players.set(connId, {
        id: connId,
        name,
        score: 0,
        connected: true,
        colorIndex: this.nextColor(),
        answered: false,
        accuracy: 0,
        points: 0,
        pickedLabel: "",
        pickedCountryId: null,
        elapsedMs: null,
      });
    }
    if (!this.ownerId) this.ownerId = connId;

    this.broadcastState();
    this.catchUp(connId);
  }

  rename(connId: string, rawName: string) {
    const p = this.players.get(connId);
    if (!p) return;
    p.name = cleanName(rawName) || p.name;
    this.broadcastState();
  }

  start(connId: string, difficulty: Difficulty, sequence: SeqItem[]) {
    if (connId !== this.hostId) {
      return this.io.send(connId, { t: "error", message: "Only the host can start the game." });
    }
    if (this.status === "question" || this.status === "reveal") return;
    const seq = sanitizeSequence(sequence);
    if (seq.length === 0) {
      return this.io.send(connId, { t: "error", message: "No questions to play." });
    }

    this.difficulty = difficulty;
    this.sequence = seq;
    for (const p of this.players.values()) {
      p.score = 0;
      this.resetRoundFields(p);
    }
    this.startQuestion(0);
  }

  answer(connId: string, accuracy: number, pickedLabel: string, pickedCountryId: string | null) {
    if (this.status !== "question") return;
    const p = this.players.get(connId);
    if (!p || p.answered) return;

    const item = this.sequence[this.round];
    const elapsed = this.io.now() - this.questionStart;
    p.answered = true;
    p.accuracy = Number.isFinite(accuracy) ? Math.min(1, Math.max(0, accuracy)) : 0;
    p.elapsedMs = elapsed;
    p.pickedLabel = String(pickedLabel ?? "").slice(0, 60);
    p.pickedCountryId =
      typeof pickedCountryId === "string" && pickedCountryId ? pickedCountryId : null;
    p.points = scorePoints(p.accuracy, elapsed, item ? item.durationMs : 0);
    p.score += p.points;

    this.broadcastState(); // refresh everyone's "answered" tally
    this.maybeEndQuestionEarly();
  }

  skip(connId: string, expect?: "question" | "reveal", round?: number) {
    if (connId !== this.hostId) return;
    // ignore a stale click whose intended phase/round no longer matches — keeps
    // the host's "Next" from accidentally skipping the round that just started
    if (expect && expect !== this.status) return;
    if (round != null && round !== this.round) return;
    if (this.status === "question") this.endQuestion();
    else if (this.status === "reveal") this.advance();
  }

  // ---- round engine ----

  private startQuestion(round: number) {
    this.io.clearTimer();
    this.round = round;
    this.status = "question";
    for (const p of this.players.values()) this.resetRoundFields(p);
    this.questionStart = this.io.now();

    const item = this.sequence[round];
    if (!item) return this.gameOver();

    this.broadcast(this.questionMessage());
    this.broadcastState();
    this.io.scheduleTimer(item.durationMs, () => this.endQuestion());
  }

  private maybeEndQuestionEarly() {
    if (this.status !== "question") return;
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length > 0 && active.every((p) => p.answered)) this.endQuestion();
  }

  private endQuestion() {
    if (this.status !== "question") return;
    this.io.clearTimer();
    this.status = "reveal";
    this.broadcast(this.revealMessage());
    this.io.scheduleTimer(REVEAL_MS, () => this.advance());
  }

  private advance() {
    this.io.clearTimer();
    const next = this.round + 1;
    if (next >= this.sequence.length) return this.gameOver();
    this.startQuestion(next);
  }

  private gameOver() {
    this.io.clearTimer();
    this.status = "gameover";
    this.broadcast({ t: "gameover", leaderboard: this.leaderboard() });
  }

  // ---- helpers ----

  /** Send a just-(re)joined connection whatever is happening right now. */
  private catchUp(connId: string) {
    if (this.status === "question") {
      if (this.sequence[this.round]) this.io.send(connId, this.questionMessage());
    } else if (this.status === "reveal") {
      this.io.send(connId, this.revealMessage());
    } else if (this.status === "gameover") {
      this.io.send(connId, { t: "gameover", leaderboard: this.leaderboard() });
    }
  }

  private questionMessage(): ServerMsg {
    const item = this.sequence[this.round];
    const remainingMs = item
      ? Math.max(0, this.questionStart + item.durationMs - this.io.now())
      : 0;
    return {
      t: "question",
      round: this.round,
      totalRounds: this.sequence.length,
      mode: item ? item.mode : "locate",
      countryId: item ? item.countryId : "",
      durationMs: item ? item.durationMs : 0,
      remainingMs,
    };
  }

  /**
   * Lowest color slot not held by a *connected* player — so a newcomer is
   * always visually distinct from everyone currently present, while a departed
   * (ghost) player's slot is free to reuse. Rejoiners keep their own slot (the
   * existing-player branch never calls this).
   */
  private nextColor(): number {
    const taken = new Set(
      [...this.players.values()].filter((p) => p.connected).map((p) => p.colorIndex),
    );
    for (let i = 0; i < COLOR_SLOTS; i++) if (!taken.has(i)) return i;
    return taken.size % COLOR_SLOTS;
  }

  private resetRoundFields(p: Player) {
    p.answered = false;
    p.accuracy = 0;
    p.points = 0;
    p.pickedLabel = "";
    p.pickedCountryId = null;
    p.elapsedMs = null;
  }

  private revealMessage(): ServerMsg {
    const item = this.sequence[this.round];
    const results: RoundResult[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      accuracy: p.accuracy,
      points: p.points,
      pickedLabel: p.pickedLabel,
      pickedCountryId: p.pickedCountryId,
      elapsedMs: p.elapsedMs,
      score: p.score,
    }));
    return {
      t: "reveal",
      round: this.round,
      totalRounds: this.sequence.length,
      countryId: item ? item.countryId : "",
      results,
      leaderboard: this.leaderboard(),
      nextInMs: REVEAL_MS,
    };
  }

  private leaderboard(): PlayerInfo[] {
    // stable, score-descending; ties keep insertion (join) order
    return this.playerInfos().sort((a, b) => b.score - a.score);
  }

  private playerInfos(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      colorIndex: p.colorIndex,
      answered: p.answered,
    }));
  }

  private snapshot(): RoomSnapshot {
    return {
      code: this.code,
      status: this.status,
      difficulty: this.difficulty,
      round: this.round,
      totalRounds: this.sequence.length,
      players: this.playerInfos(),
      hostId: this.hostId,
    };
  }

  private broadcast(msg: ServerMsg) {
    this.io.broadcast(msg);
  }

  private broadcastState() {
    this.broadcast({ t: "state", room: this.snapshot() });
  }
}

export function cleanName(name: unknown): string {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

export function sanitizeSequence(seq: unknown): SeqItem[] {
  if (!Array.isArray(seq)) return [];
  const out: SeqItem[] = [];
  for (const raw of seq.slice(0, MAX_SEQUENCE)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<SeqItem>;
    if (typeof item.countryId !== "string" || !item.countryId) continue;
    if (item.mode !== "locate" && item.mode !== "flag" && item.mode !== "name") continue;
    const durationMs =
      typeof item.durationMs === "number" && item.durationMs > 0
        ? Math.min(item.durationMs, 120000)
        : 20000;
    out.push({ countryId: item.countryId, mode: item.mode, durationMs });
  }
  return out;
}
