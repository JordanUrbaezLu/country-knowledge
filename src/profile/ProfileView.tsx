import { useEffect, useState } from "react";
import { useAuth, type AuthUser } from "../auth/useAuth";

/** Short, friendly labels for the three quiz modes (full ones are sentences). */
const MODE_SHORT: Record<string, string> = {
  locate: "Name it",
  flag: "Flags",
  name: "Find it",
};
const MODE_ORDER = ["locate", "flag", "name"];

const pct = (n: number) => `${Math.round(n * 100)}%`;

interface LbEntry {
  userId: string;
  username: string;
  displayName: string;
  wins: number;
  mpGames: number;
  bestSolo: number;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-800/60 px-3 py-2 text-center">
      <div className="text-xl font-bold tabular-nums text-slate-100">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

/**
 * Logged-in profile: the personalized insight (once generated), solo summary,
 * per-mode accuracy, and multiplayer record. Stats come from the auth store
 * (refreshed live after each solo round); the leaderboard lands in Phase 4.
 */
export default function ProfileView({
  user,
  onClose,
  onLogout,
}: {
  user: AuthUser;
  onClose: () => void;
  onLogout: () => void;
}) {
  const stats = useAuth((s) => s.stats);
  const [insight, setInsight] = useState<string | null>(null);
  const [board, setBoard] = useState<LbEntry[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/insights", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.insight?.message) setInsight(j.insight.message as string);
      })
      .catch(() => {});
    fetch("/api/leaderboard?limit=10", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && Array.isArray(j?.leaderboard)) setBoard(j.leaderboard as LbEntry[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const solo = stats?.solo ?? { games: 0, bestScore: 0, avgAccuracy: 0 };
  const mp = stats?.mp ?? { games: 0, wins: 0, winRate: 0 };
  const perMode = stats?.perMode ?? [];
  const played = solo.games > 0 || mp.games > 0;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <div className="relative max-h-[88svh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700/60 bg-slate-900/95 p-6 shadow-2xl backdrop-blur">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          ✕
        </button>

        <h2 className="text-center text-2xl font-bold">👤 {user.displayName}</h2>

        {insight && (
          <p className="mt-3 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
            {insight}
          </p>
        )}

        {!played && (
          <p className="mt-3 text-center text-sm text-slate-400">
            Play a round and your stats will show up here.
          </p>
        )}

        {/* Solo */}
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Solo</h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="Rounds" value={solo.games} />
          <Stat label="Best" value={`${solo.bestScore}/10`} />
          <Stat label="Accuracy" value={pct(solo.avgAccuracy)} />
        </div>

        {/* Per-mode accuracy */}
        {perMode.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {MODE_ORDER.map((mode) => {
              const m = perMode.find((x) => x.mode === mode);
              if (!m || m.attempts === 0) return null;
              return (
                <div key={mode} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-slate-300">{MODE_SHORT[mode] ?? mode}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: pct(m.accuracy) }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right tabular-nums text-slate-400">
                    {pct(m.accuracy)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Multiplayer */}
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Family multiplayer
        </h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="Games" value={mp.games} />
          <Stat label="Wins" value={mp.wins} />
          <Stat label="Win rate" value={pct(mp.winRate)} />
        </div>

        {/* Global leaderboard */}
        {board.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Global leaderboard
            </h3>
            <ol className="mt-2 space-y-1">
              {board.map((e, i) => (
                <li
                  key={e.userId}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                    e.userId === user.id
                      ? "bg-sky-500/15 ring-1 ring-sky-400/40"
                      : "bg-slate-800/50"
                  }`}
                >
                  <span className="w-5 text-center font-bold text-slate-400">{i + 1}</span>
                  <span className="flex-1 truncate font-medium text-slate-100">{e.displayName}</span>
                  <span className="tabular-nums text-slate-400">
                    {e.wins} {e.wins === 1 ? "win" : "wins"}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        <button
          onClick={onLogout}
          className="mt-6 w-full rounded-lg border border-slate-600 px-4 py-3 font-semibold text-slate-200 hover:bg-slate-800"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
