import { chromium, devices } from "playwright";
const VP = { width: 375, height: 700 };
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 14"], viewport: VP, screen: VP });
const page = await ctx.newPage();

async function touchDrag(page, { dx = 0, dy = 0, steps = 10, x0 = 187, y0 = 350 } = {}) {
  await page.evaluate(async ({ dx, dy, steps, x0, y0 }) => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const mk = (px, py) => ({ bubbles: true, cancelable: true,
      touches: [new Touch({ identifier: 1, target: canvas, clientX: px, clientY: py })],
      changedTouches: [new Touch({ identifier: 1, target: canvas, clientX: px, clientY: py })] });
    canvas.dispatchEvent(new TouchEvent("touchstart", mk(x0, y0)));
    for (let s = 1; s <= steps; s++) {
      canvas.dispatchEvent(new TouchEvent("touchmove", mk(x0 + (dx * s) / steps, y0 + (dy * s) / steps)));
      await new Promise((r) => setTimeout(r, 16));
    }
    canvas.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [] }));
  }, { dx, dy, steps, x0, y0 });
  await page.waitForTimeout(400);
}

// read the globe's current point-of-view lat via the React globe instance is hard;
// instead infer from the crosshair target country name after rotating.
async function reportPov(page) {
  return await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return c ? { w: c.clientWidth, h: c.clientHeight } : null;
  });
}

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(3500);
await page.screenshot({ path: "/tmp/rot-0-initial.png" });

// Drag UP hard several times to rotate the globe to reveal the far south.
for (let i = 0; i < 6; i++) await touchDrag(page, { dy: -260, steps: 12 });
await page.screenshot({ path: "/tmp/rot-1-dragged-south-default-zoom.png" });
console.log("after south drag:", JSON.stringify(await reportPov(page)));

// crosshair country under reticle now?
const pill = page.locator("div.pointer-events-none.absolute button.pointer-events-auto").first();
const pillText = (await pill.count()) ? (await pill.textContent())?.trim() : "(none)";
console.log("crosshair pill at south-most default-zoom:", pillText);

await b.close();
console.log("done");
