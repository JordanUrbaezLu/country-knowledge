import { describe, expect, it } from "vitest";
import type { Country } from "../data/types";
import { normalize } from "../lib/text";
import { resolveGuessCountryId } from "./resolveGuess";

function country(id: string, ...names: string[]): Country {
  return {
    id,
    name: names[0],
    officialName: names[0],
    iso2: id.slice(0, 2).toLowerCase(),
    iso3: id,
    capital: null,
    continent: "",
    region: "",
    lat: 0,
    lng: 0,
    gdpMd: null,
    population: null,
    gdpRank: null,
    economy: null,
    incomeGroup: null,
    knownFor: [],
    quizzable: true,
    acceptedNames: names.map(normalize),
    feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] }, __id: id },
  };
}

const COUNTRIES = [
  country("FRA", "France"),
  country("JPN", "Japan"),
  country("USA", "United States", "USA", "America"),
  country("SVN", "Slovenia"),
  country("SVK", "Slovakia"),
];

describe("resolveGuessCountryId", () => {
  it("resolves an exact typed name to its country id", () => {
    expect(resolveGuessCountryId("France", COUNTRIES)).toBe("FRA");
    expect(resolveGuessCountryId("america", COUNTRIES)).toBe("USA");
  });

  it("tolerates a typo (so a near-miss still lights up the map)", () => {
    expect(resolveGuessCountryId("Sloveniaa", COUNTRIES)).toBe("SVN");
  });

  it("returns null for gibberish or empty input", () => {
    expect(resolveGuessCountryId("zzzzzzz", COUNTRIES)).toBeNull();
    expect(resolveGuessCountryId("   ", COUNTRIES)).toBeNull();
  });
});
