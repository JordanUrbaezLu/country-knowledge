import { Suspense, lazy, useEffect, useState } from "react";
import ModeSwitcher, { type AppMode } from "./components/ModeSwitcher";
import { useCountries } from "./data/useCountries";
import { useAuth } from "./auth/useAuth";
import AccountScreen from "./auth/AccountScreen";
import ProfileView from "./profile/ProfileView";
import LevelBadge from "./components/LevelBadge";

// Code-split the globe-heavy views (three.js / react-globe.gl is ~2MB) so the
// shell + menu paint immediately and the globe chunk streams in after.
const ExploreView = lazy(() => import("./explore/ExploreView"));
const GameView = lazy(() => import("./game/GameView"));
const MultiplayerView = lazy(() => import("./multiplayer/MultiplayerView"));

function Splash({ text }: { text: string }) {
  const isError = text.startsWith("Error");
  return (
    <div className="anim-fade-in absolute inset-0 flex items-center justify-center p-6">
      <div className="glass-card flex flex-col items-center gap-3 rounded-2xl px-7 py-6">
        {isError ? (
          <span className="text-2xl" aria-hidden>⚠️</span>
        ) : (
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/15 border-t-sky-400" aria-hidden />
        )}
        <p className={`text-sm ${isError ? "text-amber-300" : "text-slate-300"}`}>{text}</p>
      </div>
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
  const stats = useAuth((s) => s.stats);
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
      {/* Subtle depth behind the globe: top aurora glow + corner accent + vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 6%, rgba(64,118,196,0.22), rgba(5,7,15,0) 52%)," +
            "radial-gradient(80% 60% at 88% 100%, rgba(99,102,241,0.12), rgba(5,7,15,0) 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(120% 120% at 50% 50%, rgba(5,7,15,0) 58%, rgba(2,3,9,0.55) 100%)",
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
        <h1 className="bg-linear-to-r from-sky-300 via-cyan-200 to-indigo-300 bg-clip-text text-xl font-extrabold tracking-tight text-transparent drop-shadow-[0_2px_12px_rgba(56,189,248,0.25)]">
          Globe Royale
        </h1>
        <p className="text-sm text-slate-400">{HEADER_SUBTITLE[mode]}</p>
      </header>

      {/* Level — top-left when logged in. Sits in the free top-left corner on
          mobile and tucks just below the desktop brand. The desktop offset uses
          MARGIN, not padding: `.pt-safe` is unlayered CSS and would otherwise
          override a `sm:pt-*` padding utility, leaving the badge on top of the
          brand. Tapping opens the profile. */}
      {accountsAvailable && user && (
        <div className="absolute left-0 top-0 z-40 p-3 pt-safe pl-safe sm:p-5 sm:mt-16">
          <LevelBadge xp={stats?.xp ?? 0} onClick={() => setAccountOpen(true)} />
        </div>
      )}

      {/* Mode toggle — centred, z-40 keeps it tappable above overlays. The toggle
          is too wide to share the level/account-chip row at phone widths, so on
          mobile it drops to its own row clearly BELOW them; on desktop it's the
          top-centre nav (the brand lives top-left). */}
      <div className="absolute left-1/2 top-0 z-40 flex -translate-x-1/2 flex-col items-center pt-safe sm:top-4">
        <div className="mt-16 sm:mt-0">
          <ModeSwitcher mode={mode} onChange={setMode} />
        </div>
      </div>

      {/* Account chip — top-right. Hidden when the server has accounts disabled. */}
      {accountsAvailable && (
        <div className="absolute right-0 top-0 z-40 p-3 pt-safe pr-safe sm:p-5">
          <button
            onClick={() => setAccountOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-white/12 bg-slate-900/70 px-3 py-1.5 text-sm font-semibold text-slate-100 shadow-lg shadow-black/30 backdrop-blur transition hover:-translate-y-px hover:border-white/20 hover:bg-white/10 active:translate-y-0"
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
