# Dead & Injured, on the web

The Streamlit game in this repo, rebuilt as a live multiplayer 3D game that runs on Cloudflare: https://dead-and-injured.uririnathaniel.workers.dev

Each side hides a code of four different digits and fires guesses at the other's. **Dead** is a right digit in the right place, **injured** a right digit in the wrong place. Every guess flies across the field as four glowing digits, and the squad on the other end takes it: soldiers die for each dead, get bandaged for each injured, and duck when it misses, on both players' screens at once.

What carries over from the original: callsigns with optional passwords, create and join by code, the rock, paper, scissors draw for power ups (now three supplies: recon, sniper and smoke) and a computer opponent at three ranks. New: quick match, a leaderboard, tutorials, a last stand for the side that fired second, turn timers, reconnects, rematches and signing in with Google.

Every match is played under a set of **orders**: which supplies are on, how many crates (1 to 5) and a time limit of 5, 10 or 15 minutes, with 30, 45 or 60 seconds a turn. The winner of the draw takes the crates, the loser one fewer and the first shot (with every supply off, the winner fires first). When the clock runs out the round is finished, then the side closest to cracking wins: most dead, then most injured, then fewer shots. A friend room plays by the host's orders; in quick match each side brings their own and the winner of the draw has theirs stand. A draw against the computer on the clock counts as a solo draw.

## How it is built

| Part | What it does |
| --- | --- |
| `src/worker/index.js` | The Worker: `/api/*` (callsigns, sessions, rooms, leaderboard) and `/ws/*` (sockets to the rooms). Everything else is static assets, served without running the Worker. |
| `src/worker/google.js` | Sign in with Google (OpenID Connect with PKCE). The Worker swaps Google's code for an ID token itself and keeps only Google's account number (`players.google`), one Google account to a callsign. A new account picks its callsign first, held for 15 minutes in a signed cookie; signing into an existing callsign with its password links it instead. Your dog tag signs in with Google or links it. |
| `src/worker/room.js` | A Durable Object per match. It holds both codes, scores every volley and pushes each event to both sockets. Sockets use the hibernation API, so an idle room costs nothing. |
| `src/worker/lobby.js` | The quick match queue, one Durable Object for everyone. |
| `src/shared/game.js` | The match engine, pure functions shared by the rooms and by matches against the computer in the browser, including the tutorial's drill (`newDrill`): every turn is yours, a crate for each supply, no clock. A player's code never leaves the server until the match ends. |
| `schema.sql` | D1 (SQLite): players, sessions, finished matches. |
| `src/client/scene/` | The three.js field: terrain, sky, the soldiers and the set dressing, effects and the camera director. |
| `src/client/scene/network.js`, `trench.js` | The trench network behind our left flank, where the title lives: the trench corner with the canvas banner and the signpost, the notice board, the war room, the signals dugout and the radio post, built up breastwork style from code-built sandbags, timber, iron, duckboards and lanterns. The places answer what you do: the war room's toy crates and supply tokens follow your orders, the radio's needle sweeps while it searches, a room's code is chalked up, your record is chalked on the parapet. The sandbags are one instanced mesh and every other piece is built once per size and copied. The ground there is levelled only where no battle shot looks (`palette.js`). |
| `src/client/title.js`, `title.css` | The title as a place: each choice is an object, with a real button laid over it for keyboards, screen readers and taps, and the camera walks between places in one continuous take (`director.travel`). Play the computer goes through the war room to the enemy commanders on their parapet; Tutorials climbs straight over the top into a practice match (`drill.js`) against a drill squad that hides a code and never fires back, with a paper slip that teaches firing, dead and injured, and each supply in turn; a friend's room is opened on the field telephone and its code chalked up; quick match searches from the radio post. Each place sounds like itself (wind, a dugout stove, radio static) and the walks have footsteps. The first visit flies in over the field and the banner unrolls. |
| `src/client/scene/army.js` | Eight rigged soldiers: skinned meshes driven by an animation mixer (idle, aim, duck, hit, death, wave, taunt, jump), each side in its own uniform. Helmets and rifles are instanced; a hit knocks them off and they tumble to rest on the field. |
| `src/client/scene/director.js` | The camera and the moments: volleys, the supply draw, and the supplies' own scenes. Recon sends a spotter plane (`plane.js`) over their trench to drop a green or red flare; the sniper looks through a scope at the soldier in the chosen spot, and a soldier who survives the shot taunts you. |
| `src/client/scene/stage.js` | The renderer. The drawing buffer is only resized right before a render, since a resize clears it and a cleared buffer on screen is a black frame; resolution adapts to the frame rate in quarter steps, and a lost WebGL context is rebuilt. On a phone (a touch screen) it draws at most about 60 frames a second, every other refresh on a 90 or 120 Hz screen, starts at 1.75 times the CSS pixels and stops at 2, and every shader is compiled in parallel behind the loading bar, so none is built mid-match. |
| `src/client/scene/logo.js` | The portfolio's block logo with a symbol in its fourth block: a skull for dead, a bandage for injured. They frame the title while the field loads and land above every volley's result. |
| `src/client/audio.js` | Every sound is synthesised with Web Audio (cannons, whistles, the death knell, bugles, wind), so there are no audio files to download. Phones get a larger audio buffer and a shorter reverb so the sound does not crackle, an iPhone plays it through the ringer switch while the game's sound is on, and sound a phone stopped on its own comes back on the next tap. |
| `src/client/match.js` | The match screen: plays the server's events as animations in order. Its tools sit on a wooden plank at the bottom as clay 3D icons (`scene/icons.js`): the field gun opens fire control, the plane, scope and smoke canister open each supply's dossier, the notebook keeps the log, the speech bubble holds the taunts. On a phone the bar's icons draw on a canvas of their own at the screen's full density, so they stay sharp while the field lowers its resolution. Windows open, minimise and close like a taskbar (`desk.js`); a brass stud in the corner pauses. At the end the field plays out the surrender, a rubber stamp gives the verdict, the report arrives as a telegram (`report.js`), and a field telephone (rematch) and a signpost (back to base) replace the tools. |
| `src/client/match.css`, `textures.js` | The match screen's materials: paper, manila card and wood painted once at load, stencil, typewriter and chalk lettering (Stardos Stencil, Courier Prime and Caveat, all under the Open Font License, in `static/fonts`). |

## Redesign

The redesign of the match screen, title screen, end screens and match rules is planned in [`design/redesign-requests.md`](design/redesign-requests.md) and built phase by phase; each phase's sketch and review are in [`design/studio-notes.md`](design/studio-notes.md). The screenshots behind it are in [`design/references/`](design/references/) and are kept in the repository on purpose so they can be analyzed properly; study every image before building.

## Run it

```
npm ci
npx wrangler d1 execute dead-and-injured --local --file schema.sql
npm run dev
```

`npm test` runs the rules, engine, computer and telegram tests. With `wrangler dev` running, `node test/api.mjs` checks the rooms, the lobby and the API without a browser, `node test/e2e.mjs` plays a full live match between two browsers, through the stamp and telegram to a rematch, `node test/quick.mjs` checks quick match and signing in, and `node test/title.mjs` checks the title in the trench: that every point along a plank or a nameplate presses that object's own button (on an upright phone, a phone on its side and a desktop), hosting a room (the telephone again, typing in the dial, Esc, Back, your own room's link, leaving while a room opens or a code is checked), and coming back into a match already under way as its host and as its guest (the browser tests need `NODE_PATH=$(npm root -g)` for Playwright). `node test/api.mjs --clock` checks that a room ends itself when the match clock runs out; run it against `wrangler dev --var TIME_SCALE:0.05`, where five minutes pass in fifteen seconds. `node test/google.mjs` checks Google sign-in against a stand-in for Google on this machine, through the API and in the browser; run it against `wrangler dev --var GOOGLE_CLIENT_SECRET:stub-secret --var GOOGLE_STUB:http://127.0.0.1:8790`.

## Models

`models/soldier.glb` and `models/props.glb` come from [Quaternius' Toon Shooter Game Kit](https://quaternius.com/packs/toonshootergamekit.html) (CC0). `node tools/soldier.mjs path/to/Character_Soldier.gltf` keeps the soldier's rig and the clips the game plays, folds the head, hood and shoulder pads into one skinned mesh, splits off the helmet and rifle, and tags every vertex with its material so each side is painted at load; `node tools/props.mjs path/to/Environment/glTF` bakes the props' colours into their vertices. Both quantize and meshopt-compress the result (about 200 KB together), and the build copies them into `dist/assets` under content hashes.

## Deploy

```
npx wrangler d1 execute dead-and-injured --remote --file schema.sql
npm run deploy
```

Passwords are hashed with PBKDF2 and a pepper kept as a Worker secret (`wrangler secret put PEPPER`); set it once, before anyone adds a password. Google sign-in needs an OAuth client of type Web application whose redirect URI is `https://dead-and-injured.uririnathaniel.workers.dev/api/auth/google/callback`: its ID is in `wrangler.jsonc` and its secret is a Worker secret (`wrangler secret put GOOGLE_CLIENT_SECRET`). A database made before Google sign-in gets its column once, before `schema.sql`: `npx wrangler d1 execute dead-and-injured --remote --command "ALTER TABLE players ADD COLUMN google TEXT"`. The icons and logo images in `static/` come from the live 3D logo: `node tools/logo-shots.mjs` with `wrangler dev` running, and `node tools/icons.mjs` for the SVG favicon.

Everything fits the Workers free plan: static assets are free, rooms sleep between moves, and D1 is written once per match.
