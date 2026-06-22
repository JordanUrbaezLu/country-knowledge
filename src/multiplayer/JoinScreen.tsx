import { useEffect, useId, useState } from "react";
import { useRoom } from "./useRoom";
import { useAuth } from "../auth/useAuth";
import AccountScreen from "../auth/AccountScreen";

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

  const user = useAuth((s) => s.user);

  const nameId = useId();
  const codeId = useId();
  const [name, setName] = useState(user?.displayName ?? savedName);
  const [code, setCode] = useState((initialCode ?? "").toUpperCase());
  const [mode, setMode] = useState<"home" | "join">(initialCode ? "join" : "home");
  const [authTab, setAuthTab] = useState<"signup" | "login" | null>(null);

  // Keep the name in sync with auth: logging in (here or via the account chip)
  // fills in the account name; logging out reverts to the saved guest name
  // rather than stranding the ex-account name in the now-editable field.
  useEffect(() => {
    setName(user?.displayName ?? savedName);
  }, [user, savedName]);

  // When logged in, you play online *as your account* — the name is your userid,
  // so it's locked to it. Changing it is a separate account-rename flow (later).
  const locked = !!user;
  const nameOk = name.trim().length > 0;
  const codeOk = code.trim().length === 4;

  return (
    <div className="anim-fade-in absolute inset-0 z-10 flex items-center justify-center p-4">
      <div className="glass-card anim-fade-up w-full max-w-md rounded-3xl p-6">
        <h2 className="text-center text-2xl font-bold tracking-tight">Play online</h2>
        <p className="mt-1 text-center text-sm text-slate-400">
          {mode === "join" && initialCode
            ? `You've been invited to room ${code}`
            : "Create a room and share the link — no sign-up."}
        </p>

        <label htmlFor={nameId} className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Your name
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. John"
          maxLength={24}
          autoComplete="off"
          disabled={locked}
          readOnly={locked}
          aria-describedby={locked ? "name-locked-hint" : undefined}
          className="field mt-1 px-3 py-2.5 disabled:cursor-not-allowed disabled:text-slate-400 disabled:opacity-70"
          onKeyDown={(e) => {
            if (e.key === "Enter" && nameOk) {
              if (mode === "join" && codeOk) joinRoom(code, name);
              else if (mode === "home") createRoom(name);
            }
          }}
        />
        {locked && (
          <p id="name-locked-hint" className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <span aria-hidden>🔒</span> You're playing as your account name.
          </p>
        )}

        {mode === "home" ? (
          <>
            <button
              disabled={!nameOk || connecting}
              onClick={() => createRoom(name)}
              className="btn btn-primary mt-4 w-full rounded-xl px-4 py-3"
            >
              {connecting ? "Creating…" : "Create a room"}
            </button>
            <button
              onClick={() => setMode("join")}
              className="btn btn-ghost mt-2.5 w-full rounded-xl px-4 py-2.5 text-sm"
            >
              I have a room code
            </button>
          </>
        ) : (
          <>
            <label htmlFor={codeId} className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Room code
            </label>
            <input
              id={codeId}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
              className="field mt-1 px-3 py-2.5 text-center text-2xl font-bold tracking-[0.4em]"
            />
            <button
              disabled={!nameOk || !codeOk || connecting}
              onClick={() => joinRoom(code, name)}
              className="btn btn-primary mt-4 w-full rounded-xl px-4 py-3"
            >
              {connecting ? "Joining…" : "Join room"}
            </button>
            {!initialCode && (
              <button
                onClick={() => setMode("home")}
                className="btn btn-ghost mt-2.5 w-full rounded-xl px-4 py-2.5 text-sm"
              >
                ← Create a room instead
              </button>
            )}
          </>
        )}

        {error && (
          <p className="anim-fade-in mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-300">
            {error}
          </p>
        )}

        {!user && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <button
              onClick={() => setAuthTab("signup")}
              className="btn btn-ghost flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
            >
              Sign up
            </button>
            <button
              onClick={() => setAuthTab("login")}
              className="btn btn-ghost flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
            >
              Log in
            </button>
          </div>
        )}
        {!user && (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Sign in to save your stats, XP &amp; level — or just play as a guest.
          </p>
        )}
      </div>

      {/* Inline account screen — overlays in place so the room link / context is
          preserved. Opens on the chosen tab; the screen itself can switch between
          sign up and log in. */}
      {authTab && (
        <AccountScreen
          initialTab={authTab}
          subtitle="Save your stats, XP & level across devices."
          onClose={() => setAuthTab(null)}
          onDone={() => setAuthTab(null)}
        />
      )}
    </div>
  );
}
