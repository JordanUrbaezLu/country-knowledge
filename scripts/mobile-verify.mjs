/**
 * End-to-end verification of the touch/mobile UX (crosshair select, quiz
 * crosshair answers) plus a desktop sanity pass. Run with the dev server up:
 *
 *   node scripts/mobile-verify.mjs [url]
 *
 * Screenshots land in /tmp/ck-*.png. Exits non-zero on failure.
 */
import { chromium, devices } from "playwright";

const url = process.argv[2] ?? "http://localhost:5180/";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();

/* ---------- helpers ---------- */

// Synthetic touch drag on the globe canvas (Playwright's touchscreen has no
// drag primitive, and OrbitControls listens for raw touch events).
async function touchDrag(page, { dx = 0, dy = 0, steps = 8 } = {}) {
  await page.evaluate(
    async ({ dx, dy, steps }) => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const x0 = innerWidth / 2;
      const y0 = innerHeight / 2;
      const mk = (px, py) => ({
        bubbles: true,
        cancelable: true,
        touches: [new Touch({ identifier: 1, target: canvas, clientX: px, clientY: py })],
        changedTouches: [new Touch({ identifier: 1, target: canvas, clientX: px, clientY: py })],
      });
      canvas.dispatchEvent(new TouchEvent("touchstart", mk(x0, y0)));
      for (let s = 1; s <= steps; s++) {
        canvas.dispatchEvent(new TouchEvent("touchmove", mk(x0 + (dx * s) / steps, y0 + (dy * s) / steps)));
        await new Promise((r) => setTimeout(r, 25));
      }
      canvas.dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [] }),
      );
    },
    { dx, dy, steps },
  );
  await page.waitForTimeout(500); // let inertia settle + poll loop sample
}

const pillButton = (page) =>
  page.locator("div.pointer-events-none.absolute button.pointer-events-auto").first();

/* ---------- mobile: explore ---------- */
{
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "/tmp/ck-m1-initial.png" });

  // 1. Crosshair pill names the country under the reticle (France at boot POV).
  const pill = pillButton(page);
  const pillText = (await pill.count()) ? (await pill.textContent())?.trim() : null;
  check("explore: crosshair pill shows a country", !!pillText, `pill="${pillText}"`);

  // 2. Tapping the pill selects that country (panel opens with the same name).
  if (pillText) {
    const expected = pillText.replace(/\s*›$/, "");
    await pill.tap();
    await page.waitForTimeout(2600); // min spinner 2s + render
    const sheetName = await page.locator("aside h2").textContent().catch(() => null);
    check("explore: pill tap opens the country panel", sheetName === expected, `panel="${sheetName}" expected="${expected}"`);
    await page.screenshot({ path: "/tmp/ck-m2-selected.png" });
    // close the sheet to reset
    await page.locator('aside button[aria-label="Close"]').tap();
  }

  // 3. Deep-link a huge country (Russia): crosshair should land on one of its
  //    states; the pill goes amber and tapping it opens the state-fact card.
  await page.goto(`${url}?country=RUS`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500); // boot + focus tween + states fetch
  await page.screenshot({ path: "/tmp/ck-m3-russia.png" });
  let statePill = pillButton(page);
  let stateText = (await statePill.count()) ? (await statePill.textContent())?.trim() : null;
  let stateClass = (await statePill.count()) ? await statePill.getAttribute("class") : "";
  if (!stateText || !stateClass?.includes("text-amber-300")) {
    // nudge the globe so the reticle sits on Russian interior, then re-read
    await touchDrag(page, { dy: 60 });
    statePill = pillButton(page);
    stateText = (await statePill.count()) ? (await statePill.textContent())?.trim() : null;
    stateClass = (await statePill.count()) ? await statePill.getAttribute("class") : "";
  }
  const isStatePill = !!stateText && !!stateClass?.includes("text-amber-300");
  check("explore: crosshair detects a state of the selected country", isStatePill, `pill="${stateText}"`);
  if (isStatePill) {
    await statePill.tap();
    await page.waitForTimeout(600);
    const factTitle = await page.locator("p.font-bold.text-amber-300").first().textContent().catch(() => null);
    check(
      "explore: state pill tap opens the state fact card",
      factTitle === stateText.replace(/\s*›$/, ""),
      `card="${factTitle}"`,
    );
    await page.screenshot({ path: "/tmp/ck-m4-statefact.png" });
  }

  check("explore: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
}

/* ---------- mobile: play (quiz) ---------- */
{
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "play" }).tap();
  await page.getByRole("button", { name: "Start round" }).tap();
  await page.waitForTimeout(800);

  let sawNameQuestion = false;
  let nameAnswered = false;
  for (let qNum = 0; qNum < 10; qNum++) {
    const prompt = await page.locator("p.text-center.text-xs.uppercase").textContent().catch(() => null);
    if (!prompt) break;

    if (prompt.includes("Find this country")) {
      sawNameQuestion = true;
      const reticle = await page.locator("div.h-10.w-10").count();
      check("play: crosshair reticle shown for find-on-globe question", reticle > 0);
      // aim until the Select button appears: sweep the globe westward
      // continuously (reticle may start over open ocean)
      // Deterministic aiming: the trackpad-rotate wheel handler rotates the
      // camera by exact degrees (lat -= dy*0.22, lng += dx*0.22), so scan
      // longitude in ~7° steps across a few latitude bands and check the
      // pill after each step. Touch drags + OrbitControls inertia made the
      // rest points effectively random (flaky over oceans).
      const wheel = (dx, dy) =>
        page.evaluate(
          ({ dx, dy }) => {
            document
              .querySelector("canvas")
              ?.dispatchEvent(new WheelEvent("wheel", { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true }));
          },
          { dx, dy },
        );
      let select = page.getByRole("button", { name: "Select this country" });
      outer: for (const bandShift of [0, -180, 360]) {
        if (bandShift) await wheel(0, bandShift); // shift latitude band ±~40°
        for (let step = 0; step < 56; step++) {
          await wheel(32, 0); // ~7° east
          await page.waitForTimeout(140); // poll loop samples at ≤100ms
          select = page.getByRole("button", { name: "Select this country" });
          if (await select.count()) break outer;
        }
      }
      if (!(await select.count())) await page.screenshot({ path: `/tmp/ck-fail-q${qNum}.png` });
      if (await select.count()) {
        await page.screenshot({ path: "/tmp/ck-m5-quiz-crosshair.png" });
        await select.tap();
        await page.waitForTimeout(400);
        const feedback = await page
          .getByText(/Correct!|Not quite/)
          .first()
          .textContent()
          .catch(() => null);
        nameAnswered = feedback != null;
        check("play: Select button answers the question", nameAnswered, `feedback="${feedback}"`);
      } else {
        check("play: Select button appears when aimed at land", false, "never appeared after 12 drags");
        break;
      }
    } else {
      // typed question (locate / flag): answer junk to advance
      await page.locator("input").fill("x");
      await page.getByRole("button", { name: "Go" }).tap();
      await page.waitForTimeout(300);
    }
    const next = page.getByRole("button", { name: "Next →" });
    if (!(await next.count())) break;
    await next.tap();
    await page.waitForTimeout(700);
  }

  check("play: round included a find-on-globe question", sawNameQuestion);
  const done = await page.getByText("Round complete").count();
  check("play: round completes to results", done > 0);
  await page.screenshot({ path: "/tmp/ck-m6-results.png" });
  check("play: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
}

/* ---------- desktop sanity ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  check("desktop: no crosshair reticle", (await page.locator("div.h-10.w-10").count()) === 0);

  // click the globe centre (lands on Saharan Africa at boot POV) → panel opens
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2600);
  const panel = await page.locator("aside h2").count();
  check("desktop: clicking a country opens the panel", panel > 0);
  await page.screenshot({ path: "/tmp/ck-d1-desktop.png" });
  check("desktop: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
