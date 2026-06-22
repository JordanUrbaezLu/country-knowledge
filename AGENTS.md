# Globe Royale — agent brief

3D-globe country-quiz. **Explore** (click a country → flag/capital/state borders), **Solo**
(10-question round), and **Family** (online multiplayer, GeoGuessr-style). React + TypeScript +
**Vite SPA** (NOT Next.js), deployed on **Vercel**. Desktop-first, mobile-supported.

## Hard-won facts — do not re-learn
- **No cloud server.** Multiplayer is a **self-hosted Node server** (`server/index.ts`, `ws` + `sirv`,
  run via `tsx`) that the user runs on their own machine when they want to play. It serves the built
  SPA **and** the WebSocket on **one port** (default 1999), so the client connects **same-origin** —
  no env var needed in prod. Family joins a public link from a **tunnel**: `npm run share`
  (`scripts/share.mjs` starts the server + a Cloudflare quick tunnel via the `cloudflared` npm package;
  waits for the `connected` event before printing the link). HTTP+WS through it verified end-to-end.
  (We pivoted OFF PartyKit: its shared `partykit.dev` zone hit Cloudflare's 10k-custom-domain cap, a
  hard platform block. Vercel can't host the WS server either, hence self-host.)
- The **server is authoritative** for clock/scoring/round progression and is **dataset-free**: the
  host's browser generates the question `sequence` (countryId+mode+duration) and sends it in `start`.
  Clients map countryId → their local `Country`; they report only `{correct, pickedLabel,
  pickedCountryId}`. Scoring uses the **server** clock (fair across latency).
- **Identity = a localStorage uuid** (`ck.mp.id`) sent as the `id` query param in the WS URL
  (`/ws?room=CODE&id=UUID`) via partysocket's reconnecting `WebSocket`. The server keys players by it,
  so disconnect/refresh/tab-close **rejoins the same player and keeps score + color**. Never move it
  to sessionStorage. `VITE_WS_HOST` overrides the same-origin default (dev/cross-origin only).
- Core game rules live in a **pure, transport-agnostic engine** `src/multiplayer/roomGame.ts`
  (injected `RoomIO`: now/send/broadcast/scheduleTimer/clearTimer, **one** active timer). This is the
  unit-tested surface; `server/index.ts` is a thin adapter (same-id reconnect = "last socket wins").
- `server/` is **not in the main tsconfig**. Typecheck it separately: `npm run typecheck:server`
  (`server/tsconfig.json`, node types).
- **Env files:** real values go in gitignored `.env.local` (preferred) or `.env`; the committed
  `.env.example` is the names-only template. Server loads them via `process.loadEnvFile()`, which is
  **first-wins** (never overwrites an already-set key) and reads only the exact path given — so it loads
  `.env.local` **before** `.env` (local overrides) and Vite is **not** consulted for server vars. Host/shell
  env beats both files (prod injects directly). Only `VITE_`-prefixed vars reach the client bundle (PUBLIC).
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
- **Accounts/auth/stats (opt-in; guests unaffected).** Postgres via `DATABASE_URL` (Neon); only new
  runtime dep is `pg` (pure-JS) + built-in scrypt. `server/db.ts` is the data layer (injectable
  `Queryable` → tests run on `pg-mem`, NO live DB). `server/auth.ts` = scrypt + a signed httpOnly
  **sliding** session cookie (~1yr, renewed each request → "log in once"; Safari's 7-day cap is
  JS-cookie-only, so a server `Set-Cookie` persists on iPhone). `server/api.ts` (`/api/*`) is mounted
  in `server/index.ts` before sirv. **No `DATABASE_URL`+`SESSION_SECRET` ⇒ `/api`→503 and guests
  still play.** Per-answer **`attempts`** log is the source of truth; every stat is SQL over it
  (`mp_games` holds win placement). MP results attribute via `server/mpStats.ts` (pure, tested) hooked
  into the `io.broadcast` seam — engine stays dataset-free; the session cookie rides the same-origin WS
  upgrade so `readSession(req)` maps player→account in `wss.on("connection")`.
- **Insights are OFFLINE & manual.** `npm run insights` (`scripts/insights.ts`) runs LOCALLY: reads
  Neon → `computeInsightFeatures` (pure, `server/insights.ts`) → Claude **Haiku 4.5** with the LOCAL
  `ANTHROPIC_API_KEY` (never deployed) → writes committed `data/insights.json`
  (`{userId:{message,generated_at}}`). You merge+deploy; gated `GET /api/insights` returns only the
  logged-in user's entry. (Consult the `claude-api` skill for current model/SDK before editing it.)

## Code map
- `src/game/questions.ts` — question generation, **difficulty fame buckets** (easy 50 / med 120 / hard all), `MODE_DURATION_MS`.
- `src/game/store.ts` / `game/GameView.tsx` — solo zustand store + UI (difficulty-aware).
- `src/multiplayer/protocol.ts` — wire types, `scorePoints`, `REVEAL_MS`, `COLOR_SLOTS` (shared client+server).
- `src/multiplayer/roomGame.ts` — **authoritative engine** (state machine, scoring, host handoff, rejoin).
- `server/index.ts` — self-hosted Node adapter (http+sirv serves dist, `ws` for `/ws`, RoomIO via setTimeout/Date.now).
- `src/multiplayer/useRoom.ts` — client store (PartySocket, message handling, phase, reconnect).
- `src/multiplayer/MultiplayerView.tsx` — orchestrator: one persistent globe + phase overlays + reveal lighting.
- `src/multiplayer/{JoinScreen,Lobby,RoundHud,Reveal,GameOver,Timer,ui,colors,resolveGuess}` — screens + helpers.
- `src/globe/GlobeView.tsx` — globe (highlights / markers / focusAltitude).
- `server/{db,auth,api,mpStats,insights}.ts` — accounts data layer / scrypt+sessions / `/api/*` routes / MP→DB mappers / pure feature analysis (all listed in `server/tsconfig.json`).
- `src/auth/{useAuth.ts,AccountScreen.tsx,recordSolo.ts}` + `src/profile/ProfileView.tsx` — auth store, iPhone-first login UI, solo-result POST, profile (stats + leaderboard + insight). Account chip + boot check live in `src/App.tsx`.
- `scripts/insights.ts` — local Claude batch → `data/insights.json`.

## Commands
- `npm run play` — host a game (build + serve app + multiplayer on :1999). `npm run share` — same + public tunnel link.
- `npm run dev` — Vite + game server together (hot reload); Vite proxies `/ws` → :1999 so dev is **same-origin like prod** (no `VITE_WS_HOST`). `npm run dev:web` = Vite only (frontend, no multiplayer).
- `npm run build` — typecheck (SPA) + prod build. `npm run typecheck:server` — server typecheck.
- `npm run test` — unit tests. `npm run check` — build + server typecheck + tests.
- `node scripts/mp-e2e.mjs` — **live e2e**: spins up the server + Vite, plays a full 2-player game incl. reconnect + rematch.
- `node scripts/auth-e2e.mjs` — **live emulated-iPhone** auth+profile e2e against Neon (signup → cookie persists → solo stats → logout; needs `DATABASE_URL`; self-cleans `zz_e2e_*` users).
- `npm run insights` — LOCAL: regenerate `data/insights.json` from Neon via Claude (needs `DATABASE_URL` + `ANTHROPIC_API_KEY`).

## Verification bar for changes
`npm run check` green **and** `node scripts/mp-e2e.mjs` green (exit 0). For multiplayer/visual changes,
eyeball `/tmp/ck-mp-reveal-*.png` from the e2e. History/notes: see README.
