/**
 * Screenshot tour of every key screen on mobile + desktop for visual review.
 *   node scripts/ui-tour.mjs [url]
 * Images land in /tmp/tour-*.png
 */
import { chromium, devices } from "playwright";

const url = process.argv[2] ?? "http://localhost:5180/";
const browser = await chromium.launch();

async function playUntil(page, predicate, { tapper } = {}) {
  for (let i = 0; i < 10; i++) {
    const prompt = await page.locator("p.text-center.text-xs.uppercase").textContent().catch(() => null);
    if (!prompt) return false;
    if (predicate(prompt)) return true;
    if (await page.locator("input").count()) {
      await page.locator("input").fill("x");
      await (tapper ? page.getByRole("button", { name: "Go" }).tap() : page.getByRole("button", { name: "Go" }).click());
    } else {
      // name question: answer via crosshair if present, else click centre
      const sel = page.getByRole("button", { name: "Select this country" });
      if (await sel.count()) await sel.tap();
      else await page.mouse.click(640, 300);
      await page.waitForTimeout(400);
      if (!(await page.getByRole("button", { name: "Next →" }).count())) return false;
    }
    await page.waitForTimeout(300);
    const next = page.getByRole("button", { name: "Next →" });
    if (await next.count()) {
      if (tapper) await next.tap();
      else await next.click();
    }
    await page.waitForTimeout(600);
  }
  return false;
}

/* ---------- mobile tour ---------- */
{
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "/tmp/tour-m1-explore.png" });

  // selected country with bottom sheet + states
  await page.goto(`${url}?country=BRA`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: "/tmp/tour-m2-selected.png" });

  // play: start card
  await page.getByRole("button", { name: "play" }).tap();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/tour-m3-start.png" });
  await page.getByRole("button", { name: "Start round" }).tap();
  await page.waitForTimeout(900);

  // capture one of each question type as encountered
  const seen = new Set();
  for (let i = 0; i < 10 && seen.size < 3; i++) {
    const prompt = await page.locator("p.text-center.text-xs.uppercase").textContent().catch(() => null);
    if (!prompt) break;
    const kind = prompt.includes("Find") ? "name" : prompt.includes("flag") ? "flag" : "locate";
    if (!seen.has(kind)) {
      seen.add(kind);
      await page.screenshot({ path: `/tmp/tour-m4-q-${kind}.png` });
    }
    if (await page.locator("input").count()) {
      await page.locator("input").fill("portugal");
      await page.getByRole("button", { name: "Go" }).tap();
    } else {
      const sel = page.getByRole("button", { name: "Select this country" });
      if (await sel.count()) await sel.tap();
      else {
        await page.touchscreen.tap(195, 212);
        await page.waitForTimeout(300);
      }
    }
    await page.waitForTimeout(400);
    if (!seen.has("feedback")) {
      seen.add("feedback"); // not counted in size<3 loop guard… capture once
      await page.screenshot({ path: "/tmp/tour-m5-feedback.png" });
    }
    const next = page.getByRole("button", { name: "Next →" });
    if (await next.count()) await next.tap();
    await page.waitForTimeout(700);
  }
  await ctx.close();
}

/* ---------- desktop tour ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);

  // hover tooltip over a country
  await page.mouse.move(640, 360);
  await page.waitForTimeout(700);
  await page.screenshot({ path: "/tmp/tour-d1-explore-hover.png" });

  // selected country: side panel + states
  await page.goto(`${url}?country=USA`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: "/tmp/tour-d2-selected.png" });

  // state fact: click a state polygon (US centre)
  await page.mouse.click(560, 380);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/tour-d3-statefact.png" });

  // play
  await page.getByRole("button", { name: "play" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/tour-d4-start.png" });
  await page.getByRole("button", { name: "Start round" }).click();
  await page.waitForTimeout(900);

  const gotFlag = await playUntil(page, (p) => p.includes("flag"));
  if (gotFlag) await page.screenshot({ path: "/tmp/tour-d5-q-flag.png" });

  // answer wrong to capture feedback
  if (await page.locator("input").count()) {
    await page.locator("input").fill("wrongland");
    await page.getByRole("button", { name: "Go" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "/tmp/tour-d6-feedback.png" });
  }
  await ctx.close();
}

await browser.close();
console.log("tour complete");
