import {
  DIFFICULTIES,
  DIFFICULTY_BLURB,
  DIFFICULTY_LABELS,
  type Difficulty,
} from "../game/questions";

/** Segmented Easy / Medium / Hard selector with a one-line blurb for the choice. */
export default function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  return (
    <div>
      <div className="inline-flex w-full rounded-lg border border-slate-700/60 bg-slate-800/60 p-1">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={value === d}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              value === d
                ? "bg-sky-500 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {DIFFICULTY_LABELS[d]}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-center text-xs text-slate-400">{DIFFICULTY_BLURB[value]}</p>
    </div>
  );
}
