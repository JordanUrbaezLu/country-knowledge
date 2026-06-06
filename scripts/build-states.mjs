/**
 * Pre-process Natural Earth 10m admin-1 (states/provinces) into small
 * per-country files so the app fetches only the clicked country's states.
 *
 * Input : ne_10m_admin_1_states_provinces.geojson (~39 MB, not committed)
 * Output: public/states/<ADM0_A3>.json  -> [{ n: stateName, g: <rounded GeoJSON geometry> }]
 *         public/states/index.json       -> ["USA","FRA",...] (codes that have data)
 *
 * Geometry is kept as GeoJSON Polygon/MultiPolygon (lng,lat) so the app can
 * render each state as a hoverable polygon. Coordinates are rounded to ~3 dp.
 *
 * Run: node scripts/build-states.mjs [path-to-source.geojson]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const srcPath = process.argv[2] ?? "/tmp/admin1_10m.geojson";
const outDir = new URL("../public/states/", import.meta.url);

if (!existsSync(srcPath)) {
  console.log(`Source not found at ${srcPath}; downloading...`);
  execSync(`curl -sSL -o ${srcPath} "${SRC_URL}"`, { stdio: "inherit" });
}

const round = (x) => Math.round(x * 1000) / 1000;

function roundRing(ring) {
  const out = [];
  let prev = null;
  for (const [lng, lat] of ring) {
    const p = [round(lng), round(lat)];
    if (!prev || p[0] !== prev[0] || p[1] !== prev[1]) out.push(p);
    prev = p;
  }
  return out;
}

/** Round + simplify a Polygon/MultiPolygon, dropping degenerate rings. */
function roundGeometry(geom) {
  if (geom.type === "Polygon") {
    const coords = geom.coordinates.map(roundRing).filter((r) => r.length >= 4);
    return coords.length ? { type: "Polygon", coordinates: coords } : null;
  }
  if (geom.type === "MultiPolygon") {
    const coords = geom.coordinates
      .map((poly) => poly.map(roundRing).filter((r) => r.length >= 4))
      .filter((poly) => poly.length);
    return coords.length ? { type: "MultiPolygon", coordinates: coords } : null;
  }
  return null;
}

const gj = JSON.parse(readFileSync(srcPath, "utf8"));
const byCountry = new Map();

for (const f of gj.features) {
  const code = f.properties.adm0_a3;
  if (!code || code === "-99") continue;
  const name = f.properties.name_en || f.properties.name || f.properties.gn_name || "";
  const type = f.properties.type_en || f.properties.type || "";
  const g = roundGeometry(f.geometry);
  if (!g) continue;
  if (!byCountry.has(code)) byCountry.set(code, []);
  byCountry.get(code).push({ n: name, t: type, g });
}

mkdirSync(outDir, { recursive: true });
let totalBytes = 0;
const codes = [...byCountry.keys()].sort();
for (const code of codes) {
  const json = JSON.stringify(byCountry.get(code));
  totalBytes += json.length;
  writeFileSync(new URL(`${code}.json`, outDir), json);
}
writeFileSync(new URL("index.json", outDir), JSON.stringify(codes));

console.log(
  `Wrote ${codes.length} country files (+index) to public/states/, ~${(totalBytes / 1048576).toFixed(1)} MB total`,
);
