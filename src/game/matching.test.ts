import { describe, expect, it } from "vitest";
import type { Country } from "../data/types";
import { normalize } from "../lib/text";
import { isCorrectName, matchAccuracy } from "./matching";

function country(...names: string[]): Country {
  return {
    id: "X",
    name: names[0],
    officialName: names[0],
    iso2: "xx",
    iso3: "XXX",
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
    feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] }, __id: "X" },
  };
}

describe("isCorrectName", () => {
  const usa = country("United States", "USA", "America");

  it("accepts exact + alias matches", () => {
    expect(isCorrectName("United States", usa)).toBe(true);
    expect(isCorrectName("usa", usa)).toBe(true);
    expect(isCorrectName("america", usa)).toBe(true);
  });

  it("ignores case, accents and punctuation", () => {
    const civ = country("Côte d'Ivoire", "Ivory Coast");
    expect(isCorrectName("cote divoire", civ)).toBe(true);
    expect(isCorrectName("IVORY COAST", civ)).toBe(true);
  });

  it("tolerates small typos on longer names", () => {
    const de = country("Germany");
    expect(isCorrectName("Germny", de)).toBe(true); // 1 edit
    expect(isCorrectName("Germanee", de)).toBe(true); // 2 edits
  });

  it("requires exact match for short names", () => {
    const chad = country("Chad");
    expect(isCorrectName("Chad", chad)).toBe(true);
    expect(isCorrectName("Chae", chad)).toBe(false);
  });

  it("rejects wrong answers and empty input", () => {
    expect(isCorrectName("France", usa)).toBe(false);
    expect(isCorrectName("   ", usa)).toBe(false);
  });
});

describe("matchAccuracy (partial credit)", () => {
  it("is 1 for exact and small typos (case-insensitive)", () => {
    const de = country("Germany");
    expect(matchAccuracy("germany", de)).toBe(1);
    expect(matchAccuracy("Germny", de)).toBe(1); // 1 edit
  });

  it("gives 0.5 for a near-miss on a longer name", () => {
    const de = country("Germany");
    expect(matchAccuracy("Germeni", de)).toBe(0.5); // 2 edits, len >= 6
  });

  it("gives 0 (no partial) for short-name lookalikes — a different country, not a typo", () => {
    expect(matchAccuracy("Iraq", country("Iran"))).toBe(0);
    expect(matchAccuracy("Chae", country("Chad"))).toBe(0);
  });

  it("is 0 for way-off guesses and empty input", () => {
    expect(matchAccuracy("Brazil", country("Germany"))).toBe(0);
    expect(matchAccuracy("   ", country("Germany"))).toBe(0);
  });
});
