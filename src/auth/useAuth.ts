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

export type GlobeMode = "guided" | "free";
/** Per-account globe preferences (synced server-side; defaults for guests). */
export interface UserSettings {
  globeMode: GlobeMode;
  showPoles: boolean;
}
export const SETTINGS_DEFAULTS: UserSettings = { globeMode: "guided", showPoles: true };

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
  /** Total lifetime XP (derive level/progress via `src/game/leveling`). */
  xp: number;
}

export interface LbEntry {
  userId: string;
  username: string;
  displayName: string;
  wins: number;
  mpGames: number;
  bestSolo: number;
  /** Total XP — the board is ranked by this. */
  xp: number;
}

/** How long a fetched leaderboard is treated as fresh before we refetch. */
const LB_STALE_MS = 10 * 60 * 1000;

interface AuthState {
  user: AuthUser | null;
  stats: AuthStats | null;
  /** Globe preferences. Always present (defaults for guests / logged-out). */
  settings: UserSettings;
  /** false once we learn the server has accounts turned off (503). */
  available: boolean;
  status: "loading" | "ready";
  /** in-flight signup/login, for button spinners */
  busy: boolean;
  error: string | null;

  /** Cached global leaderboard (shared by every popup open). */
  leaderboard: LbEntry[] | null;
  /** ms timestamp of the last successful leaderboard fetch (0 = never/stale). */
  leaderboardAt: number;
  /** guards against overlapping leaderboard fetches. */
  leaderboardLoading: boolean;
  /** bumped by invalidate; a fetch that started under an older value discards
   *  its (now pre-write) result so an invalidation can't be lost to a race. */
  leaderboardEpoch: number;

  bootstrap: () => Promise<void>;
  signup: (username: string, password: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** Change the display name (login `username` + stats id stay put). */
  renameAccount: (displayName: string) => Promise<boolean>;
  /** Update globe preferences (optimistic; persists to the account when logged in). */
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  setStats: (stats: AuthStats) => void;
  /** Re-pull the logged-in user's stats (incl. XP) from /api/me — used after a
   *  multiplayer game and when opening the profile, so the level stays current. */
  refreshStats: () => Promise<void>;
  clearError: () => void;
  /** Fetch the leaderboard, reusing the cache while it's within the stale
   *  window. `force` refetches regardless (e.g. right after a known write). */
  loadLeaderboard: (force?: boolean) => Promise<void>;
  /** Mark the cache stale so the next `loadLeaderboard` refetches. Cheap & sync
   *  — no request fires now, which keeps it safe to call the instant a game ends
   *  (the real fetch happens on the next popup open, after writes have settled). */
  invalidateLeaderboard: () => void;
}

interface JsonResult {
  ok: boolean;
  status: number;
  json: { user?: AuthUser | null; stats?: AuthStats; settings?: UserSettings; error?: string };
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

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  stats: null,
  settings: SETTINGS_DEFAULTS,
  available: true,
  status: "loading",
  busy: false,
  error: null,
  leaderboard: null,
  leaderboardAt: 0,
  leaderboardLoading: false,
  leaderboardEpoch: 0,

  bootstrap: async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (res.status === 503) {
        set({ available: false, status: "ready" });
        return;
      }
      if (res.ok) {
        const { user, stats, settings } = await res.json();
        set({
          user: user ?? null,
          stats: stats ?? null,
          settings: settings ?? SETTINGS_DEFAULTS,
          status: "ready",
        });
        // Warm the leaderboard at boot so an already-logged-in player's popup
        // opens instantly instead of waiting on a request.
        if (user) void get().loadLeaderboard();
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
        set({
          user: json.user,
          stats: json.stats ?? null,
          settings: json.settings ?? SETTINGS_DEFAULTS,
          busy: false,
        });
        void get().loadLeaderboard();
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
        set({
          user: json.user,
          stats: json.stats ?? null,
          settings: json.settings ?? SETTINGS_DEFAULTS,
          busy: false,
        });
        void get().loadLeaderboard();
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
    // Also drop any transient error/busy so it can't surface on the next auth
    // screen (the error field is shared by login/signup/rename). Settings revert
    // to defaults — the account's saved prefs reload on next login.
    set({ user: null, stats: null, settings: SETTINGS_DEFAULTS, error: null, busy: false });
  },

  renameAccount: async (displayName) => {
    set({ busy: true, error: null });
    try {
      const { ok, json } = await postJson("/api/account/name", { displayName: displayName.trim() });
      if (ok && json.user) {
        const u = json.user;
        // Patch the open leaderboard's own row immediately so the change shows
        // without waiting; invalidate so the next open pulls the canonical board.
        set((s) => ({
          user: u,
          busy: false,
          leaderboard:
            s.leaderboard?.map((e) => (e.userId === u.id ? { ...e, displayName: u.displayName } : e)) ??
            s.leaderboard,
        }));
        get().invalidateLeaderboard();
        return true;
      }
      set({ error: json.error || "Could not change name", busy: false });
      return false;
    } catch {
      set({ error: "Network error — try again", busy: false });
      return false;
    }
  },

  updateSettings: async (partial) => {
    const prev = get().settings;
    // Optimistic: the globe reacts instantly; revert if the save fails.
    set({ settings: { ...prev, ...partial } });
    // Guests have no account to persist to — keep the change in-session only.
    if (!get().user) return;
    try {
      const { ok, json } = await postJson("/api/settings", partial);
      if (ok && json.settings) set({ settings: json.settings });
      else set({ settings: prev });
    } catch {
      set({ settings: prev });
    }
  },

  setStats: (stats) => set({ stats }),

  refreshStats: async () => {
    if (!get().user) return; // guests have no server stats
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      // Only touch user+stats; leave `settings` alone so we never clobber an
      // in-flight optimistic preference change.
      if (json.user) set({ user: json.user, stats: json.stats ?? null });
    } catch {
      /* keep existing stats on a transient failure */
    }
  },

  clearError: () => set({ error: null }),

  loadLeaderboard: async (force = false) => {
    const s = get();
    if (!s.available) return; // accounts off → no board to fetch
    if (s.leaderboardLoading) return; // a fetch is already in flight
    const fresh = s.leaderboard != null && Date.now() - s.leaderboardAt < LB_STALE_MS;
    if (!force && fresh) return; // cache hit — skip the request
    const epoch = s.leaderboardEpoch; // snapshot to detect a mid-flight invalidate
    set({ leaderboardLoading: true });
    try {
      const res = await fetch("/api/leaderboard?limit=10", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        // Drop the result if a game finished while this request was in flight —
        // its payload predates that write, and committing it would erase the
        // invalidation (and re-mark the cache fresh) until the stale window ends.
        if (Array.isArray(json?.leaderboard) && get().leaderboardEpoch === epoch) {
          set({ leaderboard: json.leaderboard as LbEntry[], leaderboardAt: Date.now() });
        }
      }
    } catch {
      // Keep any cached board on a transient failure rather than blanking it.
    } finally {
      set({ leaderboardLoading: false });
    }
  },

  invalidateLeaderboard: () =>
    set((s) => ({ leaderboardAt: 0, leaderboardEpoch: s.leaderboardEpoch + 1 })),
}));
