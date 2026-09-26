# Dead & Injured, on the web

The Streamlit game in this repo, rebuilt as a live multiplayer 3D game that runs on Cloudflare: https://dead-and-injured.uririnathaniel.workers.dev

Each side hides a code of four different digits and fires guesses at the other's. **Dead** is a right digit in the right place, **injured** a right digit in the wrong place. Every guess flies across the field as four glowing digits, and the squad on the other end takes it: soldiers die for each dead, get bandaged for each injured, and duck when it misses, on both players' screens at once.

What carries over from the original: callsigns with optional passwords, create and join by code, the rock, paper, scissors draw for power ups (now three supplies: recon, sniper and smoke) and a computer opponent at three ranks. New: quick match, a leaderboard, a last stand for the side that fired second, turn timers, reconnects and rematches.

## How it is built

| Part | What it does |
| --- | --- |
| `src/worker/index.js` | The Worker: `/api/*` (callsigns, sessions, rooms, leaderboard) and `/ws/*` (sockets to the rooms). Everything else is static assets, served without running the Worker. |
| `src/worker/room.js` | A Durable Object per match. It holds both codes, scores every volley and pushes each event to both sockets. Sockets use the hibernation API, so an idle room costs nothing. |
| `src/worker/lobby.js` | The quick match queue, one Durable Object for everyone. |
| `src/shared/game.js` | The match engine, pure functions shared by the rooms and by matches against the computer in the browser. A player's code never leaves the server until the match ends. |
| `schema.sql` | D1 (SQLite): players, sessions, finished matches. |
| `src/client/scene/` | The three.js field: terrain, sky, instanced clay soldiers (every body part of all eight men is one draw call per part), effects, the camera director and the 3D title. |
| `src/client/scene/logo.js` | The portfolio's block logo with a symbol in its fourth block: a skull for dead, a bandage for injured. They frame the title while the field loads and land above every volley's result. |
| `src/client/audio.js` | Every sound is synthesised with Web Audio (cannons, whistles, the death knell, bugles, wind), so there are no audio files to download. |
| `src/client/match.js` | The match screen: plays the server's events as animations in order, the keypad, supplies, logs and timers. |

## Run it

```
npm ci
npx wrangler d1 execute dead-and-injured --local --file schema.sql
npm run dev
```

`npm test` runs the rules, engine and computer tests. With `wrangler dev` running, `node test/e2e.mjs` plays a full live match between two browsers and `node test/quick.mjs` checks quick match and signing in (both need `NODE_PATH=$(npm root -g)` for Playwright).

## Deploy

```
npx wrangler d1 execute dead-and-injured --remote --file schema.sql
npm run deploy
```

Passwords are hashed with PBKDF2 and a pepper kept as a Worker secret (`wrangler secret put PEPPER`); set it once, before anyone adds a password. The icons and logo images in `static/` come from the live 3D logo: `node tools/logo-shots.mjs` with `wrangler dev` running, and `node tools/icons.mjs` for the SVG favicon.

Everything fits the Workers free plan: static assets are free, rooms sleep between moves, and D1 is written once per match.
