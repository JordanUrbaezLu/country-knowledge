import { useEffect, useId, useState } from "react";
import { useAuth } from "./useAuth";
import { useKeyboardInset } from "../lib/useKeyboardInset";
import SegmentedToggle, { type SegOption } from "../components/SegmentedToggle";

const AUTH_TABS: SegOption<"signup" | "login">[] = [
  { value: "signup", label: "Sign up" },
  { value: "login", label: "Log in" },
];

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
  const usernameId = useId();
  const passwordId = useId();
  const [tab, setTab] = useState<"signup" | "login">(initialTab);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const signup = useAuth((s) => s.signup);
  const login = useAuth((s) => s.login);
  const clearError = useAuth((s) => s.clearError);
  const inset = useKeyboardInset();

  // The error/busy fields are shared across all auth actions (login, signup,
  // rename). Start every fresh auth screen clean so a leftover error from a
  // prior action (e.g. a failed rename, then logout) never shows up here.
  useEffect(() => clearError(), [clearError]);

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
      className="scrim anim-fade-in absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ paddingBottom: inset || undefined }}
      onClick={(e) => {
        // Tap the dimmed backdrop (not the card) to dismiss.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="glass-card anim-scale-in relative w-full max-w-md rounded-3xl p-6">
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          >
            ✕
          </button>
        )}

        <h2 className="text-center text-2xl font-bold tracking-tight">
          {title ?? (tab === "signup" ? "Create your account" : "Welcome back")}
        </h2>
        <p className="mt-1 text-center text-sm text-slate-400">
          {subtitle ?? (tab === "signup" ? "Takes a minute — no email, no verification." : "Log in to keep your stats.")}
        </p>

        {/* Tab toggle */}
        <div className="mt-5">
          <SegmentedToggle
            options={AUTH_TABS}
            value={tab}
            onChange={switchTab}
            shape="segment"
          />
        </div>

        <label htmlFor={usernameId} className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Username
        </label>
        <input
          id={usernameId}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. globe_master"
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          enterKeyHint="next"
          className="field mt-1 px-3 py-3 text-base"
        />

        <label htmlFor={passwordId} className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Password
        </label>
        <input
          id={passwordId}
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
          className="field mt-1 px-3 py-3 text-base"
        />

        {error && (
          <p className="anim-fade-in mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-300">
            {error}
          </p>
        )}

        <button
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="btn btn-primary mt-5 w-full rounded-xl px-4 py-3"
        >
          {busy ? "…" : tab === "signup" ? "Create account" : "Log in"}
        </button>

        {tab === "signup" && (
          <p className="mt-2.5 text-center text-xs text-slate-500">
            No email needed — just remember your password (there's no reset yet).
          </p>
        )}

        {onGuest && (
          <button
            onClick={onGuest}
            className="btn btn-ghost mt-3 w-full rounded-xl px-4 py-2.5 text-sm"
          >
            Continue as guest
          </button>
        )}
      </div>
    </div>
  );
}
