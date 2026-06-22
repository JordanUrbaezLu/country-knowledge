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
        "glass-card flex flex-col overflow-y-auto",
        // --- mobile: compact bottom sheet (max ~40% of screen height) ---
        "anim-slide-up fixed bottom-0 inset-x-0 max-h-[42vh] rounded-t-3xl border-b-0 pb-safe",
        // --- desktop: right side panel ---
        "sm:anim-fade-up sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:m-4 sm:w-72",
        "sm:max-h-[calc(100%-2rem)] sm:rounded-2xl",
      ].join(" ")}
    >
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-2.5 sm:hidden">
        <div className="h-1 w-10 rounded-full bg-white/25" />
      </div>

      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {flag && (
              <img
                src={flag}
                alt={`Flag of ${country.name}`}
                className="h-6 w-9 rounded border border-white/15 object-cover shadow-md shadow-black/40 sm:h-7 sm:w-11"
              />
            )}
            <h2 className="text-sm font-bold leading-tight sm:text-base">{country.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Two-column grid on mobile for compact layout; single rows on desktop */}
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:mt-3 sm:block sm:space-y-1.5 sm:text-sm">
          {country.officialName !== country.name && (
            <Row label="Official" value={country.officialName} span />
          )}
          <Row label="Capital" value={country.capital ?? "—"} />
          <Row label="Region" value={country.region || country.continent || "—"} />
          <Row label="Population" value={formatPop(country.population)} />
          <Row label="GDP" value={formatGdp(country.gdpMd)} />
          <Row label="GDP rank" value={country.gdpRank ? `#${country.gdpRank}` : "—"} />
          {country.incomeGroup && <Row label="Income" value={country.incomeGroup} span />}
        </dl>

        {country.knownFor.length > 0 && (
          <div className="mt-2 border-t border-white/10 pt-2">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Known for
            </p>
            <ul className="space-y-0.5 text-xs text-slate-200 sm:text-sm">
              {country.knownFor.map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-amber-400">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-2 border-t border-white/10 pt-1.5 text-xs text-slate-400">
          {stateCount === null
            ? "Loading state borders…"
            : stateCount > 0
              ? "Borders shown — tap a state for a fact."
              : "No state data available."}
        </p>
      </div>
    </aside>
  );
}

function Row({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${span ? "col-span-2" : ""}`}>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-100">{value}</dd>
    </div>
  );
}
