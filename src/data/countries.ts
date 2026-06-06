import worldCountries from "world-countries";
import type { Country as WcCountry } from "world-countries";
import { normalize } from "../lib/text";
import { buildAcceptedNames } from "./aliases";
import { ISO_OVERRIDES } from "./isoOverrides";
import { KNOWN_FOR } from "./knownFor";
import type { Country, CountryFeature, GeoJsonGeometry, NeCountryProperties } from "./types";

export interface RawFeature {
  type: "Feature";
  properties: NeCountryProperties;
  geometry: GeoJsonGeometry;
}

const byCca3 = new Map<string, WcCountry>(worldCountries.map((c) => [c.cca3, c]));
const byCca2 = new Map<string, WcCountry>(worldCountries.map((c) => [c.cca2, c]));

/** Return the first value that isn't empty or Natural Earth's "-99" sentinel. */
function pickIso(...vals: (string | undefined)[]): string | null {
  for (const v of vals) {
    if (v && v !== "-99") return v;
  }
  return null;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Strip Natural Earth's "1. " ordinal prefix from ECONOMY / INCOME_GRP labels. */
function stripPrefix(s: string | undefined): string | null {
  return s ? s.replace(/^\d+\.\s*/, "") : null;
}

/** Factual highlights for countries without a curated KNOWN_FOR entry. */
function factualKnownFor(
  wc: WcCountry | undefined,
  region: string,
  economy: string | null,
): string[] {
  const out: string[] = [];
  const sub = wc?.subregion || region;
  const currency = wc ? Object.values(wc.currencies)[0]?.name : null;
  const language = wc ? Object.values(wc.languages)[0] : null;
  if (sub) out.push(`${sub}${currency ? ` · uses the ${currency}` : ""}`);
  if (language) out.push(`${language}-speaking${economy ? ` · ${economy}` : ""}`);
  else if (economy) out.push(economy);
  return out.length ? out : ["Discover its flag, capital, and place on the globe."];
}

function normalizeFeature(feat: RawFeature): Country | null {
  const p = feat.properties;
  const admin = p.ADMIN ?? p.NAME ?? "Unknown";

  const override = ISO_OVERRIDES[admin];
  let iso3 = override?.iso3 ?? pickIso(p.ISO_A3_EH, p.ISO_A3);
  let iso2 = override?.iso2 ?? pickIso(p.ISO_A2_EH, p.ISO_A2);

  // Join to world-countries: prefer the alpha-3 code, fall back to alpha-2
  // (this is what resolves Kosovo, whose ISO_A3_EH is still "-99").
  let wc = iso3 ? byCca3.get(iso3) : undefined;
  if (!wc && iso2) wc = byCca2.get(iso2);
  if (wc) {
    iso3 = wc.cca3;
    iso2 = wc.cca2;
  }

  const id = wc?.cca3 ?? iso3 ?? slug(admin);
  const name = wc?.name.common ?? admin;
  const officialName = wc?.name.official ?? p.NAME_LONG ?? name;
  const capital = wc?.capital?.[0] ?? null;
  const continent = p.CONTINENT ?? wc?.region ?? "";
  const region = p.REGION_UN ?? wc?.subregion ?? wc?.region ?? "";
  const lat = wc?.latlng?.[0] ?? null;
  const lng = wc?.latlng?.[1] ?? null;
  const gdpMd = typeof p.GDP_MD === "number" && p.GDP_MD > 0 ? p.GDP_MD : null;
  const population = typeof p.POP_EST === "number" && p.POP_EST > 0 ? p.POP_EST : null;
  const economy = stripPrefix(p.ECONOMY);
  const incomeGroup = stripPrefix(p.INCOME_GRP);
  const knownFor = (iso3 && KNOWN_FOR[iso3]) || factualKnownFor(wc, region, economy);

  const quizzable =
    Boolean(wc) && iso2 != null && wc!.independent !== false && admin !== "Antarctica";

  const acceptedNames = wc ? buildAcceptedNames(wc) : [normalize(name)];

  const feature: CountryFeature = {
    type: "Feature",
    properties: p,
    geometry: feat.geometry,
    __id: id,
  };

  return {
    id,
    name,
    officialName,
    iso2: iso2 ? iso2.toLowerCase() : null,
    iso3: iso3 ?? null,
    capital,
    continent,
    region,
    lat,
    lng,
    gdpMd,
    population,
    gdpRank: null, // assigned in normalizeFeatures once the full set is known
    economy,
    incomeGroup,
    knownFor,
    quizzable,
    acceptedNames,
    feature,
  };
}

/** Pure normalization of raw GeoJSON features into a sorted Country[] (unit-testable). */
export function normalizeFeatures(features: RawFeature[]): Country[] {
  const countries: Country[] = [];
  for (const feat of features) {
    const c = normalizeFeature(feat);
    if (c) countries.push(c);
  }
  // Assign 1-based world GDP rank across all countries that report a GDP.
  countries
    .filter((c) => c.gdpMd != null)
    .sort((a, b) => b.gdpMd! - a.gdpMd!)
    .forEach((c, i) => {
      c.gdpRank = i + 1;
    });
  countries.sort((a, b) => a.name.localeCompare(b.name));
  return countries;
}

/** Fetch + normalize the vendored Natural Earth dataset into clean Country[]. */
export async function loadCountries(): Promise<Country[]> {
  const url = `${import.meta.env.BASE_URL}ne_110m_admin_0_countries.geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load country data (HTTP ${res.status})`);
  }
  const gj = (await res.json()) as { features: RawFeature[] };
  return normalizeFeatures(gj.features);
}

/** Index a country list by stable id for quick lookups from globe interactions. */
export function indexById(countries: Country[]): Map<string, Country> {
  return new Map(countries.map((c) => [c.id, c]));
}

/** Local flag SVG URL (vendored from world-countries), or null for non-ISO territories. */
export function flagUrl(country: Country): string | null {
  return country.iso3
    ? `${import.meta.env.BASE_URL}flags/${country.iso3.toLowerCase()}.svg`
    : null;
}
