import DifficultyPicker from "../components/DifficultyPicker";
import type { Country } from "../data/types";
import { playerColor } from "./colors";
import type { PlayerInfo } from "./protocol";
import { Leaderboard } from "./ui";
import { useRoom } from "./useRoom";
import { useAuth } from "../auth/useAuth";
import XpReport from "../components/XpReport";

export default function GameOver({ countries }: { countries: Country[] }) {
  const finalLeaderboard = useRoom((s) => s.finalLeaderboard);
  const room = useRoom((s) => s.room);
  const myId = useRoom((s) => s.myId);
  const lobbyDifficulty = useRoom((s) => s.lobbyDifficulty);
  const setLobbyDifficulty = useRoom((s) => s.setLobbyDifficulty);
  const playAgain = useRoom((s) => s.playAgain);
  const leave = useRoom((s) => s.leave);
  const gameXp = useRoom((s) => s.gameXp);
  const xpBeforeGame = useRoom((s) => s.xpBeforeGame);
  const user = useAuth((s) => s.user);

  if (!room) return null;
  const board: PlayerInfo[] =
    finalLeaderboard ?? [...room.players].sort((a, b) => b.score - a.score);
  const isHost = room.hostId === myId;
  const winner = board[0];
  const top3 = board.slice(0, 3);

  return (
    <div className="anim-fade-in absolute inset-0 z-10 flex items-end justify-center p-4 pb-safe sm:items-center">
      <div className="glass-card anim-slide-up w-full max-w-md rounded-3xl p-5 sm:p-6">
        <h2 className="text-center text-xl font-bold tracking-tight sm:text-2xl">Game over</h2>
        {winner && (
          <p className="anim-fade-up mt-1 text-center text-sm text-slate-300">
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
                <span className="mb-1 text-base">{["🥇", "🥈", "🥉"][rank]}</span>
                <span className="max-w-full truncate text-xs font-semibold text-slate-200">
                  {p.name}
                </span>
                <span className="text-xs font-bold tabular-nums text-emerald-400">{p.score}</span>
                <div
                  className={`anim-grow-up mt-1 w-full rounded-t-xl shadow-[inset_0_2px_0_rgba(255,255,255,0.3),0_8px_20px_-8px_rgba(0,0,0,0.6)] ${h}`}
                  style={{
                    background: `linear-gradient(180deg, ${c.hex}, ${c.hex}cc)`,
                    animationDelay: rank === 0 ? "0.1s" : rank === 1 ? "0.18s" : "0.26s",
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-4 max-h-44 overflow-y-auto pr-1">
          <Leaderboard players={board} myId={myId} />
        </div>

        {user && gameXp > 0 && <XpReport fromXp={xpBeforeGame} gainedXp={gameXp} />}

        {isHost ? (
          <>
            <div className="mt-4">
              <DifficultyPicker value={lobbyDifficulty} onChange={setLobbyDifficulty} />
            </div>
            <button
              onClick={() => playAgain(countries)}
              className="btn btn-success mt-3 w-full rounded-xl px-4 py-3"
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
          className="btn btn-ghost mt-2.5 w-full rounded-xl px-4 py-2 text-sm"
        >
          Leave room
        </button>
      </div>
    </div>
  );
}
