# Country Knowledge — agent brief

3D-globe country-quiz. **Explore** (click a country → flag/capital/state borders), **Solo**
(10-question round), and **Family** (online multiplayer, GeoGuessr-style). React + TypeScript +
**Vite SPA** (NOT Next.js), deployed on **Vercel**. Desktop-first, mobile-supported.

## Hard-won facts — do not re-learn
- **Vercel cannot host the realtime server** (serverless, no persistent WebSockets). Multiplayer
  runs on **PartyKit** (`party/server.ts`), deployed separately (`npm run party:deploy`). The
  Vercel frontend talks to it via `VITE_PARTYKIT_HOST` (dev default `127.0.0.1:1999`).
- The **PartyKit room is authoritative** for clock/scoring/round progression and is **dataset-free**:
  the host's browser generates the question `sequence` (countryId+mode+duration) and sends it in
  `start`. Clients map countryId → their local `Country` to render; they report only
  `{correct, pickedLabel, pickedCountryId}`. Scoring uses the **server** clock (fair across latency).
- **Identity = a localStorage uuid** (`ck.mp.id`) passed as the PartySocket `id`. This is what lets a
  disconnect/refresh/tab-close **rejoin the same player and keep score + color**. Never move it to
  sessionStorage (breaks rejoin on tab close).
- Core game rules live in a **pure, transport-agnostic engine** `src/multiplayer/roomGame.ts`
  (injected `RoomIO`: now/send/broadcast/scheduleTimer/clearTimer, **one** active timer). This is the
  unit-tested surface; `party/server.ts` is a thin adapter. Keep logic in the engine.
- `party/` is **excluded from the main tsconfig** (DOM-vs-Worker globals clash). Typecheck it
  separately: `npm run typecheck:party` (uses `party/tsconfig.json`).
- Player colors: `PLAYER_COLORS` (src/multiplayer/colors.ts) length **must equal `COLOR_SLOTS`** (10)
  in protocol.ts. Server assigns the lowest slot not held by a *connected* player (reuses ghosts).
- Reveal map: `GlobeView` takes `highlights: Record<id,color>` (answer gold + each guess in its
  player color) and `markers` (floating name labels via react-globe.gl `htmlElementsData`). Player
  names are HTML-escaped before injection.
- `MultiplayerView` sets `window.__ckTarget` **only under `import.meta.env.DEV`** (e2e answer hook,
  stripped from prod builds).
- Test gotchas: CSS `text-transform:uppercase` makes `innerText` UPPERCASE (match case-insensitively);
  `vite dev` binds `localhost`/`::1`, not `127.0.0.1` (port checks must try both).
- Node 22 LTS via Homebrew (`/opt/homebrew/bin/node`); Vite 8 needs ≥20.19.

## Code map
- `src/game/questions.ts` — question generation, **difficulty fame buckets** (easy 50 / med 120 / hard all), `MODE_DURATION_MS`.
- `src/game/store.ts` / `game/GameView.tsx` — solo zustand store + UI (difficulty-aware).
- `src/multiplayer/protocol.ts` — wire types, `scorePoints`, `REVEAL_MS`, `COLOR_SLOTS` (shared client+server).
- `src/multiplayer/roomGame.ts` — **authoritative engine** (state machine, scoring, host handoff, rejoin).
- `party/server.ts` — PartyKit adapter (setTimeout/Date.now → RoomIO).
- `src/multiplayer/useRoom.ts` — client store (PartySocket, message handling, phase, reconnect).
- `src/multiplayer/MultiplayerView.tsx` — orchestrator: one persistent globe + phase overlays + reveal lighting.
- `src/multiplayer/{JoinScreen,Lobby,RoundHud,Reveal,GameOver,Timer,ui,colors,resolveGuess}` — screens + helpers.
- `src/globe/GlobeView.tsx` — globe (highlights / markers / focusAltitude).

## Commands
- `npm run dev:mp` — Vite + PartyKit together (local multiplayer). `npm run dev` = Vite only.
- `npm run build` — typecheck (SPA) + prod build. `npm run typecheck:party` — worker typecheck.
- `npm run test` — unit tests. `npm run check` — build + party typecheck + tests.
- `node scripts/mp-e2e.mjs` — **live e2e**: spins up PartyKit+Vite, plays a full 2-player game incl. reconnect + rematch.
- `npm run party:deploy` — deploy the PartyKit room. Set `VITE_PARTYKIT_HOST` in Vercel to the printed host.

## Verification bar for changes
`npm run check` green **and** `node scripts/mp-e2e.mjs` green (exit 0). For multiplayer/visual changes,
eyeball `/tmp/ck-mp-reveal-*.png` from the e2e. History/notes: see README.
