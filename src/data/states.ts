import type { Country, GeoJsonGeometry } from "./types";
import { isTouchDevice } from "../lib/device";

/**
 * Border detail. Big countries (Russia, Canada) ship thousands of coordinate
 * points; rendering them as extruded polygons AND running the crosshair's
 * point-in-polygon test over them used to crater phones. We thin each ring to a
 * minimum point spacing — much coarser on touch — which slashes both the GPU
 * geometry and the hit-test cost while staying perfectly legible at globe zoom.
 */
const SIMPLIFY_EPS = isTouchDevice ? 0.25 : 0.05; // degrees (~28km vs ~5.5km)

function simplifyRing(ring: number[][], eps: number): number[][] {
  if (ring.length <= 6) return ring;
  const out: number[][] = [ring[0]];
  let lx = ring[0][0];
  let ly = ring[0][1];
  for (let i = 1; i < ring.length - 1; i++) {
    const x = ring[i][0];
    const y = ring[i][1];
    if (Math.abs(x - lx) >= eps || Math.abs(y - ly) >= eps) {
      out.push(ring[i]);
      lx = x;
      ly = y;
    }
  }
  out.push(ring[ring.length - 1]); // keep the closing point
  return out.length >= 4 ? out : ring; // never degenerate a ring below 4 points
}

function simplifyGeometry(g: GeoJsonGeometry, eps: number): GeoJsonGeometry {
  if (eps <= 0) return g;
  if (g.type === "Polygon") {
    return { type: "Polygon", coordinates: (g.coordinates as number[][][]).map((r) => simplifyRing(r, eps)) };
  }
  return {
    type: "MultiPolygon",
    coordinates: (g.coordinates as number[][][][]).map((poly) => poly.map((r) => simplifyRing(r, eps))),
  };
}

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
    geometry: simplifyGeometry(s.g, SIMPLIFY_EPS),
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
