import { useState } from "react";
import { useRoom } from "./useRoom";

/**
 * Entry point for multiplayer: "send a link, enter your name, that's it."
 * If we arrived via a share link (?room=CODE) we jump straight to joining that
 * room with the saved name prefilled.
 */
export default function JoinScreen({ initialCode }: { initialCode?: string | null }) {
  const savedName = useRoom((s) => s.name);
  const connecting = useRoom((s) => s.connecting);
  const error = useRoom((s) => s.error);
  const createRoom = useRoom((s) => s.createRoom);
  const joinRoom = useRoom((s) => s.joinRoom);

  const [name, setName] = useState(savedName);
  const [code, setCode] = useState((initialCode ?? "").toUpperCase());
  const [mode, setMode] = useState<"home" | "join">(initialCode ? "join" : "home");

  const nameOk = name.trim().length > 0;
  const codeOk = code.trim().length === 4;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/92 p-6 shadow-2xl backdrop-blur">
        <h2 className="text-center text-2xl font-bold">Play online</h2>
        <p className="mt-1 text-center text-sm text-slate-400">
          {mode === "join" && initialCode
            ? `You've been invited to room ${code}`
            : "Create a room and share the link — no sign-up."}
        </p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Your name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. John"
          maxLength={24}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-400"
          onKeyDown={(e) => {
            if (e.key === "Enter" && nameOk) {
              if (mode === "join" && codeOk) joinRoom(code, name);
              else if (mode === "home") createRoom(name);
            }
          }}
        />

        {mode === "home" ? (
          <>
            <button
              disabled={!nameOk || connecting}
              onClick={() => createRoom(name)}
              className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
            >
              {connecting ? "Creating…" : "Create a room"}
            </button>
            <button
              onClick={() => setMode("join")}
              className="mt-2 w-full rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              I have a room code
            </button>
          </>
        ) : (
          <>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Room code
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-center text-2xl font-bold tracking-[0.4em] text-slate-100 outline-none focus:border-sky-400"
            />
            <button
              disabled={!nameOk || !codeOk || connecting}
              onClick={() => joinRoom(code, name)}
              className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
            >
              {connecting ? "Joining…" : "Join room"}
            </button>
            {!initialCode && (
              <button
                onClick={() => setMode("home")}
                className="mt-2 w-full rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                ← Create a room instead
              </button>
            )}
          </>
        )}

        {error && <p className="mt-3 text-center text-sm text-amber-400">{error}</p>}
      </div>
    </div>
  );
}
