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
    <div className="absolute inset-0 z-10 flex items-end justify-center p-4 pb-safe sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/92 p-5 shadow-2xl backdrop-blur sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Game lobby</h2>
          <button onClick={leave} className="text-sm text-slate-400 hover:text-slate-200">
            Leave
          </button>
        </div>

        {/* Invite */}
        <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-800/50 p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">Room code</p>
          <p data-testid="room-code" className="text-3xl font-black tracking-[0.3em] text-sky-300">
            {code}
          </p>
          <button
            onClick={share}
            className="mt-2 w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400"
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
            className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
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
