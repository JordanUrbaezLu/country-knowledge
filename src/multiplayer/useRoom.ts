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

/** Unambiguous 4-char room codes (no 0/O/1/I) — easy to read aloud to family. */
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

  function handle(msg: ServerMsg) {
    switch (msg.t) {
      case "state":
        // a successful frame means we're connected — clear any stale banner
        set({ room: msg.room, connecting: false, error: null });
        break;
      case "question":
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
      case "gameover":
        set((s) => ({
          room: s.room ? { ...s.room, status: "gameover" } : s.room,
          finalLeaderboard: msg.leaderboard,
          question: null,
          reveal: null,
          connecting: false,
          error: null,
        }));
        break;
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
      });
    },
  };
});
