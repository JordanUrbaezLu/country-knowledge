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

## Tech stack

| Concern | Choice |
|---|---|
| Build / dev | Vite + TypeScript |
| UI | React 19 |
| 3D globe | [react-globe.gl](https://github.com/vasturiano/react-globe.gl) (Three.js / `three-globe`) |
| Country borders | Natural Earth `ne_110m_admin_0_countries` (vendored in `public/`) |
| State borders | Natural Earth `ne_10m_admin_1_states_provinces`, pre-split per country into `public/states/` |
| Country metadata | [`world-countries`](https://www.npmjs.com/package/world-countries) (names, capitals, ISO codes) |
| Flags | [flagcdn.com](https://flagcdn.com) SVGs by ISO alpha-2 |
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
  globe/       GlobeView — the react-globe.gl wrapper (rendering, controls, trackpad rotate)
  explore/     ExploreView — click-to-inspect + state borders
  components/  ExplorePanel, QuizHud, Results, ModeSwitcher
  lib/         text normalization + Levenshtein
scripts/       build-states.mjs (data preprocessing)
public/        vendored Natural Earth geojson + generated states/
```

## Attribution

Map data © [Natural Earth](https://www.naturalearthdata.com/) (public domain).
Country metadata from [`world-countries`](https://github.com/mledoze/countries) (ODbL).
Flag images from [flagcdn.com](https://flagcdn.com).
