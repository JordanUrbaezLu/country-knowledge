/**
 * Proves the guided/free globe setting actually changes interaction.
 *  - guided: OrbitControls clamped ~12–168°, up-vector stays (0,1,0) (upright).
 *  - free:   TrackballControls — a hard vertical drag rolls the camera right over
 *            the pole, so its up-vector flips NEGATIVE (a true 360° tumble, which
 *            OrbitControls structurally cannot do).
 *  - switching back to guided snaps the rolled camera upright again.
 *
 * Usage: node scripts/globe-mode-verify.mjs
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { chromium } from "playwright";

const VITE_PORT = 5174;
const WS_PORT = 1999;
const BASE = `http://localhost:${VITE_PORT}`;
const children = [];

const GL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
];

const log = (...a) => console.log("[verify]", ...a);
const DEG = (rad) => (rad * 180) / Math.PI;

function tryConnect(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => (sock.destroy(), resolve(false)));
  });
}
async function waitPort(port, timeoutMs = 90000) {
  const start = Date.now();
  for (;;) {
    if ((await tryConnect(port, "127.0.0.1")) || (await tryConnect(port, "::1"))) return;
    if (Date.now() - start > timeoutMs) throw new Error(`port ${port} not up`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
function spawnProc(cmd, args, name) {
  const p = spawn(cmd, args, { stdio: "pipe" });
  children.push(p);
  p.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[${name}] ${d}`));
  p.stderr.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[${name}!] ${d}`));
  return p;
}
function cleanup() {
  for (const c of children) try { c.kill("SIGKILL"); } catch { /* noop */ }
}

const readGlobe = (page) => page.evaluate(() => window.__ckGlobe?.() ?? null);

// Drag the globe straight up `times` times (full screen height each) to roll the
// view over the top — enough to carry a free tumble past the pole.
async function dragUp(page, times) {
  const vp = page.viewportSize();
  const cx = vp.width / 2;
  const yStart = vp.height - 120;
  const yEnd = 120;
  const steps = 16;
  for (let i = 0; i < times; i++) {
    await page.mouse.move(cx, yStart);
    await page.mouse.down();
    for (let s = 1; s <= steps; s++) await page.mouse.move(cx, yStart + ((yEnd - yStart) * s) / steps);
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
}

// Rotate via the WHEEL (trackpad two-finger), the path that was clamped at ±89°.
async function wheelUp(page, times) {
  const vp = page.viewportSize();
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(40);
  }
}

async function toMode(page, user, label) {
  await page.getByRole("button", { name: user }).click();
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(400);
}

async function main() {
  log("starting server + vite…");
  spawnProc("npx", ["tsx", "server/index.ts"], "ws");
  spawnProc("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], "vite");
  await Promise.all([waitPort(WS_PORT), waitPort(VITE_PORT)]);

  // Accounts come up a few seconds after the port (migrate connects to Neon).
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${WS_PORT}/api/me`)).status !== 503) break; } catch { /* up soon */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  log("api ready");

  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on("pageerror", (e) => log("PAGEERROR:", e.message));
  await page.goto(BASE, { waitUntil: "load" });

  const user = "zzgm" + Math.floor(Math.random() * 100000);
  const status = await page.evaluate(async (u) => {
    const r = await fetch("/api/signup", {
      method: "POST", headers: { "content-type": "application/json" },
      credentials: "include", body: JSON.stringify({ username: u, password: "secret1" }),
    });
    return r.status;
  }, user);
  log("signup", status, user);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__ckGlobe === "function", null, { timeout: 30000 });
  await page.waitForTimeout(500);

  const r = {};

  // GUIDED (default): hard drag — orbit keeps it upright + clamped.
  await dragUp(page, 6);
  r.guided = await readGlobe(page);
  log("GUIDED:    ", JSON.stringify({ ...r.guided, maxPolarDeg: DEG(r.guided.orbitMaxPolar), polarDeg: DEG(r.guided.orbitPolar) }));

  // → FREE: CLICK-DRAG tumbles over the top.
  await toMode(page, user, "Free");
  await dragUp(page, 8);
  r.freeDrag = await readGlobe(page);
  log("FREE drag: ", JSON.stringify(r.freeDrag));

  // → back to GUIDED (snaps upright) → FREE again, then tumble via the WHEEL
  //   (trackpad two-finger) — the path that used to clamp at the pole.
  await toMode(page, user, "Guided");
  r.back = await readGlobe(page);
  log("BACK:      ", JSON.stringify({ ...r.back, polarDeg: DEG(r.back.orbitPolar) }));
  await toMode(page, user, "Free");
  await wheelUp(page, 12);
  r.freeWheel = await readGlobe(page);
  log("FREE wheel:", JSON.stringify(r.freeWheel));

  await browser.close();

  const checks = [];
  const ok = (cond, msg) => (checks.push([cond, msg]), cond);
  ok(Math.abs(DEG(r.guided.orbitMaxPolar) - 168) < 1, "guided uses clamped OrbitControls (maxPolar ≈ 168°)");
  ok(r.guided.orbitEnabled && !r.guided.trackballEnabled, "guided: orbit enabled, trackball off");
  ok(r.guided.upY > 0.99, `guided: hard drag keeps globe UPRIGHT (up.y ${r.guided.upY?.toFixed(3)} ≈ 1)`);
  ok(r.freeDrag.trackballEnabled && !r.freeDrag.orbitEnabled, "free: trackball enabled, orbit off");
  ok(r.freeDrag.upY < 0, `free CLICK-DRAG tumbles over the pole (up.y ${r.freeDrag.upY?.toFixed(3)} < 0)`);
  ok(r.back.upY > 0.99, `back→guided: rolled camera SNAPS upright (up.y ${r.back.upY?.toFixed(3)} ≈ 1)`);
  ok(r.back.orbitPolar >= 0.20 - 0.02 && r.back.orbitPolar <= 2.94, `back→guided: re-clamped into 12–168° (${DEG(r.back.orbitPolar).toFixed(1)}°)`);
  ok(r.freeWheel.upY < 0, `free TRACKPAD/WHEEL also tumbles past the pole (up.y ${r.freeWheel.upY?.toFixed(3)} < 0 — was clamped at ±89° before)`);

  let failed = false;
  for (const [cond, msg] of checks) { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) failed = true; }
  console.log(failed ? "\nVERIFY FAILED" : "\nVERIFY PASSED — free tumbles a full 360°, guided stays upright");
  return failed ? 1 : 0;
}

main().then((c) => { cleanup(); process.exit(c); }).catch((e) => { console.error(e); cleanup(); process.exit(1); });
