import { describe, expect, it } from "vitest";
import type { Country } from "../data/types";
import { difficultyPool, fameRanked, generateRound } from "./questions";

function stub(id: string, population: number | null, gdpMd: number | null): Country {
  return {
    id,
    name: id,
    officialName: id,
    iso2: id.slice(0, 2).toLowerCase(),
    iso3: id,
    capital: null,
    continent: "",
    region: "",
    lat: 0,
    lng: 0,
    gdpMd,
    population,
    gdpRank: null,
    economy: null,
    incomeGroup: null,
    knownFor: [],
    quizzable: true,
    acceptedNames: [id.toLowerCase()],
    feature: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] }, __id: id },
  };
}

// 130 countries with strictly decreasing fame (pop + gdp), plus an unquizzable one.
const COUNTRIES: Country[] = [
  ...Array.from({ length: 130 }, (_, i) => stub(`C${String(i).padStart(3, "0")}`, 130 - i, 130 - i)),
  { ...stub("NOPE", 999, 999), quizzable: false },
];

describe("fame-based difficulty pools", () => {
  it("ranks by fame (population+GDP blend), most prominent first", () => {
    const ranked = fameRanked(COUNTRIES);
    expect(ranked[0].id).toBe("C000"); // highest pop+gdp
    expect(ranked[ranked.length - 1].id).toBe("C129"); // lowest
    expect(ranked.some((c) => c.id === "NOPE")).toBe(false); // unquizzable excluded
  });

  it("sizes the pools easy<medium<hard and nests them", () => {
    const easy = difficultyPool(COUNTRIES, "easy");
    const medium = difficultyPool(COUNTRIES, "medium");
    const hard = difficultyPool(COUNTRIES, "hard");
    expect(easy.length).toBe(50);
    expect(medium.length).toBe(120);
    expect(hard.length).toBe(130);
    const mediumIds = new Set(medium.map((c) => c.id));
    expect(easy.every((c) => mediumIds.has(c.id))).toBe(true); // easy ⊆ medium
    // easy pool is exactly the 50 most-famous
    expect(easy.map((c) => c.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => `C${String(i).padStart(3, "0")}`),
    );
  });

  it("hard reaches obscure countries that easy never would", () => {
    const easy = new Set(difficultyPool(COUNTRIES, "easy").map((c) => c.id));
    const hard = new Set(difficultyPool(COUNTRIES, "hard").map((c) => c.id));
    expect(hard.has("C129")).toBe(true);
    expect(easy.has("C129")).toBe(false);
  });
});

describe("generateRound", () => {
  it("returns the requested count of distinct countries from the difficulty pool", () => {
    const round = generateRound(COUNTRIES, 10, "easy");
    expect(round).toHaveLength(10);
    const ids = round.map((q) => q.country.id);
    expect(new Set(ids).size).toBe(10); // distinct
    const easyIds = new Set(difficultyPool(COUNTRIES, "easy").map((c) => c.id));
    expect(ids.every((id) => easyIds.has(id))).toBe(true);
  });

  it("mixes all three modes", () => {
    const round = generateRound(COUNTRIES, 9, "hard");
    const modes = new Set(round.map((q) => q.mode));
    expect(modes).toEqual(new Set(["locate", "flag", "name"]));
  });
});
