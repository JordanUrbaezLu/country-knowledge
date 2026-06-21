/**
 * End-to-end multiplayer test against the LIVE game server + Vite dev server.
 * Spins up both, drives two browser players through a full game, and verifies:
 *   - create room + join via share link, lobby shows both players
 *   - start, answer (typed rounds answered correctly via a dev target hook),
 *     reveal shows everyone's pick + points + leaderboard for both clients
 *   - the host "Skip" advances find-on-globe rounds
 *   - a mid-game RELOAD rejoins the same player and KEEPS their score
 *   - game reaches a podium/leaderboard at game over
 *
 * Usage: node scripts/mp-e2e.mjs
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { chromium } from "playwright";

const VITE_PORT = 5174;
const WS_PORT = 1999;
const BASE = `http://localhost:${VITE_PORT}`;
const children = [];
let failed = false;

function log(...a) {
  console.log("[e2e]", ...a);
}
function assert(cond, msg) {
  if (!cond) {
    failed = true;
    throw new Error("ASSERT FAILED: " + msg);
  }
  log("✓", msg);
}

function tryConnect(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function waitPort(port, timeoutMs = 90000) {
  const start = Date.now();
  // vite binds localhost (often IPv6 ::1); the game server binds 0.0.0.0 — try both
  for (;;) {
    if ((await tryConnect(port, "127.0.0.1")) || (await tryConnect(port, "::1"))) return;
    if (Date.now() - start > timeoutMs) throw new Error(`port ${port} not up`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

function spawnProc(cmd, args, name, env = {}) {
  const p = spawn(cmd, args, { stdio: "pipe", env: { ...process.env, ...env } });
  children.push(p);
  p.stdout.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  p.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}!] ${d}`));
  return p;
}

const GL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
];

async function getPhase(page) {
  return page.evaluate(() => {
    const has = (re) =>
      Array.from(document.querySelectorAll("body *")).some((el) =>
        re.test(el.textContent || ""),
      );
    if (document.body.innerText.includes("Game over")) return "gameover";
    if (/It was/.test(document.body.innerText)) return "reveal";
    if (/Round\s+\d+\//.test(document.body.innerText)) return "question";
    if (document.body.innerText.includes("Game lobby")) return "lobby";
    void has;
    return "other";
  });
}

async function waitPhase(page, target, timeoutMs = 15000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const p = await getPhase(page);
    if (p === target) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitPhase ${target} timed out (was ${p})`);
    await page.waitForTimeout(150);
  }
}

async function waitNotPhase(page, phase, timeoutMs = 15000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const p = await getPhase(page);
    if (p !== phase) return p;
    if (Date.now() - start > timeoutMs) throw new Error(`still in ${phase} after ${timeoutMs}ms`);
    await page.waitForTimeout(150);
  }
}

async function detectMode(page) {
  // NB: the prompt label is CSS text-transform:uppercase, so innerText is upper —
  // compare lowercased.
  const t = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  if (t.includes("whose flag is this?")) return "flag";
  if (t.includes("name the highlighted country")) return "locate";
  if (t.includes("find this country on the globe")) return "name";
  return "unknown";
}

async function typedAnswer(page) {
  const target = await page.evaluate(() => window.__ckTarget);
  const input = page.locator('input[placeholder="Type the country name…"]');
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(target || "France");
  await page.getByRole("button", { name: "Go" }).click();
}

async function typedWrong(page) {
  const target = await page.evaluate(() => window.__ckTarget);
  const guess = (target || "").toLowerCase() === "brazil" ? "Canada" : "Brazil";
  const input = page.locator('input[placeholder="Type the country name…"]');
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill(guess);
  await page.getByRole("button", { name: "Go" }).click();
}

async function scoreOf(page, name) {
  return page.evaluate((n) => {
    const el = document.querySelector(`[data-testid="lb-entry"][data-name="${n}"]`);
    return el ? Number(el.getAttribute("data-score")) : null;
  }, name);
}

async function main() {
  log("starting ws server + vite…");
  spawnProc("npx", ["tsx", "server/index.ts"], "ws", { PORT: String(WS_PORT) });
  spawnProc("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], "vite", {
    VITE_WS_HOST: `127.0.0.1:${WS_PORT}`,
  });
  await waitPort(WS_PORT);
  await waitPort(VITE_PORT);
  log("both servers up");

  const browser = await chromium.launch({ args: GL_ARGS });
  const hostCtx = await browser.newContext({ viewport: { width: 1000, height: 820 } });
  const playerCtx = await browser.newContext({ viewport: { width: 1000, height: 820 } });
  const host = await hostCtx.newPage();
  let player = await playerCtx.newPage();

  for (const pg of [host, player]) {
    pg.on("pageerror", (e) => {
      console.error("PAGEERROR:", e.message);
      failed = true;
    });
  }

  // --- Host creates a room ---
  await host.goto(BASE, { waitUntil: "load" });
  await host.getByRole("button", { name: "Online" }).click();
  await host.getByPlaceholder("e.g. John").fill("Ann");
  await host.getByRole("button", { name: "Create a room" }).click();
  await waitPhase(host, "lobby");
  const code = (await host.getByTestId("room-code").textContent())?.trim();
  assert(!!code && code.length === 4, `host created room with 4-char code (${code})`);

  // --- Player joins via the share link ---
  await player.goto(`${BASE}/?room=${code}`, { waitUntil: "load" });
  await player.getByPlaceholder("e.g. John").fill("Bob");
  await player.getByRole("button", { name: "Join room" }).click();
  await waitPhase(player, "lobby");
  log("player joined");

  // host sees 2 players
  await host.waitForFunction(
    () => document.querySelectorAll('[data-testid], .truncate').length >= 0,
    { timeout: 3000 },
  );
  const hostLobbyText = await host.evaluate(() => document.body.innerText);
  assert(hostLobbyText.includes("Ann") && hostLobbyText.includes("Bob"), "lobby shows both players");

  // --- Host picks Easy + starts ---
  await host.getByRole("button", { name: "Easy" }).click();
  await host.getByRole("button", { name: "Start game →" }).click();
  await waitPhase(host, "question");
  await waitPhase(player, "question");
  log("game started");

  // --- Drive rounds ---
  let reconnected = false;
  let scoreBeforeReload = 0;
  let revealShots = 0;
  let wrongDone = false;
  let wrongRevealPending = false;
  for (let i = 0; i < 30; i++) {
    const phase = await getPhase(host);
    if (phase === "gameover") break;

    if (phase === "question") {
      const mode = await detectMode(host);
      if (mode === "flag" || mode === "locate") {
        await typedAnswer(host);
        // player may have been reloaded; guard its input existence
        if ((await getPhase(player)) === "question") {
          try {
            // answer wrong exactly once, to show a guess lit in the player's color
            if (!wrongDone) {
              await typedWrong(player);
              wrongDone = true;
              wrongRevealPending = true;
            } else {
              await typedAnswer(player);
            }
          } catch {
            /* player mid-reconnect */
          }
        }
        await waitPhase(host, "reveal");
      } else {
        // find-on-globe: host skips to keep the test deterministic
        await host.getByRole("button", { name: "Skip →" }).click();
        await waitPhase(host, "reveal");
      }
      continue;
    }

    if (phase === "reveal") {
      // both clients show this round's picks + a leaderboard
      const hostReveal = (await host.evaluate(() => document.body.innerText)).toLowerCase();
      assert(hostReveal.includes("leaderboard"), `round ${i}: host reveal has a leaderboard`);
      assert(hostReveal.includes("it was"), `round ${i}: host reveal names the answer`);
      // player may be a frame behind on propagation — wait for it
      if ((await getPhase(player)) !== "gameover") {
        await waitPhase(player, "reveal", 6000);
        assert(true, `round ${i}: player also sees the reveal`);
      }

      // capture the first few reveals to eyeball the light-up map
      if (revealShots < 4) {
        revealShots++;
        await host.screenshot({ path: `/tmp/ck-mp-reveal-${revealShots}.png` });
      }
      if (wrongRevealPending) {
        wrongRevealPending = false;
        await host.waitForTimeout(400);
        await host.screenshot({ path: "/tmp/ck-mp-reveal-wrong.png" });
      }

      // one-time mid-game reconnect: reload the player, rejoin, keep score
      if (!reconnected) {
        scoreBeforeReload = (await scoreOf(host, "Bob")) ?? 0;
        log(`reconnect test: Bob score before reload = ${scoreBeforeReload}`);
        await player.reload({ waitUntil: "load" });
        await player.getByPlaceholder("e.g. John").fill("Bob");
        // we arrived via ?room so the Join button is present
        await player.getByRole("button", { name: "Join room" }).click();
        await player.waitForTimeout(1200); // settle reconnect + catch-up
        reconnected = true;
        log("player reloaded + rejoined");
      }

      // host advances (server also auto-advances after REVEAL_MS, so the button
      // may vanish underneath us — that's fine)
      if ((await getPhase(host)) === "reveal") {
        await host
          .getByRole("button", { name: /Next round →|See final results →/ })
          .click()
          .catch(() => {});
      }
      await waitNotPhase(host, "reveal");
      continue;
    }

    await host.waitForTimeout(300);
  }

  // --- Game over ---
  await waitPhase(host, "gameover");
  const go = await host.evaluate(() => document.body.innerText);
  assert(go.includes("Ann") && go.includes("Bob"), "game over shows both players");
  const bobFinal = (await scoreOf(host, "Bob")) ?? 0;
  assert(
    bobFinal >= scoreBeforeReload,
    `Bob kept his score across reconnect (before=${scoreBeforeReload}, final=${bobFinal})`,
  );

  await host.screenshot({ path: "/tmp/ck-mp-host-gameover.png" });
  await player.screenshot({ path: "/tmp/ck-mp-player-gameover.png" });

  // --- Fast rematch ---
  await host.getByRole("button", { name: "Play again →" }).click();
  await waitPhase(host, "question");
  assert(true, "host play-again starts a fresh game");

  await browser.close();
  log("done");
}

try {
  await main();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  // give children a moment to die
  await new Promise((r) => setTimeout(r, 500));
  process.exit(failed ? 1 : 0);
}
