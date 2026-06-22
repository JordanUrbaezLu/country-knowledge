import { WebSocket as ReconnectingWebSocket } from "partysocket";
import { create } from "zustand";
import type { Country } from "../data/types";
import { MODE_DURATION_MS, generateRound, type Difficulty } from "../game/questions";
import {
  TOTAL_ROUNDS,
  encode,
  type ClientMsg,
  type PlayerInfo,
  type QuestionMode,
  type RoomSnapshot,
  type RoundResult,
  type SeqItem,
  type ServerMsg,
} from "./protocol";
import { useAuth } from "../auth/useAuth";

/**
 * Where the realtime server lives. In production the same Node server serves the
 * SPA, so the WebSocket is same-origin (no config). For dev (Vite on a different
 * port) or a separately-hosted server, set VITE_WS_HOST (e.g. 127.0.0.1:1999 or
 * your-app.onrender.com).
 */
const WS_HOST: string | undefined = import.meta.env.VITE_WS_HOST as string | undefined;

function wsUrl(code: string, id: string): string {
  const q = `room=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`;
  if (WS_HOST) {
    const insecure = /^(localhost|127\.|0\.0\.0\.0|\[?::1|192\.168\.|10\.)/.test(WS_HOST);
    return `${insecure ? "ws" : "wss"}://${WS_HOST}/ws?${q}`;
  }
  const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss" : "ws";
  const host = typeof location !== "undefined" ? location.host : "127.0.0.1:1999";
  return `${proto}://${host}/ws?${q}`;
}

const ID_KEY = "ck.mp.id";
const NAME_KEY = "ck.mp.name";

/**
 * Stable identity that survives a FULL tab/browser close (localStorage, not
 * sessionStorage) — this is what lets a phone that locked + evicted the tab
 * rejoin the same game and keep its score/color.
 */
function getClientId(): string {
  if (typeof localStorage === "undefined") return Math.random().toString(36).slice(2);
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function loadSavedName(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}

/** Unambiguous 4-char room codes (no 0/O/1/I) — easy to read aloud to a friend. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

export function shareUrlFor(code: string): string {
  if (typeof location === "undefined") return `?room=${code}`;
  return `${location.origin}${location.pathname}?room=${code}`;
}

export interface ActiveQuestion {
  round: number;
  totalRounds: number;
  mode: QuestionMode;
  countryId: string;
  durationMs: number;
  /** server-synced ms left at receipt */
  remainingMs: number;
  /** Date.now() at receipt, to drive the local countdown */
  receivedAt: number;
}

export interface RevealData {
  round: number;
  totalRounds: number;
  countryId: string;
  results: RoundResult[];
  leaderboard: PlayerInfo[];
  nextInMs: number;
}

interface RoomState {
  code: string | null;
  myId: string;
  name: string;
  connecting: boolean;
  error: string | null;
  room: RoomSnapshot | null;
  question: ActiveQuestion | null;
  reveal: RevealData | null;
  finalLeaderboard: PlayerInfo[] | null;
  answeredThisRound: boolean;
  lobbyDifficulty: Difficulty;
  /** XP this player earned in the last completed game (for the post-game report),
   *  accumulated client-side from reveals with the shared formula. */
  gameXp: number;
  /** lifetime XP snapshot at the last game's start (the report animates from it). */
  xpBeforeGame: number;

  setName: (name: string) => void;
  setLobbyDifficulty: (d: Difficulty) => void;
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  startGame: (countries: Country[]) => void;
  playAgain: (countries: Country[]) => void;
  submitAnswer: (accuracy: number, pickedLabel: string, pickedCountryId: string | null) => void;
  skip: (opts?: { expect?: "question" | "reveal"; round?: number }) => void;
  leave: () => void;
}

// The socket lives outside the store (non-reactive, single instance).
let socket: ReconnectingWebSocket | null = null;

const mpDelay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildSequence(countries: Country[], difficulty: Difficulty): SeqItem[] {
  return generateRound(countries, TOTAL_ROUNDS, difficulty).map((q) => ({
    countryId: q.country.id,
    mode: q.mode,
    durationMs: MODE_DURATION_MS[q.mode],
  }));
}

export const useRoom = create<RoomState>((set, get) => {
  function send(msg: ClientMsg) {
    socket?.send(encode(msg));
  }

  function teardown() {
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  // The report's gained XP is the SERVER's delta (the attempts log is the source
  // of truth — robust to reconnects / mid-game joins / missed reveals). The MP
  // write is fire-and-forget, so poll the refreshed total a few times until it
  // reflects this game, then expose the delta for GameOver to animate.
  async function reconcileGameXp(before: number) {
    const a = useAuth.getState();
    if (!a.user || a.stats == null) return; // need an account + a known baseline
    for (let i = 0; i < 6; i++) {
      await useAuth.getState().refreshStats();
      const now = useAuth.getState().stats?.xp ?? before;
      if (now > before) {
        set({ gameXp: now - before });
        return;
      }
      if (i < 5) await mpDelay(400);
    }
  }

  function handle(msg: ServerMsg) {
    switch (msg.t) {
      case "state":
        // a successful frame means we're connected — clear any stale banner
        set({ room: msg.room, connecting: false, error: null });
        break;
      case "question":
        // A new game starting clears any previous game's XP report.
        if (msg.round === 0) set({ gameXp: 0, xpBeforeGame: 0 });
        set((s) => ({
          room: s.room ? { ...s.room, status: "question" } : s.room,
          question: {
            round: msg.round,
            totalRounds: msg.totalRounds,
            mode: msg.mode,
            countryId: msg.countryId,
            durationMs: msg.durationMs,
            remainingMs: msg.remainingMs,
            receivedAt: Date.now(),
          },
          reveal: null,
          finalLeaderboard: null,
          answeredThisRound: false,
          connecting: false,
          error: null,
        }));
        break;
      case "reveal":
        set((s) => ({
          room: s.room ? { ...s.room, status: "reveal" } : s.room,
          reveal: {
            round: msg.round,
            totalRounds: msg.totalRounds,
            countryId: msg.countryId,
            results: msg.results,
            leaderboard: msg.leaderboard,
            nextInMs: msg.nextInMs,
          },
          connecting: false,
          error: null,
        }));
        break;
      case "gameover": {
        // `stats.xp` here is still the PRE-game total (this game's write is
        // fire-and-forget and hasn't been pulled yet) — capture it as the report's
        // "from", then reconcile to the authoritative new total. Deriving the gain
        // from the server (not the client's reveal stream) keeps it correct through
        // reconnects / mid-game joins / missed reveals.
        const before = useAuth.getState().stats?.xp ?? 0;
        set((s) => ({
          room: s.room ? { ...s.room, status: "gameover" } : s.room,
          finalLeaderboard: msg.leaderboard,
          question: null,
          reveal: null,
          connecting: false,
          error: null,
          xpBeforeGame: before,
          gameXp: 0,
        }));
        // Wins + XP changed for logged-in players; the board's next open refetches.
        useAuth.getState().invalidateLeaderboard();
        void reconcileGameXp(before);
        break;
      }
      case "error":
        set({ error: msg.message });
        break;
    }
  }

  function connect(code: string, name: string) {
    teardown();
    const myId = get().myId;
    set({
      code,
      name,
      connecting: true,
      error: null,
      room: null,
      question: null,
      reveal: null,
      finalLeaderboard: null,
      answeredThisRound: false,
    });

    socket = new ReconnectingWebSocket(wsUrl(code, myId));
    socket.addEventListener("open", () => {
      // (re-)register on first connect and on every auto-reconnect
      send({ t: "join", name: get().name });
    });
    socket.addEventListener("message", (e: MessageEvent) => {
      try {
        handle(JSON.parse(e.data as string) as ServerMsg);
      } catch {
        /* ignore malformed frames */
      }
    });
    socket.addEventListener("error", () => {
      // non-blocking; cleared on the next successful frame
      if (!get().room) set({ error: "Connecting…" });
      else set({ error: "Connection lost — reconnecting…" });
    });
  }

  return {
    code: null,
    myId: getClientId(),
    name: loadSavedName(),
    connecting: false,
    error: null,
    room: null,
    question: null,
    reveal: null,
    finalLeaderboard: null,
    answeredThisRound: false,
    lobbyDifficulty: "medium",
    gameXp: 0,
    xpBeforeGame: 0,

    setName: (name) => {
      set({ name });
      if (typeof localStorage !== "undefined") localStorage.setItem(NAME_KEY, name);
      if (socket && get().code) send({ t: "rename", name });
    },

    setLobbyDifficulty: (d) => set({ lobbyDifficulty: d }),

    createRoom: (name) => {
      const trimmed = name.trim() || "Player";
      get().setName(trimmed);
      connect(makeCode(), trimmed);
    },

    joinRoom: (code, name) => {
      const trimmed = name.trim() || "Player";
      get().setName(trimmed);
      connect(code.trim().toUpperCase(), trimmed);
    },

    startGame: (countries) =>
      send({
        t: "start",
        difficulty: get().lobbyDifficulty,
        sequence: buildSequence(countries, get().lobbyDifficulty),
      }),

    playAgain: (countries) =>
      send({
        t: "playAgain",
        difficulty: get().lobbyDifficulty,
        sequence: buildSequence(countries, get().lobbyDifficulty),
      }),

    submitAnswer: (accuracy, pickedLabel, pickedCountryId) => {
      if (get().answeredThisRound) return;
      set({ answeredThisRound: true });
      send({ t: "answer", accuracy, pickedLabel, pickedCountryId });
    },

    skip: (opts) => send({ t: "skip", expect: opts?.expect, round: opts?.round }),

    leave: () => {
      teardown();
      set({
        code: null,
        connecting: false,
        error: null,
        room: null,
        question: null,
        reveal: null,
        finalLeaderboard: null,
        answeredThisRound: false,
        gameXp: 0,
        xpBeforeGame: 0,
      });
    },
  };
});
