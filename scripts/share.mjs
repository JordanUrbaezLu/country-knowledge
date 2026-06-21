/**
 * One command to host a game for family anywhere: starts the game server on
 * this computer and opens a public Cloudflare tunnel, then prints the link to
 * share. No accounts, no cloud. The tunnel proxies both HTTP and WebSockets, so
 * family on cellular open the link and play. Ctrl-C stops everything.
 *
 * Run via `npm run share` (which builds first), or `node scripts/share.mjs`.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { existsSync } from "node:fs";

// cloudflared is an optionalDependency (skipped on cloud builds that don't need
// it). For local `npm run share` a normal `npm install` includes it.
let bin, install, Tunnel;
try {
  ({ bin, install, Tunnel } = await import("cloudflared"));
} catch {
  console.error("\n❌  The tunnel tool isn't installed. Run:  npm install\n");
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 1999;
let server = null;
let tun = null;

function tryConnect(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => {
      s.destroy();
      resolve(false);
    });
  });
}

async function waitPort(port, timeoutMs = 30000) {
  const start = Date.now();
  for (;;) {
    if ((await tryConnect(port, "127.0.0.1")) || (await tryConnect(port, "::1"))) return;
    if (Date.now() - start > timeoutMs) throw new Error(`game server didn't start on :${port}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

function shutdown() {
  try {
    tun?.stop?.();
  } catch {
    /* ignore */
  }
  try {
    server?.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  // 1. Make sure the tunnel tool is present (one-time ~40MB download).
  if (!existsSync(bin)) {
    console.log("⬇️  Downloading the tunnel tool (one-time)…");
    await install(bin);
  }

  // 2. Start the game server on this computer.
  console.log("🚀  Starting the game server…");
  server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  });
  server.on("exit", (code) => {
    if (code) {
      console.error(`Game server exited (code ${code}).`);
      shutdown();
    }
  });
  await waitPort(PORT);

  // 3. Open a public link to it (Tunnel is an EventEmitter; the URL arrives via
  //    the "url" event).
  console.log("🌐  Opening a public link…");
  tun = Tunnel.quick(`http://localhost:${PORT}`);
  tun.on("error", (e) => console.error("Tunnel error:", e?.message ?? e));
  tun.once("exit", () => {
    console.error("Tunnel closed.");
    shutdown();
  });
  const url = await new Promise((resolve, reject) => {
    tun.once("url", resolve);
    setTimeout(() => reject(new Error("tunnel did not produce a URL in time")), 45000);
  });

  // The URL is assigned a moment before the edge connection + DNS are live, so
  // wait for "connected" (with a fallback) so the link actually works when shown.
  await new Promise((resolve) => {
    tun.once("connected", resolve);
    setTimeout(resolve, 8000);
  });

  const line = "═".repeat(64);
  console.log(`\n${line}`);
  console.log("  ✅  Send this link to your family — it works on cellular:\n");
  console.log(`        ${url}\n`);
  console.log("  They open it → tap Family → join your room.");
  console.log("  Keep this window open while you play.  Press Ctrl-C to stop.");
  console.log(`${line}\n`);
}

main().catch((e) => {
  console.error("\n❌  Couldn't start sharing:", e.message);
  shutdown();
});
