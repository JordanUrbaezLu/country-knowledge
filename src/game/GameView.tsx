import { useMemo } from "react";
import QuizHud from "../components/QuizHud";
import Results from "../components/Results";
import GlobeView from "../globe/GlobeView";
import type { Country } from "../data/types";
import { isTouchDevice } from "../lib/device";
import { useGame } from "./store";

export default function GameView({ countries }: { countries: Country[] }) {
  const { status, questions, index, best } = useGame();
  const start = useGame((s) => s.start);
  const answerClick = useGame((s) => s.answerClick);

  const q = questions[index];
  const target = q?.country ?? null;
  const reveal = status === "feedback";

  const highlightId = q && (q.mode === "locate" || reveal) ? target!.id : null;

  const focus = useMemo(() => {
    if (!q || !target || target.lat == null || target.lng == null) return null;
    if ((q.mode === "locate" && status === "playing") || reveal) {
      return { lat: target.lat, lng: target.lng };
    }
    return null;
  }, [q, target, status, reveal]);

  const onCountryClick =
    status === "playing" && q?.mode === "name" ? answerClick : undefined;

  // On touch devices the name→find question is answered with the crosshair:
  // aim the reticle at a country and tap its "Select this country" button
  // (showLabels=false keeps country names hidden, same as desktop).
  const crosshair = isTouchDevice && status === "playing" && q?.mode === "name";

  return (
    <>
      <GlobeView
        countries={countries}
        showLabels={false}
        highlightId={highlightId}
        focus={focus}
        crosshair={crosshair}
        onCountryClick={onCountryClick}
      />

      {status === "idle" && <StartCard best={best} onStart={() => start(countries)} />}
      {(status === "playing" || status === "feedback") && <QuizHud />}
      {status === "done" && <Results onReplay={() => start(countries)} />}
    </>
  );
}

function StartCard({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <div className="absolute inset-0 flex items-end justify-center p-4 pb-safe sm:items-center sm:p-5">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/92 p-5 text-center shadow-2xl backdrop-blur sm:p-6">
        <h2 className="text-xl font-bold sm:text-2xl">10-Question Challenge</h2>
        <p className="mt-2 text-sm text-slate-300">A mix of three challenges:</p>
        <ul className="mx-auto mt-2 max-w-xs space-y-1 text-left text-sm text-slate-400">
          <li>🟠 A country lights up — type its name</li>
          <li>🏳️ Identify a country from its flag</li>
          <li>
            🌍 Find a named country {isTouchDevice ? "with the crosshair" : "and click it"}
          </li>
        </ul>
        {best > 0 && <p className="mt-3 text-sm text-slate-500">Best so far: {best}/10</p>}
        <button
          onClick={onStart}
          className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-3 font-semibold text-slate-950 hover:bg-sky-400 active:bg-sky-300"
        >
          Start round
        </button>
      </div>
    </div>
  );
}
