import { useEffect, useRef, useState } from "react";
import { flagUrl } from "../data/countries";
import type { Country } from "../data/types";
import { matchAccuracy } from "../game/matching";
import { MODE_LABELS } from "../game/questions";
import { isTouchDevice } from "../lib/device";
import { useKeyboardInset } from "../lib/useKeyboardInset";
import { resolveGuessCountryId } from "./resolveGuess";
import { TimerRing, useCountdown } from "./Timer";
import { useRoom } from "./useRoom";

export default function RoundHud({
  countries,
  target,
}: {
  countries: Country[];
  target: Country | null;
}) {
  const question = useRoom((s) => s.question);
  const room = useRoom((s) => s.room);
  const myId = useRoom((s) => s.myId);
  const answered = useRoom((s) => s.answeredThisRound);
  const submitAnswer = useRoom((s) => s.submitAnswer);
  const skip = useRoom((s) => s.skip);

  const { secondsLeft, fraction } = useCountdown(question);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardInset = useKeyboardInset();

  const mode = question?.mode;
  const isTyped = mode === "locate" || mode === "flag";

  useEffect(() => {
    setValue("");
    if (question && isTyped && !answered) inputRef.current?.focus();
  }, [question, isTyped, answered]);

  if (!question || !room) return null;

  const flag = mode === "flag" && target ? flagUrl(target) : null;
  const connected = room.players.filter((p) => p.connected);
  const answeredCount = connected.filter((p) => p.answered).length;
  const isHost = room.hostId === myId;

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (answered || !value.trim() || !target) return;
    const accuracy = matchAccuracy(value, target);
    const pickedId = resolveGuessCountryId(value, countries);
    submitAnswer(accuracy, value.trim(), pickedId);
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-3 pb-safe pt-2 transition-transform duration-200 sm:gap-3 sm:p-5"
      style={keyboardInset ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
    >
      {/* Status bar: round, timer, answered tally */}
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-slate-700/60 bg-slate-900/85 px-3 py-1.5 text-sm text-slate-200 backdrop-blur">
        <span>
          Round <strong className="text-slate-100">{question.round + 1}</strong>/
          {question.totalRounds}
        </span>
        <TimerRing fraction={fraction} secondsLeft={secondsLeft} />
        <span className="text-slate-300">
          <strong className="text-emerald-400">{answeredCount}</strong>/{connected.length} in
        </span>
        {isHost && (
          <button
            onClick={() => skip({ expect: "question", round: question.round })}
            title="Skip to the answer"
            className="rounded-full border border-slate-600 px-2.5 py-0.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Skip →
          </button>
        )}
      </div>

      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/92 p-3 shadow-2xl backdrop-blur sm:p-4">
        <p className="text-center text-xs uppercase tracking-wide text-slate-400">
          {mode ? MODE_LABELS[mode] : ""}
        </p>

        {flag && (
          <img
            src={flag}
            alt="Flag to identify"
            className="mx-auto my-2 h-16 rounded-md border border-slate-600 object-contain sm:my-3 sm:h-24"
          />
        )}

        {mode === "name" && target && (
          <p className="my-1.5 text-center text-xl font-bold text-amber-300 sm:my-2 sm:text-2xl">
            {target.name}
          </p>
        )}

        {answered ? (
          <p className="mt-2 text-center text-sm font-semibold text-emerald-400">
            ✓ Locked in — waiting for {connected.length - answeredCount} more…
          </p>
        ) : isTyped ? (
          <form onSubmit={submitTyped} className="mt-2 flex gap-2">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Type the country name…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-400"
            >
              Go
            </button>
          </form>
        ) : (
          <p className="mt-1 text-center text-sm text-slate-400">
            {isTouchDevice
              ? "Aim the crosshair at the country, then tap Select."
              : "Click the country on the globe."}
          </p>
        )}
      </div>
    </div>
  );
}
