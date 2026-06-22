import { levelForXp } from "../game/leveling";

/**
 * Compact level pill — shown top-left when logged in. Mirrors the account chip's
 * look; tapping it opens the profile (where the full XP breakdown lives).
 */
export default function LevelBadge({ xp, onClick }: { xp: number; onClick?: () => void }) {
  const { level, progress, xpToNext } = levelForXp(xp);
  return (
    <button
      onClick={onClick}
      title={`Level ${level} — ${xpToNext} XP to level ${level + 1}`}
      aria-label={`Level ${level}`}
      className="flex items-center gap-2 rounded-full border border-white/12 bg-slate-900/70 px-3 py-1.5 shadow-lg shadow-black/30 backdrop-blur transition hover:-translate-y-px hover:border-white/20 hover:bg-white/10 active:translate-y-0"
    >
      <span className="text-sm" aria-hidden>⭐</span>
      <span className="flex flex-col items-start">
        <span className="text-sm font-bold leading-none text-slate-100">Lv {level}</span>
        <span className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-white/12" aria-hidden>
          <span
            className="block h-full rounded-full bg-linear-to-r from-sky-300 to-indigo-300 transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      </span>
    </button>
  );
}
