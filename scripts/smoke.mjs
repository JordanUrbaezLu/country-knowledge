/**
 * Headless smoke test: load the app focused on a country (?country=USA),
 * verify WebGL + no console errors, screenshot, then hover the globe centre
 * and read the state-name tooltip.
 *
 * Usage: node scripts/smoke.mjs [country] [baseUrl]
 */
import { chromium } from "playwright";

const country = process.argv[2] ?? "USA";
const baseUrl = process.argv[3] ?? "http://localhost:5173";
const url = `${baseUrl}/?country=${country}`;

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
  ],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(url, { waitUntil: "load", timeout: 20000 });
await page.waitForSelector("canvas", { timeout: 15000 });
await page.waitForTimeout(450); // catch the loading spinner mid-flight
await page.screenshot({ path: `/tmp/ck-${country}-spinner.png` });
await page.waitForTimeout(4600); // render + states fetch + camera fly

const gl = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const ctx = c && (c.getContext("webgl2") || c.getContext("webgl"));
  return ctx ? "webgl-ok" : "no-webgl";
});

await page.screenshot({ path: `/tmp/ck-${country}.png` });

// Hover the globe centre (the focused country) and read globe.gl's tooltip.
const box = await page.locator("canvas").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
let tooltip = "";
for (const [dx, dy] of [[0, 0], [-60, -40], [60, 40], [-120, 30], [100, -60]]) {
  await page.mouse.move(cx + dx, cy + dy);
  await page.waitForTimeout(500);
  tooltip = await page.evaluate(() => {
    const el = document.querySelector(".scene-tooltip");
    return el ? el.textContent?.trim() ?? "" : "";
  });
  if (tooltip) break;
}
await page.screenshot({ path: `/tmp/ck-${country}-hover.png` });

// Click a state and capture the fact card.
await page.mouse.click(cx, cy);
await page.waitForTimeout(700);
await page.screenshot({ path: `/tmp/ck-${country}-click.png` });

console.log("URL:", url);
console.log("gl:", gl);
console.log("console errors:", errors.length ? errors.slice(0, 8) : "none");
console.log("hover tooltip:", JSON.stringify(tooltip));
console.log(
  "screenshots:",
  `/tmp/ck-${country}.png`,
  `/tmp/ck-${country}-hover.png`,
  `/tmp/ck-${country}-click.png`,
);

await browser.close();
