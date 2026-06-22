import { useEffect, useRef, useState } from "react";
import { flagUrl } from "../data/countries";
import { MODE_LABELS } from "../game/questions";
import { useGame } from "../game/store";
import { isTouchDevice } from "../lib/device";
import { useKeyboardInset } from "../lib/useKeyboardInset";

export default function QuizHud() {
  const { status, questions, index, score, best, lastCorrect, lastGiven, difficulty } = useGame();
  const answerTyped = useGame((s) => s.answerTyped);
  const next = useGame((s) => s.next);

  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // iOS Safari keeps the layout viewport full-height when the keyboard opens,
  // so the bottom-anchored HUD must be lifted by the keyboard's height.
  const keyboardInset = useKeyboardInset();

  const q = questions[index];
  const isTyped = q?.mode === "locate" || q?.mode === "flag";

  useEffect(() => {
    setValue("");
    if (status === "playing" && isTyped) inputRef.current?.focus();
  }, [index, status, isTyped]);

  useEffect(() => {
    if (status !== "feedback") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter") next(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, next]);

  if (!q || (status !== "playing" && status !== "feedback")) return null;

  const flag = q.mode === "flag" ? flagUrl(q.country) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    answerTyped(value);
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-3 pb-safe pt-2 transition-transform duration-200 sm:gap-3 sm:p-5"
      style={keyboardInset ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
    >
      <div className="anim-fade-up pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-slate-900/75 px-4 py-1.5 text-sm text-slate-300 shadow-lg shadow-black/30 backdrop-blur sm:gap-4">
        <span>
          Q <strong className="text-slate-100">{index + 1}</strong>/{questions.length}
        </span>
        <span>
          Score <strong className="text-emerald-400">{score}</strong>
        </span>
        <span className="text-slate-500">Best {best}</span>
      </div>

      <div className="glass-card anim-fade-up pointer-events-auto w-full max-w-md rounded-2xl p-3 sm:p-4">
        <p className="text-center text-xs uppercase tracking-wide text-slate-400">
          {MODE_LABELS[q.mode]}
        </p>

        {/* Easy-mode hint: which continent the answer is on. */}
        {status === "playing" && difficulty === "easy" && q.country.continent && (
          <p className="mt-1 text-center text-xs font-semibold text-sky-300">
            🌍 Hint: {q.country.continent}
          </p>
        )}

        {q.mode === "flag" && flag && (
          <img
            src={flag}
            alt="Flag to identify"
            className="mx-auto my-2 h-16 rounded-lg border border-white/15 object-contain shadow-lg shadow-black/40 ring-1 ring-black/20 sm:my-3 sm:h-24"
          />
        )}

        {q.mode === "name" && (
          <p className="my-1.5 text-center text-xl font-bold text-amber-300 drop-shadow-[0_1px_8px_rgba(252,211,77,0.25)] sm:my-2 sm:text-2xl">
            {q.country.name}
          </p>
        )}

        {status === "playing" ? (
          isTyped ? (
            <form onSubmit={submit} className="mt-2 flex gap-2">
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Type the country name…"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="field flex-1 px-3 py-2"
              />
              <button
                type="submit"
                className="btn btn-primary rounded-lg px-4 py-2"
              >
                Go
              </button>
            </form>
          ) : (
            <p className="mt-1 text-center text-sm text-slate-400">
              {isTouchDevice
                ? "Aim the crosshair at the country, then tap Select."
                : "Tap the country on the globe."}
            </p>
          )
        ) : (
          <Feedback
            correct={lastCorrect === true}
            given={lastGiven}
            answer={q.country.name}
            onNext={next}
          />
        )}
      </div>
    </div>
  );
}

function Feedback({
  correct,
  given,
  answer,
  onNext,
}: {
  correct: boolean;
  given: string;
  answer: string;
  onNext: () => void;
}) {
  return (
    <div className="mt-2 text-center">
      <p className={`anim-pop text-lg font-extrabold tracking-tight ${correct ? "text-emerald-400" : "text-rose-400"}`}>
        {correct ? "Correct! 🎉" : "Not quite"}
      </p>
      {!correct && (
        <p className="mt-1 text-sm text-slate-300">
          {given ? (
            <>You said <span className="text-slate-400">"{given}"</span> — </>
          ) : null}
          it was <span className="font-semibold text-amber-300">{answer}</span>
        </p>
      )}
      <button
        onClick={onNext}
        autoFocus
        className="btn btn-light mt-3 rounded-xl px-6 py-2"
      >
        Next →
      </button>
    </div>
  );
}
