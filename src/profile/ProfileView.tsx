import { useEffect, useState } from "react";
import { useAuth, type AuthUser, type GlobeMode } from "../auth/useAuth";
import SegmentedToggle, { type SegOption } from "../components/SegmentedToggle";
import { levelForXp } from "../game/leveling";

const GLOBE_MODES: SegOption<GlobeMode>[] = [
  { value: "guided", label: "Guided" },
  { value: "free", label: "Free" },
];

/** Short, friendly labels for the three quiz modes (full ones are sentences). */
const MODE_SHORT: Record<string, string> = {
  locate: "Name it",
  flag: "Flags",
  name: "Find it",
};
const MODE_ORDER = ["locate", "flag", "name"];

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-soft rounded-xl px-3 py-2.5 text-center">
      <div className="text-xl font-bold tabular-nums text-slate-50">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

/** A labelled on/off switch (used for the globe settings). */
function SettingSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-linear-to-b from-sky-400 to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
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
  // Leaderboard is cached in the auth store (prefetched at load, refreshed after
  // games) so opening this popup is instant and doesn't re-hit the API each time.
  const board = useAuth((s) => s.leaderboard) ?? [];
  const loadLeaderboard = useAuth((s) => s.loadLeaderboard);
  const refreshStats = useAuth((s) => s.refreshStats);
  const renameAccount = useAuth((s) => s.renameAccount);
  const settings = useAuth((s) => s.settings);
  const updateSettings = useAuth((s) => s.updateSettings);
  const busy = useAuth((s) => s.busy);
  const authError = useAuth((s) => s.error);
  const clearError = useAuth((s) => s.clearError);
  const [insight, setInsight] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.displayName);

  useEffect(() => {
    // Reuses the cache while it's fresh (< 10 min); only fetches if stale.
    void loadLeaderboard();
    // Pull fresh stats so the level/XP here is current (e.g. after an MP game,
    // whose write may not have landed when the badge last refreshed).
    void refreshStats();
    let alive = true;
    fetch("/api/insights", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.insight?.message) setInsight(j.insight.message as string);
      })
      .catch(() => {});
    return () => {
      alive = false;
      // Don't leave a rename error in the shared store after the popup closes
      // (covers both the ✕ button and backdrop-click dismiss).
      clearError();
    };
  }, [loadLeaderboard, refreshStats, clearError]);

  const solo = stats?.solo ?? { games: 0, bestScore: 0, avgAccuracy: 0 };
  const mp = stats?.mp ?? { games: 0, wins: 0, winRate: 0 };
  const perMode = stats?.perMode ?? [];
  const played = solo.games > 0 || mp.games > 0;
  const lvl = levelForXp(stats?.xp ?? 0);

  const startEdit = () => {
    clearError();
    setNameDraft(user.displayName);
    setEditing(true);
  };
  const cancelEdit = () => {
    clearError();
    setEditing(false);
  };
  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === user.displayName) {
      cancelEdit();
      return;
    }
    if (await renameAccount(next)) setEditing(false);
  };
  const saveDisabled = busy || !nameDraft.trim() || nameDraft.trim() === user.displayName;

  return (
    <div
      className="scrim anim-fade-in absolute inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        // Tap the dimmed backdrop (not the card) to dismiss.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-card anim-scale-in relative max-h-[88svh] w-full max-w-md overflow-y-auto rounded-3xl p-6">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
        >
          ✕
        </button>

        {editing ? (
          <div className="mt-1">
            <label className="block text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              Display name
            </label>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={24}
              autoFocus
              autoComplete="off"
              aria-label="Display name"
              className="field mt-1 px-3 py-2.5 text-center text-lg font-semibold"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saveDisabled) void saveName();
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <p className="mt-1 text-center text-xs text-slate-500">
              You'll still log in as @{user.username}.
            </p>
            {authError && <p className="mt-1 text-center text-sm text-amber-400">{authError}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={cancelEdit} className="btn btn-ghost flex-1 rounded-xl px-4 py-2.5 text-sm">
                Cancel
              </button>
              <button
                onClick={() => void saveName()}
                disabled={saveDisabled}
                className="btn btn-primary flex-1 rounded-xl px-4 py-2.5 text-sm"
              >
                {busy ? "Saving…" : "Save name"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-1.5">
              <h2 className="text-2xl font-bold tracking-tight">👤 {user.displayName}</h2>
              <button
                onClick={startEdit}
                aria-label="Edit name"
                title="Change your display name"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
              >
                ✏️
              </button>
            </div>
            <p className="mt-0.5 text-center text-xs text-slate-500">@{user.username}</p>
          </>
        )}

        {/* Level — XP earned across every solo & online game */}
        <div className="glass-soft mt-4 rounded-xl px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-amber-300">⭐ Level {lvl.level}</span>
            <span className="text-xs tabular-nums text-slate-400">{lvl.xp.toLocaleString()} XP</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-linear-to-r from-sky-300 to-indigo-300 shadow-[0_0_8px_rgba(125,180,255,0.5)] transition-[width] duration-700 ease-out"
              style={{ width: `${Math.round(lvl.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[11px] text-slate-500">
            {lvl.xpToNext.toLocaleString()} XP to level {lvl.level + 1}
          </p>
        </div>

        {insight && (
          <p className="anim-fade-up mt-3 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3.5 py-2.5 text-sm leading-relaxed text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            ✨ {insight}
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
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-300 shadow-[0_0_8px_rgba(52,211,153,0.5)] transition-[width] duration-700 ease-out"
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
          Online multiplayer
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
            <ol className="stagger mt-2 space-y-1">
              {board.map((e, i) => (
                <li
                  key={e.userId}
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ${
                    e.userId === user.id
                      ? "bg-sky-500/15 ring-1 ring-sky-400/40"
                      : "glass-soft"
                  }`}
                >
                  <span className={`w-5 text-center font-bold ${i === 0 ? "text-amber-300" : "text-slate-400"}`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate font-medium text-slate-100">{e.displayName}</span>
                  <span className="flex shrink-0 flex-col items-end leading-tight">
                    <span className="font-semibold text-slate-200">Lv {levelForXp(e.xp).level}</span>
                    <span className="text-[11px] tabular-nums text-slate-500">
                      {e.xp.toLocaleString()} XP
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {/* Globe controls (synced to the account) */}
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Globe</h3>
        <div className="glass-soft mt-2 space-y-3.5 rounded-xl p-3.5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-200">Rotation</span>
              <span className="truncate text-xs text-slate-500">
                {settings.globeMode === "free" ? "Swing onto the poles" : "Stays upright"}
              </span>
            </div>
            <SegmentedToggle
              options={GLOBE_MODES}
              value={settings.globeMode}
              onChange={(v) => void updateSettings({ globeMode: v })}
              shape="segment"
              size="sm"
            />
          </div>
          <SettingSwitch
            label="Show N / S poles"
            hint="Compass badges marking the poles"
            checked={settings.showPoles}
            onChange={(v) => void updateSettings({ showPoles: v })}
          />
        </div>

        <button
          onClick={onLogout}
          className="btn btn-ghost mt-6 w-full rounded-xl px-4 py-3"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
