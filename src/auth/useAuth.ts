import { create } from "zustand";

/**
 * Account/session client store. The session itself is a server-set httpOnly
 * cookie (see server/auth.ts), so there is NO token to manage here — every
 * request just uses `credentials: "include"` and the browser attaches it.
 *
 * Auth is purely additive: when accounts are unavailable (e.g. no DB configured
 * → /api/me returns 503) or the user simply isn't logged in, the app keeps
 * working exactly as it does for guests. `bootstrap()` is non-blocking.
 */

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface ModeStat {
  mode: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface AuthStats {
  solo: { games: number; bestScore: number; avgAccuracy: number };
  perMode: ModeStat[];
  mp: { games: number; wins: number; winRate: number };
}

interface AuthState {
  user: AuthUser | null;
  stats: AuthStats | null;
  /** false once we learn the server has accounts turned off (503). */
  available: boolean;
  status: "loading" | "ready";
  /** in-flight signup/login, for button spinners */
  busy: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  signup: (username: string, password: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setStats: (stats: AuthStats) => void;
  clearError: () => void;
}

interface JsonResult {
  ok: boolean;
  status: number;
  json: { user?: AuthUser | null; stats?: AuthStats; error?: string };
}

async function postJson(path: string, body: unknown): Promise<JsonResult> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** The guest identity the multiplayer flow already persists; passed at signup so
 *  the account can be linked to any prior guest activity later. */
function guestId(): string | null {
  try {
    return localStorage.getItem("ck.mp.id");
  } catch {
    return null;
  }
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  stats: null,
  available: true,
  status: "loading",
  busy: false,
  error: null,

  bootstrap: async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (res.status === 503) {
        set({ available: false, status: "ready" });
        return;
      }
      if (res.ok) {
        const { user, stats } = await res.json();
        set({ user: user ?? null, stats: stats ?? null, status: "ready" });
        return;
      }
      set({ status: "ready" });
    } catch {
      // Network/offline: treat as guest, never block the app.
      set({ status: "ready" });
    }
  },

  signup: async (username, password) => {
    set({ busy: true, error: null });
    try {
      const { ok, json } = await postJson("/api/signup", {
        username: username.trim(),
        password,
        guestId: guestId(),
      });
      if (ok && json.user) {
        set({ user: json.user, stats: json.stats ?? null, busy: false });
        return true;
      }
      set({ error: json.error || "Could not create account", busy: false });
      return false;
    } catch {
      set({ error: "Network error — try again", busy: false });
      return false;
    }
  },

  login: async (username, password) => {
    set({ busy: true, error: null });
    try {
      const { ok, json } = await postJson("/api/login", { username: username.trim(), password });
      if (ok && json.user) {
        set({ user: json.user, stats: json.stats ?? null, busy: false });
        return true;
      }
      set({ error: json.error || "Could not log in", busy: false });
      return false;
    } catch {
      set({ error: "Network error — try again", busy: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore — we clear local state regardless */
    }
    set({ user: null, stats: null });
  },

  setStats: (stats) => set({ stats }),
  clearError: () => set({ error: null }),
}));
