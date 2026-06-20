import DifficultyPicker from "../components/DifficultyPicker";
import type { Country } from "../data/types";
import { playerColor } from "./colors";
import type { PlayerInfo } from "./protocol";
import { Leaderboard } from "./ui";
import { useRoom } from "./useRoom";

export default function GameOver({ countries }: { countries: Country[] }) {
  const finalLeaderboard = useRoom((s) => s.finalLeaderboard);
  const room = useRoom((s) => s.room);
  const myId = useRoom((s) => s.myId);
  const lobbyDifficulty = useRoom((s) => s.lobbyDifficulty);
  const setLobbyDifficulty = useRoom((s) => s.setLobbyDifficulty);
  const playAgain = useRoom((s) => s.playAgain);
  const leave = useRoom((s) => s.leave);

  if (!room) return null;
  const board: PlayerInfo[] =
    finalLeaderboard ?? [...room.players].sort((a, b) => b.score - a.score);
  const isHost = room.hostId === myId;
  const winner = board[0];
  const top3 = board.slice(0, 3);

  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center p-4 pb-safe sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/94 p-5 shadow-2xl backdrop-blur sm:p-6">
        <h2 className="text-center text-xl font-bold sm:text-2xl">Game over</h2>
        {winner && (
          <p className="mt-1 text-center text-sm text-slate-300">
            🏆 <span className="font-bold text-amber-300">{winner.name}</span> wins with{" "}
            {winner.score}!
          </p>
        )}

        {/* Podium */}
        <div className="mt-4 flex items-end justify-center gap-2">
          {[1, 0, 2].map((rank) => {
            const p = top3[rank];
            if (!p) return <div key={rank} className="w-20" />;
            const c = playerColor(p.colorIndex);
            const h = rank === 0 ? "h-24" : rank === 1 ? "h-16" : "h-12";
            return (
              <div key={p.id} className="flex w-20 flex-col items-center">
                <span className="mb-1 text-sm">{["🥇", "🥈", "🥉"][rank]}</span>
                <span className="max-w-full truncate text-xs font-semibold text-slate-200">
                  {p.name}
                </span>
                <span className="text-xs font-bold tabular-nums text-emerald-400">{p.score}</span>
                <div
                  className={`mt-1 w-full rounded-t-lg ${h}`}
                  style={{ background: c.hex, opacity: 0.85 }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-4 max-h-44 overflow-y-auto pr-1">
          <Leaderboard players={board} myId={myId} />
        </div>

        {isHost ? (
          <>
            <div className="mt-4">
              <DifficultyPicker value={lobbyDifficulty} onChange={setLobbyDifficulty} />
            </div>
            <button
              onClick={() => playAgain(countries)}
              className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Play again →
            </button>
          </>
        ) : (
          <p className="mt-4 animate-pulse text-center text-sm text-slate-400">
            Waiting for the host to start another game…
          </p>
        )}
        <button
          onClick={leave}
          className="mt-2 w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          Leave room
        </button>
      </div>
    </div>
  );
}
