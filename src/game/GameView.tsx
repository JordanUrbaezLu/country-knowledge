import { useEffect, useMemo, useRef, useState } from "react";
import DifficultyPicker from "../components/DifficultyPicker";
import QuizHud from "../components/QuizHud";
import Results from "../components/Results";
import GlobeView from "../globe/GlobeView";
import type { Country } from "../data/types";
import { isTouchDevice } from "../lib/device";
import { recordSoloRound } from "../auth/recordSolo";
import { useAuth } from "../auth/useAuth";
import type { Difficulty } from "./questions";
import { useGame } from "./store";

export default function GameView({ countries }: { countries: Country[] }) {
  const { status, questions, index, best, difficulty } = useGame();
  const start = useGame((s) => s.start);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const answerClick = useGame((s) => s.answerClick);
  const settings = useAuth((s) => s.settings);

  // Snapshot lifetime XP when a round begins so the end-of-round report can
  // animate from it to the new total (the round's gain is computed locally).
  const [xpBefore, setXpBefore] = useState(0);
  const beginRound = () => {
    setXpBefore(useAuth.getState().stats?.xp ?? 0);
    start(countries, difficulty);
  };

  // When a round finishes, log each question to the player's account (no-op for
  // guests). Guarded so it fires exactly once per completed round.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (status !== "done") {
      submittedRef.current = false;
      return;
    }
    if (submittedRef.current) return;
    submittedRef.current = true;
    const { records, difficulty: diff } = useGame.getState();
    void recordSoloRound({
      gameId: crypto.randomUUID(),
      difficulty: diff,
      attempts: records.map((r) => ({
        mode: r.question.mode,
        countryId: r.question.country.id,
        promptLabel: r.question.country.name,
        givenAnswer: r.given,
        correctAnswer: r.question.country.name,
        isCorrect: r.correct,
      })),
    });
  }, [status]);

  const q = questions[index];
  const target = q?.country ?? null;
  const reveal = status === "feedback";

  // Easy-mode flag hint: light up + fly to the country so you can see WHERE it is
  // while naming it from its flag. (Locate already highlights; Name would give the
  // answer away, so it gets the continent text hint instead.)
  const easyFlagHint =
    difficulty === "easy" && q?.mode === "flag" && status === "playing";

  const highlightId = q && (q.mode === "locate" || reveal || easyFlagHint) ? target!.id : null;

  const focus = useMemo(() => {
    if (!q || !target || target.lat == null || target.lng == null) return null;
    if ((q.mode === "locate" && status === "playing") || reveal || easyFlagHint) {
      return { lat: target.lat, lng: target.lng };
    }
    return null;
  }, [q, target, status, reveal, easyFlagHint]);

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
        poles={settings.showPoles}
        rotationMode={settings.globeMode}
        onCountryClick={onCountryClick}
      />

      {status === "idle" && (
        <StartCard
          best={best}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          onStart={beginRound}
        />
      )}
      {(status === "playing" || status === "feedback") && <QuizHud />}
      {status === "done" && <Results onReplay={beginRound} fromXp={xpBefore} />}
    </>
  );
}

function StartCard({
  best,
  difficulty,
  onDifficulty,
  onStart,
}: {
  best: number;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  onStart: () => void;
}) {
  return (
    <div className="anim-fade-in absolute inset-0 flex items-end justify-center p-4 pb-safe sm:items-center sm:p-5">
      <div className="glass-card anim-slide-up w-full max-w-md rounded-3xl p-5 text-center sm:p-6">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">10-Question Challenge</h2>
        <p className="mt-2 text-sm text-slate-300">A mix of three challenges:</p>
        <ul className="mx-auto mt-3 max-w-xs space-y-1.5 text-left text-sm text-slate-300">
          <li className="flex items-center gap-2.5 rounded-lg px-1">
            <span aria-hidden>🟠</span> A country lights up — type its name
          </li>
          <li className="flex items-center gap-2.5 rounded-lg px-1">
            <span aria-hidden>🏳️</span> Identify a country from its flag
          </li>
          <li className="flex items-center gap-2.5 rounded-lg px-1">
            <span aria-hidden>🌍</span> Find a named country {isTouchDevice ? "with the crosshair" : "and click it"}
          </li>
        </ul>
        <div className="mt-4">
          <DifficultyPicker value={difficulty} onChange={onDifficulty} />
        </div>
        {best > 0 && <p className="mt-3 text-sm text-slate-500">Best so far: {best}/10</p>}
        <button
          onClick={onStart}
          className="btn btn-primary mt-4 w-full rounded-xl px-4 py-3"
        >
          Start round
        </button>
      </div>
    </div>
  );
}
