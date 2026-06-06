/** Verify the loading spinner shows >= ~1s after a country click (globe already warm). */
import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });

// No deep link: let the globe fully initialise first so the main thread is free.
await page.goto("http://localhost:5173/", { waitUntil: "load" });
await page.waitForSelector("canvas");
await page.waitForTimeout(5000);

// Click the centre of the view (default pov ~20N,0E -> over Africa = a country).
const box = await page.locator("canvas").boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

const t0 = await page.evaluate(() => performance.now());
let firstSeen = null;
let lastSeen = null;
for (let i = 0; i < 50; i++) {
  const present = await page.evaluate(() => !!document.querySelector(".animate-spin"));
  if (present) {
    const now = await page.evaluate(() => performance.now());
    if (firstSeen === null) firstSeen = now - t0;
    lastSeen = now - t0;
  }
  await page.waitForTimeout(50);
}

console.log("spinner first seen ~", firstSeen?.toFixed(0) ?? "never", "ms after click");
console.log("spinner last seen  ~", lastSeen?.toFixed(0) ?? "never", "ms after click");
await browser.close();
