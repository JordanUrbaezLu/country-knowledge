import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExplorePanel from "../components/ExplorePanel";
import GlobeView from "../globe/GlobeView";
import { loadStateFeatures, type StateFeature } from "../data/states";
import { stateFact } from "../data/stateFacts";
import type { Country } from "../data/types";
import { isTouchDevice } from "../lib/device";
import { useAuth } from "../auth/useAuth";

export default function ExploreView({ countries }: { countries: Country[] }) {
  const settings = useAuth((s) => s.settings);
  const [selected, setSelected] = useState<Country | null>(null);
  const [stateFeatures, setStateFeatures] = useState<StateFeature[] | null>(null);
  const [spinnerDone, setSpinnerDone] = useState(false);
  const [stateInfo, setStateInfo] = useState<{ name: string; fact: string } | null>(null);
  const reqId = useRef(0);

  const handleClick = useCallback((country: Country) => {
    setSelected(country);
    setStateInfo(null);
    setStateFeatures(null); // clear immediately so globe swaps to new country's states
    setSpinnerDone(false);
    const myReq = ++reqId.current;
    const MIN_SPINNER_MS = 2000;

    // Show states as soon as they arrive (early render is preferred).
    loadStateFeatures(country).then((features) => {
      if (reqId.current !== myReq) return;
      setStateFeatures(features ?? []);
    });

    // Spinner stays up for the full minimum, independent of data arrival.
    window.setTimeout(() => {
      if (reqId.current !== myReq) return;
      setSpinnerDone(true);
    }, MIN_SPINNER_MS);
  }, []);

  const handleStateClick = useCallback(
    (state: StateFeature) => {
      setStateInfo({ name: state.__name, fact: stateFact(state, selected?.name ?? "") });
    },
    [selected],
  );

  const close = useCallback(() => {
    reqId.current++;
    setSelected(null);
    setStateFeatures(null);
    setSpinnerDone(false);
    setStateInfo(null);
  }, []);

  // Deep link: /?country=USA (or alpha-2 / name) auto-selects on load.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("country");
    if (!code) return;
    const q = code.toUpperCase();
    const c = countries.find(
      (x) =>
        x.iso3?.toUpperCase() === q ||
        x.iso2?.toUpperCase() === q ||
        x.name.toLowerCase() === code.toLowerCase(),
    );
    if (c) handleClick(c);
  }, [countries, handleClick]);

  const focus = useMemo(
    () =>
      selected && selected.lat != null && selected.lng != null
        ? { lat: selected.lat, lng: selected.lng }
        : null,
    [selected],
  );

  // Show spinner while the 2s minimum hasn't elapsed yet.
  const loading = selected != null && !spinnerDone;

  return (
    <>
      <GlobeView
        countries={countries}
        selectedId={selected?.id ?? null}
        stateFeatures={stateFeatures}
        focus={focus}
        crosshair={isTouchDevice}
        rotationMode={settings.globeMode}
        // Hide the N/S orientation badges per the account setting, and always
        // while a country is selected: the info sheet (bottom sheet on mobile)
        // sits over the pole and the badge would bleed through the glass footer.
        poles={settings.showPoles && !selected}
        onCountryClick={handleClick}
        onStateClick={handleStateClick}
      />

      {/* Loading = its own top-level modal: a dimmed backdrop centres the spinner
          over everything (globe + panel), blocks interaction so you wait for the
          country to finish loading, and clears to reveal the focused country. */}
      {loading && (
        <div className="scrim anim-fade-in absolute inset-0 z-50 flex items-center justify-center p-6">
          <div className="glass-card anim-scale-in flex flex-col items-center gap-3 rounded-2xl px-8 py-7">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/15 border-t-sky-400" />
            <p className="text-sm text-slate-300">Loading {selected?.name}…</p>
          </div>
        </div>
      )}

      {/* Panel waits until loading clears, so it slides up after the modal — not
          alongside the spinner. */}
      {selected && spinnerDone && (
        <ExplorePanel
          country={selected}
          stateCount={stateFeatures ? stateFeatures.length : null}
          onClose={close}
        />
      )}

      {stateInfo && (
        /* On mobile: float above the bottom sheet (which is ~58 vh tall).
           On desktop: sit at the usual bottom position. */
        <div
          className={[
            "pointer-events-auto absolute left-1/2 w-full max-w-md -translate-x-1/2 px-4",
            selected
              ? "bottom-[43vh] sm:bottom-6"
              : "bottom-6",
          ].join(" ")}
        >
          <div className="glass-card anim-pop flex items-start gap-3 rounded-2xl border-amber-400/30 p-4 ring-1 ring-amber-400/20">
            <div className="flex-1">
              <p className="font-bold text-amber-300 drop-shadow-[0_1px_8px_rgba(252,211,77,0.25)]">{stateInfo.name}</p>
              <p className="mt-0.5 text-sm text-slate-200">{stateInfo.fact}</p>
            </div>
            <button
              onClick={() => setStateInfo(null)}
              aria-label="Close"
              className="rounded-lg px-2 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
