import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeFeatures, type RawFeature } from "./countries";

function loadFixture(): RawFeature[] {
  // vitest runs with cwd = project root
  const path = resolve(process.cwd(), "public/ne_110m_admin_0_countries.geojson");
  return JSON.parse(readFileSync(path, "utf8")).features;
}

const countries = normalizeFeatures(loadFixture());
const byName = (n: string) => countries.find((c) => c.name === n);

describe("country normalization", () => {
  it("normalizes the full dataset", () => {
    expect(countries.length).toBeGreaterThan(170);
  });

  it("resolves ISO codes for the NE -99 cases via *_EH / cca2 fallback", () => {
    for (const name of ["France", "Norway", "Kosovo"]) {
      const c = byName(name);
      expect(c, name).toBeDefined();
      expect(c!.iso2, `${name} iso2`).toBeTruthy();
      expect(c!.quizzable, `${name} quizzable`).toBe(true);
    }
  });

  it("leaves no -99 iso codes among quizzable countries", () => {
    const bad = countries.filter(
      (c) => c.quizzable && (c.iso2 === "-99" || c.iso3 === "-99"),
    );
    expect(bad).toEqual([]);
  });

  it("marks non-ISO territories non-quizzable", () => {
    const nonQuiz = countries.filter((c) => !c.quizzable).map((c) => c.name);
    expect(nonQuiz).toContain("Northern Cyprus");
  });

  it("builds accepted answers incl. common aliases", () => {
    const us = byName("United States");
    expect(us, "United States present").toBeDefined();
    expect(us!.acceptedNames).toContain("usa");
    expect(us!.acceptedNames).toContain("united states");
    expect(us!.capital).toBe("Washington D.C.");
  });

  it("exposes lowercase flag iso2 and a latlng", () => {
    const jp = byName("Japan");
    expect(jp!.iso2).toBe("jp");
    expect(typeof jp!.lat).toBe("number");
  });
});
