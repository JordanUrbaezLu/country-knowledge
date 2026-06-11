import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExplorePanel from "../components/ExplorePanel";
import GlobeView from "../globe/GlobeView";
import { loadStateFeatures, type StateFeature } from "../data/states";
import { stateFact } from "../data/stateFacts";
import type { Country } from "../data/types";
import { isTouchDevice } from "../lib/device";

export default function ExploreView({ countries }: { countries: Country[] }) {
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
        onCountryClick={handleClick}
        onStateClick={handleStateClick}
      />

      {loading && (
        /* On mobile: centre in the upper ~42 vh so it's above the bottom sheet */
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[42vh] items-center justify-center sm:inset-0 sm:h-auto sm:bg-slate-950/40">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-slate-900/85 px-6 py-5 shadow-xl backdrop-blur">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-600 border-t-sky-400" />
            <p className="text-sm text-slate-300">Loading {selected?.name}…</p>
          </div>
        </div>
      )}

      {selected && (
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
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-slate-900/90 p-4 shadow-xl backdrop-blur">
            <div className="flex-1">
              <p className="font-bold text-amber-300">{stateInfo.name}</p>
              <p className="mt-0.5 text-sm text-slate-200">{stateInfo.fact}</p>
            </div>
            <button
              onClick={() => setStateInfo(null)}
              aria-label="Close"
              className="rounded px-2 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
