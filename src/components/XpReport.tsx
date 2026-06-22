import { useEffect, useState } from "react";
import { levelForXp } from "../game/leveling";

const DURATION_MS = 1100;

/**
 * Post-game XP report: counts up from the player's pre-game XP to the new total,
 * filling the level bar (and popping a level-up when it crosses a boundary).
 *
 * Purely cosmetic and self-contained — it renders inline on the results / game
 * over screens and never blocks: the animation auto-plays, every surrounding
 * control stays live, and the rAF is cancelled on unmount so starting the next
 * game tears it down cleanly. Callers supply `fromXp`/`gainedXp`: solo computes
 * the gain locally (binary accuracy → identical to the server), while MP derives
 * it from the server's reconciled total (robust to reconnects / missed reveals).
 */
export default function XpReport({ fromXp, gainedXp }: { fromXp: number; gainedXp: number }) {
  const from = Math.max(0, Math.round(fromXp));
  const gained = Math.max(0, Math.round(gainedXp));
  const toXp = from + gained;
  const [displayXp, setDisplayXp] = useState(from);

  useEffect(() => {
    const reduce =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || gained <= 0) {
      setDisplayXp(toXp);
      return;
    }
    setDisplayXp(from);
    let raf = 0;
    let startedAt = 0;
    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      const t = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplayXp(from + (toXp - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, toXp, gained]);

  const info = levelForXp(displayXp);
  const startLevel = levelForXp(from).level;
  const finalLevel = levelForXp(toXp).level;
  // Reveal the level-up banner only once the count-up has actually crossed it.
  const leveledUp = finalLevel > startLevel && info.level > startLevel;

  return (
    <div className="glass-soft anim-fade-up mt-4 rounded-xl px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-amber-300">⭐ Level {info.level}</span>
        <span className="text-sm font-bold text-emerald-300">+{gained} XP</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-linear-to-r from-sky-300 to-indigo-300 shadow-[0_0_10px_rgba(125,180,255,0.6)]"
          style={{ width: `${Math.max(2, Math.round(info.progress * 100))}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-500">
        <span>{Math.round(displayXp).toLocaleString()} XP</span>
        <span>{info.xpToNext.toLocaleString()} to Lv {info.level + 1}</span>
      </div>
      {leveledUp && (
        <p className="anim-pop mt-2 text-center text-sm font-bold text-amber-300">
          🎉 Level up! You reached Level {finalLevel}
        </p>
      )}
    </div>
  );
}
