import { MODE_LABELS } from "../game/questions";
import { useGame } from "../game/store";
import { useAuth } from "../auth/useAuth";
import { xpForAttempt } from "../game/leveling";
import XpReport from "./XpReport";

export default function Results({ onReplay, fromXp }: { onReplay: () => void; fromXp: number }) {
  const { score, questions, records, best, difficulty } = useGame();
  const total = questions.length;
  const user = useAuth((s) => s.user);

  // XP earned this round — same formula the server uses to total lifetime XP
  // (solo accuracy is binary). Only logged-in players accrue it to an account.
  const roundXp = records.reduce(
    (sum, r) => sum + xpForAttempt({ accuracy: r.correct ? 1 : 0, isCorrect: r.correct, difficulty }),
    0,
  );

  return (
    <div className="anim-fade-in absolute inset-0 flex items-end justify-center p-4 pb-safe sm:items-center sm:p-5">
      <div className="glass-card anim-slide-up w-full max-w-md rounded-3xl p-5 sm:p-6">
        <h2 className="text-center text-xl font-bold tracking-tight sm:text-2xl">Round complete</h2>
        <p className="anim-pop mt-1 text-center text-5xl font-black text-emerald-400 drop-shadow-[0_2px_16px_rgba(52,211,153,0.3)]">
          {score}
          <span className="text-2xl font-bold text-slate-400">/{total}</span>
        </p>
        <p className="text-center text-sm text-slate-400">Best: {best}</p>
        {user ? (
          <XpReport fromXp={fromXp} gainedXp={roundXp} />
        ) : (
          <p className="mt-2 text-center text-xs text-slate-500">Log in to earn XP &amp; level up</p>
        )}

        <ul className="stagger mt-3 max-h-52 space-y-1 overflow-y-auto pr-1 text-sm sm:mt-4 sm:max-h-64">
          {records.map((r, i) => (
            <li
              key={i}
              className="glass-soft flex items-center justify-between rounded-xl px-3 py-1.5"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>{r.correct ? "✅" : "❌"}</span>
                <span className="font-medium text-slate-100">{r.question.country.name}</span>
              </span>
              <span className="text-xs text-slate-500">{MODE_LABELS[r.question.mode]}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onReplay}
          className="btn btn-primary mt-4 w-full rounded-xl px-4 py-3"
        >
          Play again
        </button>
      </div>
    </div>
  );
}
