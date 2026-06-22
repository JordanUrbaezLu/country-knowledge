import { useState } from "react";
import DifficultyPicker from "../components/DifficultyPicker";
import type { Country } from "../data/types";
import { PlayerChip } from "./ui";
import { shareUrlFor, useRoom } from "./useRoom";

export default function Lobby({ countries }: { countries: Country[] }) {
  const room = useRoom((s) => s.room);
  const myId = useRoom((s) => s.myId);
  const code = useRoom((s) => s.code);
  const lobbyDifficulty = useRoom((s) => s.lobbyDifficulty);
  const setLobbyDifficulty = useRoom((s) => s.setLobbyDifficulty);
  const startGame = useRoom((s) => s.startGame);
  const leave = useRoom((s) => s.leave);

  const [copied, setCopied] = useState(false);

  if (!room || !code) return null;
  const isHost = room.hostId === myId;
  const url = shareUrlFor(code);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Globe Royale", text: "Join my game on Globe Royale!", url });
        return;
      }
    } catch {
      /* user cancelled share — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is shown on screen as a fallback */
    }
  };

  return (
    <div className="anim-fade-in absolute inset-0 z-10 flex items-end justify-center p-4 pb-safe sm:items-center">
      <div className="glass-card anim-slide-up w-full max-w-md rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Game lobby</h2>
          <button onClick={leave} className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-white/10 hover:text-slate-200">
            Leave
          </button>
        </div>

        {/* Invite */}
        <div className="glass-soft mt-3 rounded-2xl p-3.5 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">Room code</p>
          <p
            data-testid="room-code"
            className="bg-linear-to-r from-sky-300 to-indigo-300 bg-clip-text text-4xl font-black tracking-[0.3em] text-transparent drop-shadow-[0_2px_12px_rgba(56,189,248,0.25)]"
          >
            {code}
          </p>
          <button
            onClick={share}
            className="btn btn-primary mt-2.5 w-full rounded-xl px-4 py-2.5 text-sm"
          >
            {copied ? "✓ Link copied!" : "📋 Copy invite link"}
          </button>
          <p className="mt-1.5 break-all text-[11px] text-slate-500">{url}</p>
        </div>

        {/* Players */}
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Players ({room.players.filter((p) => p.connected).length})
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {room.players.map((p) => (
            <PlayerChip
              key={p.id}
              player={p}
              isHost={p.id === room.hostId}
              isMe={p.id === myId}
            />
          ))}
        </div>

        {/* Difficulty + start */}
        <div className="mt-4">
          {isHost ? (
            <DifficultyPicker value={lobbyDifficulty} onChange={setLobbyDifficulty} />
          ) : (
            <p className="text-center text-sm text-slate-400">
              The host picks the difficulty (Easy / Medium / Hard).
            </p>
          )}
        </div>

        {isHost ? (
          <button
            onClick={() => startGame(countries)}
            className="btn btn-success mt-4 w-full rounded-xl px-4 py-3"
          >
            Start game →
          </button>
        ) : (
          <p className="mt-4 animate-pulse text-center text-sm text-slate-400">
            Waiting for the host to start…
          </p>
        )}
      </div>
    </div>
  );
}
