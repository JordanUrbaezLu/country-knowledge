# Country Knowledge

An interactive 3D globe for learning country **names, flags, and locations** — explore the
world, then test yourself with a 10-question quiz.

## Features

- **3D globe** of Earth with every country rendered as a polygon with borders. Drag to rotate,
  scroll/pinch to zoom, and **two-finger trackpad swipe to spin**.
- **Explore mode** — click any country to see its flag, capital, region, and ISO code, and to
  outline its **state/province borders** on the globe (one country at a time).
- **Solo mode** — a 10-question round mixing three challenge types:
  1. 🟠 **Locate → name** — a country lights up; type its name (typo-tolerant).
  2. 🏳️ **Flag → identify** — name the country from its flag.
  3. 🌍 **Name → find** — click the named country on the globe.
  Running score, typo tolerance, and a best-score saved to `localStorage`.
- **Difficulty** — **Easy / Medium / Hard**, applied to both Solo and Family. Difficulty changes the
  pool of countries by "fame" (a population + GDP blend): Easy draws from the ~50 most prominent
  nations, Medium ~120, Hard the whole world including obscure micro-states.
- **Family mode (online multiplayer)** — GeoGuessr-style. Create a room, share the link, everyone
  enters a name, and you compete in real time. See the next section.
- **Mobile crosshair** — on touch devices a centre-screen reticle continuously names whatever
  country (or state, once one is selected) sits beneath it; tapping the pill selects it, the
  same as a click. The name→find quiz question uses the reticle too: aim, then tap
  **Select this country** (names stay hidden). Selecting a country focuses it under the
  reticle, and the quiz input lifts above the iOS keyboard.

## Multiplayer (Family mode)

Switch to **Family** to play together in real time — inspired by GeoGuessr, but country-based.

- **Create a room** → get a short, say-out-loud code (no `0/O/1/I`) and a **share link**. Anyone who
  opens the link types a name and they're in — no sign-up, no accounts.
- **Each round has a timer** and a **speed bonus**: a correct answer scores from ~1000 (instant) down
  to a 100 floor at the buzzer; wrong/no-answer scores 0. The round ends as soon as everyone has
  answered, so there's no dead waiting.
- **The reveal is the payoff.** The globe flies to the answer (glowing **gold**) and **every player's
  guess lights up in their own color** with their name floating on it — typed guesses are resolved
  back to a country so they light up too. You can literally see who was a country (or a continent)
  off. A results strip shows each pick, ✓/✗, points and time, then the running leaderboard.
- **Reliable for family on phones.** Lock your screen, lose Wi-Fi, or refresh — you **rejoin the same
  game and keep your score and color** (identity is a `localStorage` id). The game keeps running if
  the host closes their tab (host role hands off automatically).

**Architecture.** There's no cloud server to run or pay for. A small **self-hosted Node server**
(`server/index.ts`) serves the built app *and* hosts the realtime game over WebSockets on one port —
you run it on your computer whenever you want to play. It owns the clock, scoring and round
progression; it's *dataset-free* (the host's browser generates the question sequence) and keeps
nothing on disk. All the game rules live in a transport-agnostic engine (`src/multiplayer/roomGame.ts`).
See [AGENTS.md](AGENTS.md) for the design.

### Playing with family (you host, they join the link)

Your computer runs the game; family open a link on their phones. Two cases:

**Same Wi-Fi (everyone in the house):**

```bash
npm run play        # builds + starts the server on :1999, prints a "Same Wi-Fi" URL
```

Share the `http://192.168.x.x:1999` URL it prints; everyone opens it → **Family** → create a room.

**Family on cellular / different networks (most common):** you need a public link via a tunnel.

```bash
npm run share       # builds, starts the server, AND opens a public tunnel — prints an https URL
```

Share the printed `https://….trycloudflare.com` link. They open it on their phones (cellular is fine),
pick **Family**, and play. Keep that terminal open while you play; `Ctrl-C` ends it.

> `npm run share` bundles Cloudflare's tunnel (the [`cloudflared`](https://www.npmjs.com/package/cloudflared)
> package; the binary downloads once on first run) — no install, no account. Both HTTP and WebSocket
> are proxied, verified end-to-end (the app loads and a room connects through the public link).

For local development (hot reload), `npm run dev:mp` runs Vite + the server together at
`http://localhost:5173`.

### Deploy as an always-on public site (anyone can play)

The same server (`server/index.ts`) deploys to any always-on host — it serves the app **and** the
WebSocket on one URL, so there's nothing extra to configure (the client connects same-origin).

**Render (one click)** — a [`render.yaml`](render.yaml) blueprint is included:

1. Push this repo to GitHub (done).
2. [Render](https://render.com) → **New** → **Blueprint** → connect the repo → **Apply**.
3. Open the `https://<your-app>.onrender.com` URL. Done — share it with anyone.

The free plan sleeps after ~15 min idle (first visitor then waits ~50s); switch the plan to **Starter**
($7/mo) for always-on, no cold starts — recommended for a public, GeoGuessr-style site.

**Railway / Fly.io / any container host** — use the included [`Dockerfile`](Dockerfile):

- Railway: New Project → Deploy from GitHub → it builds the Dockerfile. No cold starts.
- Fly.io: `fly launch` (reads the Dockerfile) → `fly deploy`.

> **Keep it to one instance.** Rooms live in memory, so the app must run as a single instance (don't
> enable autoscaling). A restart simply ends any in-progress games — fine for casual play. (Sharding
> across instances would need shared state, e.g. Redis — out of scope for now.)

## Tech stack

| Concern | Choice |
|---|---|
| Build / dev | Vite + TypeScript |
| UI | React 19 |
| 3D globe | [react-globe.gl](https://github.com/vasturiano/react-globe.gl) (Three.js / `three-globe`) |
| Country borders | Natural Earth `ne_110m_admin_0_countries` (vendored in `public/`) |
| State borders | Natural Earth `ne_10m_admin_1_states_provinces`, pre-split per country into `public/states/` |
| Country metadata | [`world-countries`](https://www.npmjs.com/package/world-countries) (names, capitals, ISO codes) |
| Flags | SVGs vendored from `world-countries` into `public/flags/` by `scripts/build-flags.mjs` (no CDN dependency) |
| Game state | Zustand |
| Multiplayer | Self-hosted Node server (`ws` + `sirv`, run via `tsx`) over a transport-agnostic engine; [`partysocket`](https://www.npmjs.com/package/partysocket) reconnecting client; public link via a tunnel |
| Styling | Tailwind CSS v4 |
| Tests | Vitest (unit) + Playwright (`scripts/mp-e2e.mjs` live multiplayer e2e) |

## Getting started

Requires **Node ≥ 20.19** (Vite 8).

```bash
npm install
npm run play         # ⭐ host a game: build + serve app + multiplayer on :1999
npm run share        # ⭐ same, but also opens a public tunnel link (family on cellular)
npm run dev          # Vite only — Explore + Solo (http://localhost:5173)
npm run dev:mp       # Vite + game server together (hot reload) for development
npm run build        # typecheck + production build (the SPA)
npm run typecheck:server # typecheck the Node server (separate tsconfig)
npm run test         # unit tests (data, matching, scoring, room state machine, difficulty)
npm run check        # build + server typecheck + tests
node scripts/mp-e2e.mjs  # live end-to-end: spins up the server + Vite, plays a full 2-player game
```

With a dev server running, `node scripts/mobile-verify.mjs <url>` drives the full mobile (emulated
iPhone) + desktop flows end-to-end with Playwright, and `node scripts/ui-tour.mjs <url>` captures
screenshots of every screen to `/tmp/`.

## Data notes

- **ISO `-99` fix:** Natural Earth marks some countries' ISO codes as `-99` (France, Norway,
  Kosovo, …). The loader (`src/data/countries.ts`) falls back to the `*_EH` fields and an
  alpha-2 → `world-countries` join so flags/metadata resolve correctly. Northern Cyprus and
  Somaliland have no ISO code, so they render on the globe but are marked non-quizzable.
- **State borders:** the 10m admin-1 dataset is ~39 MB, so `scripts/build-states.mjs`
  pre-processes it into small per-country files (`public/states/<ISO3>.json`, coordinates
  rounded to ~3 decimals) plus an `index.json`. The app lazy-fetches only the clicked
  country's file. Regenerate with:

  ```bash
  npm run build:states   # downloads the source if missing, writes public/states/
  ```

## Project structure

```
src/
  data/        country + state loading and normalization (+ tests)
  game/        zustand store, question generation, answer matching (+ tests)
  globe/       GlobeView — the react-globe.gl wrapper (rendering, controls, trackpad rotate,
               mobile crosshair raycasting + select pill)
  explore/     ExploreView — click-to-inspect + state borders
  components/  ExplorePanel, QuizHud, Results, ModeSwitcher
  lib/         text normalization + Levenshtein, touch detection, keyboard inset hook
scripts/       build-states.mjs / build-flags.mjs (data preprocessing),
               mobile-verify.mjs / ui-tour.mjs (Playwright end-to-end checks)
public/        vendored Natural Earth geojson + generated states/
```

## Attribution

Map data © [Natural Earth](https://www.naturalearthdata.com/) (public domain).
Country metadata and flag images from
[`world-countries`](https://github.com/mledoze/countries) (ODbL).
