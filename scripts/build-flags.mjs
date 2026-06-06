/**
 * Vendor country flag SVGs locally so they never depend on an external CDN.
 * Copies world-countries' flags (named by lowercase ISO alpha-3, e.g. usa.svg)
 * into public/flags/.
 *
 * Run: node scripts/build-flags.mjs
 */
import { readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("../node_modules/world-countries/data/", import.meta.url));
const outDir = fileURLToPath(new URL("../public/flags/", import.meta.url));

mkdirSync(outDir, { recursive: true });
const svgs = readdirSync(srcDir).filter((f) => f.endsWith(".svg"));
for (const f of svgs) {
  copyFileSync(`${srcDir}${f}`, `${outDir}${f}`);
}
console.log(`Copied ${svgs.length} flag SVGs to public/flags/`);
