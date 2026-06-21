import { useEffect, useMemo } from "react";
import type { Country } from "../data/types";
import GlobeView, { type GlobeMarker } from "../globe/GlobeView";
import { isTouchDevice } from "../lib/device";
import { playerColor } from "./colors";
import GameOver from "./GameOver";
import JoinScreen from "./JoinScreen";
import Lobby from "./Lobby";
import Reveal from "./Reveal";
import RoundHud from "./RoundHud";
import { useRoom } from "./useRoom";

const GOLD = "#fbbf24";

export default function MultiplayerView({
  countries,
  initialCode,
}: {
  countries: Country[];
  initialCode?: string | null;
}) {
  const code = useRoom((s) => s.code);
  const room = useRoom((s) => s.room);
  const question = useRoom((s) => s.question);
  const reveal = useRoom((s) => s.reveal);
  const answered = useRoom((s) => s.answeredThisRound);
  const error = useRoom((s) => s.error);
  const leave = useRoom((s) => s.leave);
  const submitAnswer = useRoom((s) => s.submitAnswer);

  const byId = useMemo(() => new Map(countries.map((c) => [c.id, c])), [countries]);

  const phase: "home" | "connecting" | "lobby" | "question" | "reveal" | "gameover" = !code
    ? "home"
    : !room
      ? "connecting"
      : room.status;

  const target = question ? byId.get(question.countryId) ?? null : null;
  const answer = reveal ? byId.get(reveal.countryId) ?? null : null;

  // Dev/e2e-only hook so the automated multiplayer test can answer
  // deterministically. Stripped from production builds (import.meta.env.DEV).
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __ckTarget?: string | null }).__ckTarget = target?.name ?? null;
    }
  }, [target]);

  // Globe lighting for the reveal: answer in gold, every resolvable guess in its
  // player's color, with floating name labels.
  const revealGlobe = useMemo(() => {
    if (phase !== "reveal" || !reveal) return null;
    const colorOf = new Map(reveal.leaderboard.map((p) => [p.id, p.colorIndex]));
    const highlights: Record<string, string> = {};
    const markers: GlobeMarker[] = [];

    // guesses first so the gold answer can override a correct guess's color
    for (const r of reveal.results) {
      if (r.pickedCountryId) {
        highlights[r.pickedCountryId] = playerColor(colorOf.get(r.id) ?? 0).hex;
      }
    }
    if (reveal.countryId) highlights[reveal.countryId] = GOLD;

    // group wrong-country guesses by country for one tidy label each
    const groups = new Map<string, { names: string[]; colorIndex: number }>();
    for (const r of reveal.results) {
      if (!r.pickedCountryId || r.pickedCountryId === reveal.countryId) continue;
      const g = groups.get(r.pickedCountryId);
      if (g) g.names.push(r.name);
      else groups.set(r.pickedCountryId, { names: [r.name], colorIndex: colorOf.get(r.id) ?? 0 });
    }
    for (const [cid, g] of groups) {
      const c = byId.get(cid);
      if (c && c.lat != null && c.lng != null) {
        markers.push({
          id: cid,
          lat: c.lat,
          lng: c.lng,
          label: g.names.join(", "),
          color: playerColor(g.colorIndex).hex,
        });
      }
    }
    if (answer && answer.lat != null && answer.lng != null) {
      markers.push({
        id: answer.id,
        lat: answer.lat,
        lng: answer.lng,
        label: `🏁 ${answer.name}`,
        color: GOLD,
        emphasis: true,
      });
    }
    return { highlights, markers };
  }, [phase, reveal, byId, answer]);

  // What the globe shows for the live question.
  const isLocate = phase === "question" && question?.mode === "locate";
  const isFind = phase === "question" && question?.mode === "name";

  const onCountryClick =
    isFind && !answered && target
      ? (c: Country) => submitAnswer(c.id === target.id ? 1 : 0, c.name, c.id)
      : undefined;

  const focus =
    phase === "reveal" && answer && answer.lat != null && answer.lng != null
      ? { lat: answer.lat, lng: answer.lng }
      : isLocate && target && target.lat != null && target.lng != null
        ? { lat: target.lat, lng: target.lng }
        : null;

  return (
    <>
      <GlobeView
        countries={countries}
        showLabels={phase === "reveal"}
        autoRotate={phase === "home" || phase === "connecting" || phase === "lobby" || phase === "gameover"}
        highlightId={isLocate && target ? target.id : null}
        highlights={revealGlobe?.highlights ?? null}
        markers={revealGlobe?.markers ?? null}
        focus={focus}
        focusAltitude={phase === "reveal" ? 2.3 : undefined}
        crosshair={isFind && isTouchDevice && !answered}
        onCountryClick={onCountryClick}
      />

      {phase === "home" && <JoinScreen initialCode={initialCode} />}

      {phase === "connecting" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/92 p-6 text-center shadow-2xl backdrop-blur">
            <p className="animate-pulse text-slate-200">Connecting to room {code}…</p>
            {error && <p className="mt-2 text-sm text-amber-400">{error}</p>}
            <button
              onClick={leave}
              className="mt-4 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "lobby" && <Lobby countries={countries} />}
      {phase === "question" && <RoundHud countries={countries} target={target} />}
      {phase === "reveal" && <Reveal answer={answer} />}
      {phase === "gameover" && <GameOver countries={countries} />}

      {/* reconnect banner during active play */}
      {error && (phase === "question" || phase === "reveal" || phase === "lobby") && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-semibold text-slate-950 pt-safe">
          {error}
        </div>
      )}
    </>
  );
}
