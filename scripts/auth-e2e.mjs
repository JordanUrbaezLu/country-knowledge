// One-off Phase 2 verification: drive the real signup → persist → logout flow in
// an emulated iPhone against the built app + live Neon, then delete the test user.
import { spawn } from "node:child_process";
import { chromium, devices } from "playwright";
import pg from "pg";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* absent — fine */
  }
}

const PORT = 1994;
const BASE = `http://127.0.0.1:${PORT}`;
const username = "zz_e2e_" + Date.now();
const password = "secret123";

const log = (...a) => console.log("[auth-e2e]", ...a);
let server, browser;

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/me`);
      if (r.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server /api/me never returned 200 (DB not ready?)");
}

try {
  server = spawn("npx", ["tsx", "server/index.ts"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "inherit",
  });
  await waitReady();
  log("server ready, accounts live");

  browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  // Open the account modal from the chip.
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByPlaceholder("e.g. globe_master").fill(username);
  await page.getByPlaceholder("At least 6 characters").fill(password);
  // Guard against iOS focus-zoom: the input must be ≥16px so Safari doesn't zoom.
  const fontPx = await page
    .getByPlaceholder("At least 6 characters")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  if (fontPx < 16) throw new Error(`password input font ${fontPx}px < 16px → iOS will zoom`);
  log(`input font-size ${fontPx}px (no iOS zoom) ✓`);

  await page.getByRole("button", { name: "Create account" }).click();

  // Chip should now show the username.
  await page.getByRole("button", { name: new RegExp(username) }).waitFor({ timeout: 10000 });
  log("signup → chip shows username ✓");

  // Reload: session cookie must persist (the headline "log in once" requirement).
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(username) }).waitFor({ timeout: 10000 });
  log("reload → still logged in (cookie persists) ✓");

  // Phase 3: record a solo round (1 correct, 1 wrong) and confirm the profile
  // shows the derived stats. The globe interaction is hard to automate, so we
  // exercise the same /api/solo/result path the GameView completion effect calls.
  await page.evaluate(async () => {
    await fetch("/api/solo/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        gameId: "e2e-solo-1",
        difficulty: "easy",
        attempts: [
          { mode: "flag", countryId: "FRA", promptLabel: "France", givenAnswer: "France", correctAnswer: "France", isCorrect: true },
          { mode: "locate", countryId: "ESP", promptLabel: "Spain", givenAnswer: "Italy", correctAnswer: "Spain", isCorrect: false },
        ],
      }),
    });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(username) }).click();
  await page.getByText("Family multiplayer").waitFor({ timeout: 10000 });
  const profileText = await page.locator("body").innerText();
  if (!profileText.includes("50%")) throw new Error("profile missing avg accuracy (50%)");
  log("solo round recorded → profile shows 50% accuracy ✓");

  // Log out (profile panel is open, so the button is visible).
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: "Sign in" }).waitFor({ timeout: 10000 });
  log("logout → back to guest ✓");

  log("PASS");
} catch (e) {
  console.error("[auth-e2e] FAIL:", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
  // cleanup the test account
  try {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const { rows } = await pool.query("SELECT id FROM users WHERE username_lower=$1", [username.toLowerCase()]);
    if (rows[0]) {
      await pool.query("DELETE FROM attempts WHERE user_id=$1", [rows[0].id]);
      await pool.query("DELETE FROM mp_games WHERE user_id=$1", [rows[0].id]);
      await pool.query("DELETE FROM users WHERE id=$1", [rows[0].id]);
      log("cleanup: removed test user");
    }
    await pool.end();
  } catch (e) {
    console.error("[auth-e2e] cleanup error:", e);
  }
}
