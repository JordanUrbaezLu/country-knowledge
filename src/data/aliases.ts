import type { Country as WcCountry } from "world-countries";
import { normalize } from "../lib/text";

/**
 * Extra accepted answers (common short forms / historic names), keyed by
 * ISO alpha-3 (cca3). These supplement each country's common name, official
 * name, and altSpellings from world-countries.
 */
export const ALIASES: Record<string, string[]> = {
  USA: ["usa", "us", "america", "united states", "the states"],
  GBR: ["uk", "britain", "great britain", "england"],
  RUS: ["russia"],
  KOR: ["south korea", "korea"],
  PRK: ["north korea"],
  CZE: ["czech republic"],
  COD: ["drc", "dr congo", "congo kinshasa", "democratic republic of congo"],
  COG: ["congo", "congo brazzaville", "republic of congo"],
  ARE: ["uae"],
  MMR: ["burma"],
  NLD: ["holland", "the netherlands"],
  SWZ: ["swaziland"],
  CPV: ["cape verde"],
  CIV: ["ivory coast"],
  TLS: ["east timor"],
  TUR: ["turkey"],
  MKD: ["macedonia"],
  VAT: ["vatican", "vatican city", "holy see"],
  BOL: ["bolivia"],
  VEN: ["venezuela"],
  TZA: ["tanzania"],
  SYR: ["syria"],
  LAO: ["laos"],
  BRN: ["brunei"],
  MDA: ["moldova"],
  FSM: ["micronesia"],
  PSE: ["palestine"],
};

/**
 * Build the deduped, normalized list of accepted typed answers for a country.
 */
export function buildAcceptedNames(wc: WcCountry): string[] {
  const raw = [
    wc.name.common,
    wc.name.official,
    ...wc.altSpellings,
    ...(ALIASES[wc.cca3] ?? []),
  ];
  const seen = new Set<string>();
  for (const value of raw) {
    const key = normalize(value);
    // skip bare 2-letter codes that aren't meaningful as typed answers
    if (key.length < 2) continue;
    seen.add(key);
  }
  return [...seen];
}
