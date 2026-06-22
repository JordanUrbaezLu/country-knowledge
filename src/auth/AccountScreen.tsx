import { useState } from "react";
import { useAuth } from "./useAuth";
import { useKeyboardInset } from "../lib/useKeyboardInset";

/**
 * One-minute account UI: pick a username + password, or log in. Used both as a
 * full-screen modal (from the account chip) and inline on the room-join screen
 * (the shared-link flow), so it stays self-contained and callback-driven.
 *
 * iPhone-first: 16px inputs (no focus-zoom), big tap targets, correct
 * autocomplete/capitalize hints, and the card lifts above the iOS keyboard.
 */
export default function AccountScreen({
  initialTab = "signup",
  title,
  subtitle,
  onDone,
  onGuest,
  onClose,
}: {
  initialTab?: "signup" | "login";
  title?: string;
  subtitle?: string;
  /** called after a successful signup/login */
  onDone?: () => void;
  /** if provided, shows a "Continue as guest" action (room-link flow) */
  onGuest?: () => void;
  /** if provided, shows a dismiss (×) control (modal flow) */
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"signup" | "login">(initialTab);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const signup = useAuth((s) => s.signup);
  const login = useAuth((s) => s.login);
  const clearError = useAuth((s) => s.clearError);
  const inset = useKeyboardInset();

  const canSubmit = username.trim().length >= 3 && password.length >= 6 && !busy;

  async function submit() {
    if (!canSubmit) return;
    const ok = tab === "signup" ? await signup(username, password) : await login(username, password);
    if (ok) onDone?.();
  }

  function switchTab(next: "signup" | "login") {
    if (next === tab) return;
    clearError();
    setTab(next);
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ paddingBottom: inset || undefined }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/92 p-6 shadow-2xl backdrop-blur">
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        )}

        <h2 className="text-center text-2xl font-bold">
          {title ?? (tab === "signup" ? "Create your account" : "Welcome back")}
        </h2>
        <p className="mt-1 text-center text-sm text-slate-400">
          {subtitle ?? (tab === "signup" ? "Takes a minute — no email, no verification." : "Log in to keep your stats.")}
        </p>

        {/* Tab toggle */}
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-800/70 p-1 text-sm font-semibold">
          <button
            onClick={() => switchTab("signup")}
            className={`rounded-md py-2 transition ${tab === "signup" ? "bg-sky-500 text-slate-950" : "text-slate-300"}`}
          >
            Sign up
          </button>
          <button
            onClick={() => switchTab("login")}
            className={`rounded-md py-2 transition ${tab === "login" ? "bg-sky-500 text-slate-950" : "text-slate-300"}`}
          >
            Log in
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. globe_master"
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          enterKeyHint="next"
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100 outline-none focus:border-sky-400"
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Password
        </label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          type="password"
          maxLength={200}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete={tab === "signup" ? "new-password" : "current-password"}
          enterKeyHint="go"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100 outline-none focus:border-sky-400"
        />

        {error && <p className="mt-3 text-center text-sm text-amber-400">{error}</p>}

        <button
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
        >
          {busy ? "…" : tab === "signup" ? "Create account" : "Log in"}
        </button>

        {tab === "signup" && (
          <p className="mt-2 text-center text-xs text-slate-500">
            No email needed — just remember your password (there's no reset yet).
          </p>
        )}

        {onGuest && (
          <button
            onClick={onGuest}
            className="mt-3 w-full rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Continue as guest
          </button>
        )}
      </div>
    </div>
  );
}
