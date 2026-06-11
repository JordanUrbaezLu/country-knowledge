# Country Knowledge

An interactive 3D globe for learning country **names, flags, and locations** — explore the
world, then test yourself with a 10-question quiz.

## Features

- **3D globe** of Earth with every country rendered as a polygon with borders. Drag to rotate,
  scroll/pinch to zoom, and **two-finger trackpad swipe to spin**.
- **Explore mode** — click any country to see its flag, capital, region, and ISO code, and to
  outline its **state/province borders** on the globe (one country at a time).
- **Play mode** — a 10-question round mixing three challenge types:
  1. 🟠 **Locate → name** — a country lights up; type its name (typo-tolerant).
  2. 🏳️ **Flag → identify** — name the country from its flag.
  3. 🌍 **Name → find** — click the named country on the globe.
  Running score, typo tolerance, and a best-score saved to `localStorage`.
- **Mobile crosshair** — on touch devices a centre-screen reticle continuously names whatever
  country (or state, once one is selected) sits beneath it; tapping the pill selects it, the
  same as a click. The name→find quiz question uses the reticle too: aim, then tap
  **Select this country** (names stay hidden). Selecting a country focuses it under the
  reticle, and the quiz input lifts above the iOS keyboard.

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
| Styling | Tailwind CSS v4 |
| Tests | Vitest |

## Getting started

Requires **Node ≥ 20.19** (Vite 8).

```bash
npm install
npm run dev       # start the dev server (http://localhost:5173)
npm run build     # typecheck + production build
npm run preview   # serve the production build
npm run test      # run the unit tests (data normalization + answer matching)
```

To try it on a phone, run `npm run dev -- --host` and open the LAN URL it prints.
With the dev server running, `node scripts/mobile-verify.mjs <url>` drives the full
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
