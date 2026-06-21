export type AppMode = "explore" | "solo" | "multiplayer";

const LABELS: Record<AppMode, string> = {
  explore: "Explore",
  solo: "Solo",
  multiplayer: "Online",
};

export default function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: AppMode;
  onChange: (m: AppMode) => void;
}) {
  return (
    <div className="pointer-events-auto inline-flex rounded-full border border-slate-700/60 bg-slate-900/80 p-1 backdrop-blur">
      {(["explore", "solo", "multiplayer"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            mode === m ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:text-white"
          }`}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  );
}
