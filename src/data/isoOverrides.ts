/**
 * Manual ISO fixes, keyed by the Natural Earth `ADMIN` name.
 *
 * Natural Earth marks some countries' ISO_A2/ISO_A3 as "-99" for
 * disputed/point-of-view reasons. Our loader first falls back to the
 * `*_EH` ("with hint") fields and then to an alpha-2 -> world-countries
 * join, which already resolves France, Norway and Kosovo. This map is a
 * safety net / explicit override for anything those fallbacks miss.
 *
 * Northern Cyprus and Somaliland are intentionally absent: they have no
 * ISO 3166 code and no world-countries entry, so they render on the globe
 * but are marked non-quizzable.
 */
export const ISO_OVERRIDES: Record<string, { iso2: string; iso3: string }> = {
  France: { iso2: "FR", iso3: "FRA" },
  Norway: { iso2: "NO", iso3: "NOR" },
  Kosovo: { iso2: "XK", iso3: "UNK" },
};
