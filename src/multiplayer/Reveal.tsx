import { useEffect, useState } from "react";
import { flagUrl } from "../data/countries";
import type { Country } from "../data/types";
import { playerColor } from "./colors";
import type { RoundResult } from "./protocol";
import { Leaderboard } from "./ui";
import { useRoom } from "./useRoom";

export default function Reveal({ answer }: { answer: Country | null }) {
  const reveal = useRoom((s) => s.reveal);
  const room = useRoom((s) => s.room);
  const myId = useRoom((s) => s.myId);
  const skip = useRoom((s) => s.skip);

  // local auto-advance countdown, reset each round
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!reveal) return;
    const start = Date.now();
    const tick = () =>
      setSecs(Math.max(0, Math.ceil((reveal.nextInMs - (Date.now() - start)) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [reveal]);

  if (!reveal || !room) return null;
  const isHost = room.hostId === myId;
  const isLast = reveal.round + 1 >= reveal.totalRounds;

  const colorOf = (id: string) =>
    reveal.leaderboard.find((p) => p.id === id)?.colorIndex ?? 0;

  const results = [...reveal.results].sort((a, b) => b.points - a.points);
  const flag = answer ? flagUrl(answer) : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-safe pt-2 sm:p-5">
      <div className="pointer-events-auto flex max-h-[68vh] w-full max-w-md flex-col rounded-2xl border border-slate-700/60 bg-slate-900/94 p-4 shadow-2xl backdrop-blur sm:max-h-[80vh]">
        {/* Answer */}
        <div className="flex items-center justify-center gap-2">
          {flag && <img src={flag} alt="" className="h-7 rounded border border-slate-600" />}
          <p className="text-center text-lg font-bold">
            It was <span className="text-amber-300">{answer?.name ?? "—"}</span>
          </p>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto pr-1">
          {/* This round's picks */}
          <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">This round</p>
          <ul className="space-y-1">
            {results.map((r) => (
              <RoundRow key={r.id} r={r} colorIndex={colorOf(r.id)} />
            ))}
          </ul>

          {/* Running leaderboard */}
          <div className="mt-4">
            <Leaderboard players={reveal.leaderboard} myId={myId} title="Leaderboard" />
          </div>
        </div>

        {/* Advance */}
        <div className="mt-3">
          {isHost ? (
            <button
              onClick={() => skip({ expect: "reveal", round: reveal.round })}
              className="w-full rounded-lg bg-sky-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-sky-400"
            >
              {isLast ? "See final results →" : "Next round →"} {secs > 0 ? `(${secs})` : ""}
            </button>
          ) : (
            <p className="text-center text-sm text-slate-400">
              {isLast ? "Final results" : "Next round"} in {secs}s…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RoundRow({ r, colorIndex }: { r: RoundResult; colorIndex: number }) {
  const c = playerColor(colorIndex);
  const time = r.elapsedMs != null ? `${(r.elapsedMs / 1000).toFixed(1)}s` : null;
  const partial = r.accuracy > 0 && r.accuracy < 1;
  return (
    <li className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-1.5 text-sm">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: c.hex, boxShadow: `0 0 6px ${c.hex}` }}
      />
      <span className="font-semibold text-slate-100">{r.name}</span>
      <span
        aria-hidden
        title={partial ? "Close — half credit" : undefined}
        className={partial ? "font-bold text-amber-400" : ""}
      >
        {r.accuracy >= 1 ? "✅" : partial ? "≈" : "❌"}
      </span>
      <span className="flex-1 truncate text-slate-400">
        {r.pickedLabel ? r.pickedLabel : <span className="italic text-slate-500">no answer</span>}
        {partial && <span className="text-amber-400/80"> · close</span>}
        {time && <span className="text-slate-600"> · {time}</span>}
      </span>
      <span
        className={`font-bold tabular-nums ${r.points > 0 ? "text-emerald-400" : "text-slate-600"}`}
      >
        +{r.points}
      </span>
    </li>
  );
}
