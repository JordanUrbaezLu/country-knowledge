import type { Country, GeoJsonGeometry } from "./types";

/** A state/province record as emitted by scripts/build-states.mjs. */
interface RawState {
  n: string;
  t?: string;
  g: GeoJsonGeometry;
}

/** A state rendered as a polygon in the globe's polygon layer. */
export interface StateFeature {
  type: "Feature";
  properties: { name: string };
  geometry: GeoJsonGeometry;
  __id: string;
  __kind: "state";
  __name: string;
  /** subdivision type, e.g. "State", "Province", "Region". */
  __type: string;
  /** ISO alpha-3 of the parent country. */
  __country: string;
}

const base = () => import.meta.env.BASE_URL;

let indexPromise: Promise<Set<string>> | null = null;
const fileCache = new Map<string, Promise<StateFeature[]>>();

/** Set of ISO alpha-3 codes that have a generated states file (fetched once). */
export function loadStateIndex(): Promise<Set<string>> {
  if (!indexPromise) {
    indexPromise = fetch(`${base()}states/index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.resolve([])))
      .then((codes) => new Set(codes))
      .catch(() => new Set<string>());
  }
  return indexPromise;
}

async function fetchStates(iso3: string): Promise<StateFeature[]> {
  const res = await fetch(`${base()}states/${iso3}.json`);
  if (!res.ok) return [];
  const raw = (await res.json()) as RawState[];
  return raw.map((s, i) => ({
    type: "Feature" as const,
    properties: { name: s.n },
    geometry: s.g,
    __id: `${iso3}#${i}`,
    __kind: "state" as const,
    __name: s.n,
    __type: s.t || "Region",
    __country: iso3,
  }));
}

/**
 * State/province polygon features for a country, or null if it has no
 * subdivisions available. Cached per country.
 */
export async function loadStateFeatures(country: Country): Promise<StateFeature[] | null> {
  const iso3 = country.iso3?.toUpperCase();
  if (!iso3) return null;
  const index = await loadStateIndex();
  if (!index.has(iso3)) return null;
  let p = fileCache.get(iso3);
  if (!p) {
    p = fetchStates(iso3);
    fileCache.set(iso3, p);
  }
  return p;
}
