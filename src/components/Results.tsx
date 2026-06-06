import { MODE_LABELS } from "../game/questions";
import { useGame } from "../game/store";

export default function Results({ onReplay }: { onReplay: () => void }) {
  const { score, questions, records, best } = useGame();
  const total = questions.length;

  return (
    <div className="absolute inset-0 flex items-end justify-center p-4 pb-safe sm:items-center sm:p-5">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/95 p-5 shadow-2xl sm:p-6">
        <h2 className="text-center text-xl font-bold sm:text-2xl">Round complete</h2>
        <p className="mt-1 text-center text-4xl font-black text-emerald-400">
          {score}
          <span className="text-2xl font-bold text-slate-400">/{total}</span>
        </p>
        <p className="text-center text-sm text-slate-400">Best: {best}</p>

        <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto pr-1 text-sm sm:mt-4 sm:max-h-64">
          {records.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-md bg-slate-800/60 px-3 py-1.5"
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
          className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-3 font-semibold text-slate-950 hover:bg-sky-400 active:bg-slate-100"
        >
          Play again
        </button>
      </div>
    </div>
  );
}
