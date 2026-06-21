import { playerColor } from "./colors";
import type { PlayerInfo } from "./protocol";

export function PlayerDot({ colorIndex, size = 10 }: { colorIndex: number; size?: number }) {
  const c = playerColor(colorIndex);
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: c.hex,
        boxShadow: `0 0 6px ${c.hex}`,
      }}
    />
  );
}

/** Lobby/tally chip: colored dot + name, greyed when disconnected, ✓ once answered. */
export function PlayerChip({
  player,
  isHost,
  isMe,
  showAnswered,
}: {
  player: PlayerInfo;
  isHost?: boolean;
  isMe?: boolean;
  showAnswered?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
        player.connected
          ? "border-slate-600/70 bg-slate-800/70"
          : "border-slate-700/40 bg-slate-800/30 opacity-50"
      }`}
    >
      <PlayerDot colorIndex={player.colorIndex} />
      <span className="font-semibold text-slate-100">
        {player.name}
        {isMe && <span className="text-slate-400"> (you)</span>}
      </span>
      {isHost && <span title="Host">👑</span>}
      {showAnswered &&
        (player.answered ? (
          <span className="text-emerald-400">✓</span>
        ) : (
          <span className="text-slate-500">…</span>
        ))}
    </div>
  );
}

export function Leaderboard({
  players,
  myId,
  title,
}: {
  players: PlayerInfo[];
  myId: string;
  title?: string;
}) {
  return (
    <div>
      {title && (
        <p className="mb-1.5 text-center text-xs uppercase tracking-wide text-slate-400">{title}</p>
      )}
      <ol className="space-y-1">
        {players.map((p, i) => (
          <li
            key={p.id}
            data-testid="lb-entry"
            data-name={p.name}
            data-score={p.score}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
              p.id === myId ? "bg-sky-500/15 ring-1 ring-sky-400/40" : "bg-slate-800/50"
            } ${p.connected ? "" : "opacity-50"}`}
          >
            <span className="w-5 text-center font-bold text-slate-400">{i + 1}</span>
            <PlayerDot colorIndex={p.colorIndex} />
            <span className="flex-1 truncate font-medium text-slate-100">{p.name}</span>
            <span className="font-bold tabular-nums text-emerald-400">{p.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
