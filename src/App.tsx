import { Suspense, lazy, useEffect, useState } from "react";
import ModeSwitcher, { type AppMode } from "./components/ModeSwitcher";
import { useCountries } from "./data/useCountries";
import { useAuth } from "./auth/useAuth";
import AccountScreen from "./auth/AccountScreen";
import ProfileView from "./profile/ProfileView";

// Code-split the globe-heavy views (three.js / react-globe.gl is ~2MB) so the
// shell + menu paint immediately and the globe chunk streams in after.
const ExploreView = lazy(() => import("./explore/ExploreView"));
const GameView = lazy(() => import("./game/GameView"));
const MultiplayerView = lazy(() => import("./multiplayer/MultiplayerView"));

function Splash({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <p className="rounded-lg bg-slate-900/70 px-4 py-2 text-sm text-slate-300">{text}</p>
    </div>
  );
}

/** A ?room=CODE share link drops you straight into multiplayer. */
const initialRoom: string | null =
  typeof location !== "undefined" ? new URLSearchParams(location.search).get("room") : null;

const HEADER_SUBTITLE: Record<AppMode, string> = {
  explore: "Click a country for its flag, capital & state borders",
  solo: "Test yourself with a 10-question round",
  multiplayer: "Create a room and play with anyone, anywhere",
};

export default function App() {
  const { countries, error } = useCountries();
  const [mode, setMode] = useState<AppMode>(initialRoom ? "multiplayer" : "explore");

  const user = useAuth((s) => s.user);
  const accountsAvailable = useAuth((s) => s.available);
  const bootstrap = useAuth((s) => s.bootstrap);
  const logout = useAuth((s) => s.logout);
  const [accountOpen, setAccountOpen] = useState(false);

  // Non-blocking session check on load — guests are never made to wait.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Subtle depth behind the globe */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 8%, rgba(56,99,168,0.18), rgba(5,7,15,0) 55%)",
        }}
      />

      {countries && (
        <Suspense fallback={<Splash text="Loading globe…" />}>
          {mode === "explore" ? (
            <ExploreView countries={countries} />
          ) : mode === "solo" ? (
            <GameView countries={countries} />
          ) : (
            <MultiplayerView countries={countries} initialCode={initialRoom} />
          )}
        </Suspense>
      )}

      {/* Brand — desktop top-left (the mobile brand lives in the centred cluster). */}
      <header className="pointer-events-none absolute left-0 top-0 z-30 hidden pt-safe pl-safe p-5 sm:block">
        <h1 className="bg-linear-to-r from-sky-300 to-indigo-300 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
          Globe Royale
        </h1>
        <p className="text-sm text-slate-400">{HEADER_SUBTITLE[mode]}</p>
      </header>

      {/* Top cluster — z-40 keeps it tappable above overlays. On mobile a compact
          wordmark sits above the toggle (no collision); on desktop just the toggle. */}
      <div className="absolute left-1/2 top-2.5 z-40 flex -translate-x-1/2 flex-col items-center gap-1.5 pt-safe sm:top-4 sm:gap-0">
        <span className="bg-linear-to-r from-sky-300 to-indigo-300 bg-clip-text text-sm font-extrabold tracking-tight text-transparent sm:hidden">
          Globe Royale
        </span>
        <ModeSwitcher mode={mode} onChange={setMode} />
      </div>

      {/* Account chip — top-right. Hidden when the server has accounts disabled. */}
      {accountsAvailable && (
        <div className="absolute right-0 top-0 z-40 p-3 pt-safe pr-safe sm:p-5">
          <button
            onClick={() => setAccountOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-slate-600/70 bg-slate-900/80 px-3 py-1.5 text-sm font-semibold text-slate-100 shadow-lg backdrop-blur transition hover:bg-slate-800"
          >
            {user ? (
              <>
                <span aria-hidden>👤</span>
                <span className="max-w-28 truncate">{user.displayName}</span>
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </div>
      )}

      {accountOpen &&
        (user ? (
          <ProfileView
            user={user}
            onClose={() => setAccountOpen(false)}
            onLogout={async () => {
              await logout();
              setAccountOpen(false);
            }}
          />
        ) : (
          <AccountScreen onClose={() => setAccountOpen(false)} onDone={() => setAccountOpen(false)} />
        ))}

      {!countries && !error && <Splash text="Loading globe…" />}
      {error && <Splash text={`Error: ${error}`} />}
    </div>
  );
}
