export type AppMode = "explore" | "play";

export default function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: AppMode;
  onChange: (m: AppMode) => void;
}) {
  return (
    <div className="pointer-events-auto inline-flex rounded-full border border-slate-700/60 bg-slate-900/80 p-1 backdrop-blur">
      {(["explore", "play"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
            mode === m ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:text-white"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
