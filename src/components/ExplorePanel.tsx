import { flagUrl } from "../data/countries";
import type { Country } from "../data/types";

interface ExplorePanelProps {
  country: Country;
  /** number of state/province polygons currently drawn (0 = none available, null = loading). */
  stateCount: number | null;
  onClose: () => void;
}

function formatGdp(md: number | null): string {
  if (md == null) return "—";
  if (md >= 1_000_000) return `$${(md / 1_000_000).toFixed(2)}T`;
  if (md >= 1_000) return `$${(md / 1_000).toFixed(0)}B`;
  return `$${md}M`;
}

function formatPop(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

export default function ExplorePanel({ country, stateCount, onClose }: ExplorePanelProps) {
  const flag = flagUrl(country);
  return (
    /**
     * Mobile  (<sm): fixed bottom sheet — slides up from the bottom, full width,
     *   capped at 58% of viewport height, rounded top corners.
     * Desktop (sm+): absolute right-side panel — original behaviour.
     */
    <aside
      className={[
        // --- shared ---
        "flex flex-col overflow-y-auto",
        "border border-slate-700/60 bg-slate-900/92 shadow-xl backdrop-blur",
        // --- mobile: full-width bottom sheet ---
        "fixed bottom-0 inset-x-0 max-h-[58vh] rounded-t-2xl border-b-0 pb-safe",
        // --- desktop: right side panel ---
        "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:m-4 sm:w-72",
        "sm:max-h-[calc(100%-2rem)] sm:rounded-xl sm:border-b",
      ].join(" ")}
    >
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-2 sm:hidden">
        <div className="h-1 w-10 rounded-full bg-slate-600" />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            {flag && (
              <img
                src={flag}
                alt={`Flag of ${country.name}`}
                className="h-7 w-11 rounded border border-slate-600 object-cover"
              />
            )}
            <h2 className="text-base font-bold leading-tight sm:text-lg">{country.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 active:bg-slate-700"
          >
            ✕
          </button>
        </div>

        <dl className="mt-3 space-y-1.5 text-sm">
          {country.officialName !== country.name && (
            <Row label="Official" value={country.officialName} />
          )}
          <Row label="Capital" value={country.capital ?? "—"} />
          <Row label="Region" value={country.region || country.continent || "—"} />
          <Row label="Population" value={formatPop(country.population)} />
          <Row label="GDP" value={formatGdp(country.gdpMd)} />
          <Row
            label="GDP rank"
            value={country.gdpRank ? `#${country.gdpRank} worldwide` : "—"}
          />
          {country.incomeGroup && <Row label="Income" value={country.incomeGroup} />}
        </dl>

        {country.knownFor.length > 0 && (
          <div className="mt-3 border-t border-slate-700/60 pt-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Known for
            </p>
            <ul className="space-y-1 text-sm text-slate-200">
              {country.knownFor.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-400">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 border-t border-slate-700/60 pt-2 text-xs text-slate-400">
          {stateCount === null
            ? "Loading state borders…"
            : stateCount > 0
              ? "States/provinces outlined — tap to name, tap again for a fact."
              : "No state subdivisions available for this country."}
        </p>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-100">{value}</dd>
    </div>
  );
}
