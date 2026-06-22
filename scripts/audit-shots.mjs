/**
 * Full-UI audit: screenshots EVERY reachable screen/state at 375x700 (the
 * target mobile size) into /tmp/audit-*.png. Run with `npm run dev` up.
 *   node scripts/audit-shots.mjs [url] [prefix]
 */
import { chromium, devices } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/";
const prefix = process.argv[3] ?? "audit";
const browser = await chromium.launch();
const VP = { width: 375, height: 700 };
const phone = {
  ...devices["iPhone 14"],
  viewport: VP,
  screen: VP,
};
const shot = (page, name) => page.screenshot({ path: `/tmp/${prefix}-${name}.png` });
const log = (m) => console.log(m);

async function newPhone() {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  return { ctx, page };
}

/* ---------- A. loading splash (catch it early) ---------- */
try {
  const { ctx, page } = await newPhone();
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForTimeout(120);
  await shot(page, "00-loading-splash");
  log("captured loading splash");
  await ctx.close();
} catch (e) { log("loading splash FAIL " + e.message); }

/* ---------- B. explore ---------- */
{
  const { ctx, page } = await newPhone();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await shot(page, "01-explore-initial");

  // selected country (deep link) -> bottom sheet + states
  await page.goto(`${url}?country=BRA`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "02-explore-loading");          // 2s min spinner still up
  await page.waitForTimeout(3500);
  await shot(page, "03-explore-selected");

  // state fact card: tap globe centre (Brazil interior)
  await page.touchscreen.tap(187, 230);
  await page.waitForTimeout(900);
  await shot(page, "04-explore-statefact");
  await ctx.close();
  log("captured explore");
}

/* ---------- C. account screens (signed out) ---------- */
{
  const { ctx, page } = await newPhone();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const signin = page.getByRole("button", { name: "Sign in" });
  if (await signin.count()) {
    await signin.tap();
    await page.waitForTimeout(400);
    await shot(page, "05-account-signup");
    // login tab
    await page.getByRole("button", { name: "Log in", exact: true }).first().tap();
    await page.waitForTimeout(300);
    await shot(page, "06-account-login");
    // validation/error state: type short creds & submit on signup
    await page.getByRole("button", { name: "Sign up", exact: true }).first().tap();
    await page.waitForTimeout(200);
    await shot(page, "07-account-signup-empty");
  } else {
    log("no Sign in chip (accounts disabled?)");
  }
  await ctx.close();
  log("captured account");
}

/* ---------- D. profile (signed in) ---------- */
{
  const { ctx, page } = await newPhone();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const signin = page.getByRole("button", { name: "Sign in" });
  if (await signin.count()) {
    const uname = "zz_audit_" + Math.floor(Date.now() / 1000) % 100000;
    await signin.tap();
    await page.waitForTimeout(400);
    await page.locator('input[autocomplete="username"]').fill(uname);
    await page.locator('input[type="password"]').fill("audit-pass-123");
    await page.getByRole("button", { name: "Create account" }).tap();
    await page.waitForTimeout(1500);
    // reopen profile via chip
    const chip = page.locator("button", { hasText: uname }).first();
    if (await chip.count()) {
      await chip.tap();
      await page.waitForTimeout(600);
      await shot(page, "08-profile-empty");
      log("captured profile (user " + uname + ")");
    } else {
      await shot(page, "08-profile-FAILED-state");
      log("profile chip not found after signup");
    }
  }
  await ctx.close();
}

/* ---------- E. solo ---------- */
{
  const { ctx, page } = await newPhone();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Solo" }).tap();
  await page.waitForTimeout(500);
  await shot(page, "09-solo-start");
  await page.getByRole("button", { name: "Start round" }).tap();
  await page.waitForTimeout(900);

  const seen = new Set();
  let feedbackShot = false;
  for (let i = 0; i < 10; i++) {
    const prompt = await page.locator("p.text-center.text-xs.uppercase").first().textContent().catch(() => null);
    if (prompt) {
      const kind = prompt.includes("Find") ? "name" : prompt.toLowerCase().includes("flag") ? "flag" : "locate";
      if (!seen.has(kind)) { seen.add(kind); await shot(page, `10-solo-q-${kind}`); }
    }
    if (await page.locator("input").count()) {
      await page.locator("input").fill("wrongland");
      await page.getByRole("button", { name: "Go" }).tap();
      await page.waitForTimeout(500);
      if (!feedbackShot) { feedbackShot = true; await shot(page, "11-solo-feedback-wrong"); }
    } else {
      const sel = page.getByRole("button", { name: "Select this country" });
      if (await sel.count()) await sel.tap();
      else await page.touchscreen.tap(187, 230);
      await page.waitForTimeout(500);
    }
    const next = page.getByRole("button", { name: "Next →" });
    if (await next.count()) await next.tap();
    else break;
    await page.waitForTimeout(700);
  }
  // play one more partial round to capture a CORRECT feedback (answer w/ globe is hard;
  // instead screenshot results which we should have reached)
  const done = await page.getByText("Round complete").count();
  if (done) await shot(page, "12-solo-results");
  else log("solo did not reach results");
  await ctx.close();
  log("captured solo");
}

/* ---------- F. multiplayer (full 2-player drive) ---------- */
{
  // host
  const host = await newPhone();
  await host.page.goto(`${url}?nomp=0`, { waitUntil: "networkidle" });
  await host.page.waitForTimeout(2500);
  await host.page.getByRole("button", { name: "Online" }).tap();
  await host.page.waitForTimeout(600);
  await shot(host.page, "13-mp-home");

  // code-entry view
  await host.page.getByRole("button", { name: "I have a room code" }).tap();
  await host.page.waitForTimeout(300);
  await shot(host.page, "14-mp-codeentry");
  // inline login overlay
  const loginLink = host.page.getByRole("button", { name: /Have an account/ });
  await host.page.getByRole("button", { name: /Create a room instead/ }).tap().catch(() => {});
  await host.page.waitForTimeout(200);
  if (await loginLink.count()) {
    await loginLink.tap();
    await host.page.waitForTimeout(300);
    await shot(host.page, "15-mp-inline-login");
    await host.page.locator('button[aria-label="Close"]').first().tap().catch(() => {});
    await host.page.waitForTimeout(200);
  }

  // create a room -> lobby
  await host.page.locator("input").first().fill("Alice");
  await host.page.getByRole("button", { name: "Create a room" }).tap();
  await host.page.waitForTimeout(1500);
  await shot(host.page, "16-mp-lobby-host");
  const code = await host.page.locator('[data-testid="room-code"]').textContent().catch(() => null);
  log("room code = " + code);

  if (code) {
    // guest joins
    const guest = await newPhone();
    await guest.page.goto(`${url}?room=${code}`, { waitUntil: "networkidle" });
    await guest.page.waitForTimeout(2500);
    await guest.page.locator("input").first().fill("Bob");
    await guest.page.getByRole("button", { name: "Join room" }).tap();
    await guest.page.waitForTimeout(1500);
    await shot(host.page, "17-mp-lobby-2players");

    // host starts the game
    await host.page.getByRole("button", { name: /Start game/ }).tap();
    await host.page.waitForTimeout(1500);
    await shot(host.page, "18-mp-roundhud");
    await shot(guest.page, "18b-mp-roundhud-guest");

    // both answer wrong (typed) or wait for reveal
    for (const p of [host.page, guest.page]) {
      if (await p.locator("input").count()) {
        await p.locator("input").fill("x");
        await p.getByRole("button", { name: "Go" }).tap().catch(() => {});
      }
    }
    await host.page.waitForTimeout(1500);
    await shot(host.page, "19-mp-roundhud-locked");

    // drive to reveal: host skip
    const skip = host.page.getByRole("button", { name: /Skip/ });
    if (await skip.count()) await skip.tap();
    await host.page.waitForTimeout(2500);
    await shot(host.page, "20-mp-reveal");

    // advance through all rounds quickly to gameover
    for (let r = 0; r < 12; r++) {
      // answer phase
      const inp = host.page.locator("input");
      if (await inp.count()) { await inp.fill("x"); await host.page.getByRole("button", { name: "Go" }).tap().catch(() => {}); }
      const gInp = guest.page.locator("input");
      if (await gInp.count()) { await gInp.fill("x"); await guest.page.getByRole("button", { name: "Go" }).tap().catch(() => {}); }
      await host.page.waitForTimeout(800);
      const sk = host.page.getByRole("button", { name: /Skip/ });
      if (await sk.count()) await sk.tap();
      await host.page.waitForTimeout(1200);
      // reveal -> next
      const nextBtn = host.page.getByRole("button", { name: /Next round|final results/i });
      if (await nextBtn.count()) await nextBtn.tap();
      await host.page.waitForTimeout(1200);
      if (await host.page.getByText("Game over").count()) break;
    }
    if (await host.page.getByText("Game over").count()) {
      await shot(host.page, "21-mp-gameover");
      log("captured gameover");
    } else {
      await shot(host.page, "21-mp-gameover-FAILED");
      log("did not reach gameover");
    }
    await guest.ctx.close();
  }
  await host.ctx.close();
  log("captured multiplayer");
}

await browser.close();
log("AUDIT COMPLETE -> /tmp/" + prefix + "-*.png");
