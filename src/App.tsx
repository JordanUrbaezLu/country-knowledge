import { useState } from "react";
import ModeSwitcher, { type AppMode } from "./components/ModeSwitcher";
import { useCountries } from "./data/useCountries";
import ExploreView from "./explore/ExploreView";
import GameView from "./game/GameView";

function Splash({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <p className="rounded-lg bg-slate-900/70 px-4 py-2 text-sm text-slate-300">{text}</p>
    </div>
  );
}

export default function App() {
  const { countries, error } = useCountries();
  const [mode, setMode] = useState<AppMode>("explore");

  return (
    <div className="relative h-full w-full">
      {countries &&
        (mode === "explore" ? (
          <ExploreView countries={countries} />
        ) : (
          <GameView countries={countries} />
        ))}

      {/* Header — compact on mobile so it doesn't clash with the centred mode switcher */}
      <header className="pointer-events-none absolute left-0 top-0 pt-safe pl-safe p-3 sm:p-5">
        <h1 className="text-sm font-bold tracking-tight sm:text-xl">Country Knowledge</h1>
        <p className="hidden text-sm text-slate-400 sm:block">
          {mode === "explore"
            ? "Click a country for its flag, capital & state borders"
            : "Test yourself with a 10-question round"}
        </p>
      </header>

      {/* Mode switcher — pushed down on mobile so it clears the status bar */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 pt-safe sm:top-4">
        <ModeSwitcher mode={mode} onChange={setMode} />
      </div>

      {!countries && !error && <Splash text="Loading globe…" />}
      {error && <Splash text={`Error: ${error}`} />}
    </div>
  );
}
