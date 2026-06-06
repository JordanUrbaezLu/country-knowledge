/** Minimal GeoJSON shapes we rely on (avoids a @types/geojson dependency). */
export interface GeoJsonGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

/** Subset of Natural Earth `ne_110m_admin_0_countries` feature properties we read. */
export interface NeCountryProperties {
  ADMIN?: string;
  NAME?: string;
  NAME_LONG?: string;
  ISO_A2?: string;
  ISO_A2_EH?: string;
  ISO_A3?: string;
  ISO_A3_EH?: string;
  CONTINENT?: string;
  REGION_UN?: string;
  GDP_MD?: number;
  POP_EST?: number;
  ECONOMY?: string;
  INCOME_GRP?: string;
  [key: string]: unknown;
}

export interface CountryFeature {
  type: "Feature";
  properties: NeCountryProperties;
  geometry: GeoJsonGeometry;
  /** stable country id, injected during normalization (mirrors Country.id). */
  __id: string;
}

/** A normalized, render-ready country. */
export interface Country {
  /** stable id: ISO alpha-3 (cca3) when available, else a slug of the NE name. */
  id: string;
  /** display name (common). */
  name: string;
  officialName: string;
  /** ISO 3166-1 alpha-2 (lowercased, for flag URLs); null for non-ISO territories. */
  iso2: string | null;
  iso3: string | null;
  capital: string | null;
  continent: string;
  region: string;
  /** representative point (from world-countries) for camera focus; null if unjoined. */
  lat: number | null;
  lng: number | null;
  /** GDP in millions USD (Natural Earth, ~2019); null if unknown. */
  gdpMd: number | null;
  /** estimated population (Natural Earth); null if unknown. */
  population: number | null;
  /** 1-based world rank by GDP (computed across the dataset); null if no GDP. */
  gdpRank: number | null;
  /** economy classification, e.g. "Developed region: G7" (prefix stripped). */
  economy: string | null;
  /** income group, e.g. "High income: OECD" (prefix stripped). */
  incomeGroup: string | null;
  /** 1-2 short "known for" bullets (curated where available, else factual). */
  knownFor: string[];
  /** true for sovereign countries usable in the quiz; false for territories / non-ISO areas. */
  quizzable: boolean;
  /** normalized strings accepted as a correct typed answer. */
  acceptedNames: string[];
  /** GeoJSON feature for the globe (carries __id back-reference). */
  feature: CountryFeature;
}
