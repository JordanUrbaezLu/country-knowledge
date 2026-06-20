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

**Architecture.** The app stays a static Vite SPA (deploy it on Vercel as today). The realtime backend
is a tiny **PartyKit** room (`party/server.ts`) that owns the clock, scoring and round progression —
Vercel can't host a persistent WebSocket server, so this runs separately (free). The PartyKit room is
*dataset-free*: the host's browser generates the question sequence and the server just coordinates.
See [AGENTS.md](AGENTS.md) for the full design.

```bash
npm run dev:mp     # Vite + PartyKit together, then open http://localhost:5173 → "Family"
```

### Deploying multiplayer

1. **Deploy the room:** `npm run party:deploy` (first run: `npx partykit login`). It prints a host like
   `country-knowledge.<your-username>.partykit.dev`.
2. **Point the frontend at it:** set `VITE_PARTYKIT_HOST` to that host in your Vercel project env, then
   redeploy. (Locally it defaults to `127.0.0.1:1999`; see `.env.example`.)

That's it — your existing Vercel URL now hosts the game; share links just work. For an ad-hoc game
night without deploying, run `npm run dev:mp` and expose `:5173` with a tunnel (e.g. `cloudflared`).

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
| Multiplayer | [PartyKit](https://partykit.io) (authoritative room) + [`partysocket`](https://www.npmjs.com/package/partysocket) client |
| Styling | Tailwind CSS v4 |
| Tests | Vitest (unit) + Playwright (`scripts/mp-e2e.mjs` live multiplayer e2e) |

## Getting started

Requires **Node ≥ 20.19** (Vite 8).

```bash
npm install
npm run dev          # Vite only — Explore + Solo (http://localhost:5173)
npm run dev:mp       # Vite + PartyKit together — needed for Family mode
npm run build        # typecheck + production build (the SPA)
npm run typecheck:party  # typecheck the PartyKit worker (separate tsconfig)
npm run test         # unit tests (data, matching, scoring, room state machine, difficulty)
npm run check        # build + party typecheck + tests
node scripts/mp-e2e.mjs  # live end-to-end: spins up PartyKit+Vite, plays a full 2-player game
```

To try it on a phone, run `npm run dev:mp -- --host` (or `npm run dev -- --host`) and open the LAN
URL it prints. With the dev server running, `node scripts/mobile-verify.mjs <url>` drives the full
mobile (emulated iPhone) + desktop flows end-to-end with Playwright, and
`node scripts/ui-tour.mjs <url>` captures screenshots of every screen to `/tmp/`.

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
