/**
 * Prints the Easy / Medium / Hard country tiers, reproducing the app's fame
 * ranking (src/game/questions.ts: 50/50 population + GDP blend, top 50 / 120 /
 * all) against the same dataset the app uses. The tiers are nested subsets:
 * Easy ⊂ Medium ⊂ Hard.
 *
 * Usage: node scripts/list-difficulty.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const world = require("world-countries");
const geo = JSON.parse(readFileSync("public/ne_110m_admin_0_countries.geojson", "utf8"));

const byCca3 = new Map(world.map((c) => [c.cca3, c]));
const byCca2 = new Map(world.map((c) => [c.cca2, c]));
const pickIso = (eh, a) => {
  for (const v of [eh, a]) if (v && v !== "-99") return v.toUpperCase();
  return null;
};

const rows = [];
for (const f of geo.features) {
  const p = f.properties;
  const admin = p.ADMIN ?? p.NAME ?? "Unknown";
  let iso2 = pickIso(p.ISO_A2_EH, p.ISO_A2);
  const iso3 = pickIso(p.ISO_A3_EH, p.ISO_A3);
  let w = iso3 ? byCca3.get(iso3) : null;
  if (!w && iso2) w = byCca2.get(iso2);
  if (w) iso2 = w.cca2;
  const quizzable = Boolean(w) && iso2 != null && w.independent !== false && admin !== "Antarctica";
  if (!quizzable) continue;
  rows.push({
    name: w?.name?.common ?? admin,
    pop: typeof p.POP_EST === "number" && p.POP_EST > 0 ? p.POP_EST : 0,
    gdp: typeof p.GDP_MD === "number" && p.GDP_MD > 0 ? p.GDP_MD : 0,
  });
}

const maxPop = Math.max(1, ...rows.map((r) => r.pop));
const maxGdp = Math.max(1, ...rows.map((r) => r.gdp));
const fame = (r) => 0.5 * (r.pop / maxPop) + 0.5 * (r.gdp / maxGdp);
rows.sort((a, b) => fame(b) - fame(a));
const names = rows.map((r) => r.name);

console.log(`TOTAL quizzable countries: ${names.length}\n`);
console.log(`EASY — top 50 (most famous):\n${names.slice(0, 50).join(", ")}\n`);
console.log(`MEDIUM — adds #51–120:\n${names.slice(50, 120).join(", ")}\n`);
console.log(`HARD — adds the rest (#121+):\n${names.slice(120).join(", ")}`);
