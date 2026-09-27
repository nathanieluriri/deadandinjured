# Dead & Injured: redesign requests and plan

Collected from the owner's messages on 27 September 2026. **This is a planning document. No code has been written for any of it**, at the owner's request: "PLEASE JUST DOCUMENT FOR NOW DON'T WRITE CODE WE ARE PLANNING AND DOCUMENTING PROPERLY".

It records what was asked (in the owner's own words), what it means, how it will work, the decisions already made, and what is still open. The screenshots and their detailed descriptions are in [`references/`](references/).

## The requests at a glance

| # | Request | Screens | Area |
|---|---|---|---|
| 1 | The bottom controls become a taskbar of 3D icons, with windows that minimise and close | [04](references/04-windows-taskbar.md) | Match |
| 2 | The fire log can be hidden | [02](references/02-fire-log-window.md) | Match |
| 3 | Each supply is a 3D icon: click it to learn about it and use it | [01](references/01-supply-cards-faded.md), [03](references/03-supply-cards-no-crates.md) | Match |
| 4 | One Pause button in the top corner replaces Leave and Field manual | [05](references/05-leave-and-manual-buttons.md) | Match |
| 5 | The title screen is built from the game's world | [06](references/06-title-screen-current.md), [07](references/07-title-zelda-breath-of-the-wild.md), [08](references/08-title-cereza-and-the-lost-demon.md), [09](references/09-menu-plants-vs-zombies.md) | Title |
| 6 | Choosing an option moves the camera in one continuous shot to the next set of choices; no dropdowns; an intro flight on the first visit | [11](references/11-menu-dropdown-play-the-computer.md), [12](references/12-menu-dropdown-play-a-friend.md) | Title |
| 7 | The losing (and winning) screen is staged in the world | [10](references/10-defeat-screen-current.md) | End of match |
| 8 | Match setup: which supplies, how many crates, a time limit, shorter turns in short matches; quick match settings decided by the draw; solo draws recorded | none | Rules |

## Decisions so far

| # | Question | The owner's answer | What it means |
|---|---|---|---|
| 1 | Crates: does the loser of rock, paper, scissors get fewer? | "Yes the loser gets fewer" | The winner gets the number set, the loser one fewer and the first shot |
| 2 | Are 5, 10 and 15 minutes the right time limits? | "Yessss they are" | Three choices, no unlimited option |
| 3 | At time up: closest to cracking, or sudden death? | "Closest to cracking" | The side nearest to cracking wins (rules in request 8) |
| 4 | Do matches against the computer get the setup step? | "Yesssss" | Same settings as friend matches |
| 5 | Shorter turns in short matches? | "YES" | 30 seconds per turn in a 5-minute match |
| 6 | Can the host switch off individual supplies? | "YES" | Recon, Sniper and Smoke each on or off |
| 7 | A draw against the computer: nothing, or a solo draw? | "YES SOLO DRAW" | A new solo draw count |
| 8 | Which objects for the taskbar icons? | "PLANE, SCOPE, LOG, CLOUD, CHAT, ETC" | The supplies sit on the taskbar themselves (request 1) |
| 9 | Pause in the top corner or on the taskbar? | "TOP CORNER" | Pause stays out of the taskbar |
| 10 | Which frame for the title: signpost, crate, banner or dossier? | "I THINK ALL OF THEM" | Each place in the title world uses one (request 5) |
| 11 | How does quick match set a game? | "QUICK MATCH RANDOMLY ASIGNS A SETTNG FOR BOTH PLAYERS THEN THE WINNER OF ROCK PAPER SCISORS IS THE SETTINGS THAT APPLY" | Each player brings settings; the draw picks whose apply (request 8) |
| 12 | How should moving between title screens look? | "LOOK LIKE ONESHOT" | One continuous camera take, no cuts (request 6) |
| 13 | A first-time intro flight over the field? | "YEAH WHY NOT" | Plays on the first visit, skippable (request 6) |

---

## 1. The match's bottom controls become a taskbar of 3D icons

### The owner's words

> "only 3d icons should show I want the options at the bottom instead of a tab I want them to be like this windows task bar Just icons so they can be minimized nicely and also closed"

> Taskbar icons: "PLANE, SCOPE, LOG, CLOUD, CHAT, ETC"

### Today

- A sliding tab switcher (**Aim**, **Supplies**, **Log**) and a taunt button sit at the bottom (`#switchRow`, `#switch`, `#tauntBtn` in `web/src/client/index.html`; `pane()`, `thumb()`, `fitPanes()` in `web/src/client/match.js`). One pane shows at a time; on desktop the log is a fixed side window.

### The icons

Every icon is a small 3D object in the game's clay toy style, lit like the battlefield. No text on the bar.

| Icon | Object | Opens | Notes |
|---|---|---|---|
| Aim | the field gun | the keypad window (four digit slots, the keypad, Fire) | pulses when it is your turn and the keypad is closed |
| Recon | the spotter **plane** | the Recon window | hidden if Recon is off for this match |
| Sniper | a rifle **scope** | the Sniper window | hidden if Sniper is off |
| Smoke | a smoke **cloud** (a canister with a curl of smoke) | the Smoke window | hidden if Smoke is off |
| Log | a field notebook | the log window | a number shows unread volleys while it is closed |
| Chat | a speech bubble | the taunts window | |

- The three supply icons sit together between the gun and the notebook, with a small stencilled crate counter beside them showing the crates left ("x2"). If the match has no supplies, the group and the counter are not there at all.
- **Pause is not on the taskbar** (decision 9): it sits alone in the top corner (request 4).

```
+----------------------------------------------------------------------+
|  You ##          YOUR SHOT   8:42          Recruit ###        [ || ] |
|                                                                      |
|                        (the 3D battlefield)                          |
|                                                                      |
|            +--------------------------------------+                  |
|            | Keypad                       [_] [x] |                  |
|            |  1 2 3 4 5 6 7 8 9 0   <-   FIRE     |                  |
|            +--------------------------------------+                  |
|                                                                      |
|        [gun] | [plane] [scope] [cloud] x2 | [notebook] [bubble]      |
|         ==                                    =                      |
+----------------------------------------------------------------------+
   == the window in front      = open, not in front      8:42 the match clock
```

### Behaviour (copied from the Windows taskbar, screenshot 04)

- Click an icon: its window opens, rising out of the icon.
- Click the icon of the window in front: it minimises back into the icon.
- Each window's title bar has working **minimise** and **close** buttons (today's three dots are decoration).
- **Minimise** keeps the window's state (typed digits, a chosen digit or soldier) and its marker. **Close** hides it and resets it.
- A short marker under an icon means "open"; a longer, brighter one means "in front".
- **Desktop**: several windows may be open at once, each in a fixed, tidy position (keypad above the bar, log on the left, a supply window above the bar next to the keypad), so nothing gets lost. The open or closed state is remembered between matches.
- **Phones**: one window at a time, as a sheet rising from the bar. Six 44 px icons and the crate counter fit a 360 px wide phone; on the narrowest phones (320 px) the counter becomes a small badge on the supply group so the icons keep their 44 px tap size.
- **Keyboard**: number keys type into the keypad even when it is closed (it opens itself); `Esc` minimises the window in front and, with nothing open, opens the pause menu; shortcuts for the other windows to be listed in the field manual.
- **Labels**: a tooltip on hover (desktop), a label on long press (phones), and an `aria-label` for screen readers on every icon.

### How the 3D icons are drawn, cheaply

- The game already draws an overlay scene on top of the field (`stage.overlay`, used by the 3D logo stamps). The icons are real 3D objects in that overlay, so they can turn and lift on hover, for a handful of extra draw calls and no image downloads.
- If that ever costs too much on slow phones, the same objects are rendered once at load into small images.

### Done when

- The bottom of the match screen is only the icon bar and the windows that are open; every window minimises and closes; the markers are right; it works with mouse, touch and keyboard on phones and desktop.

---

## 2. The fire log can be hidden

### The owner's words

> "the logs should be able to be hidden if the user wants there should be a minimize button or something"

### Plan

- The log is the notebook window on the taskbar: minimise and close work, the notebook icon brings it back, and unread volleys show as a number on the icon while it is closed.
- It keeps its three views (Your fire, Their fire, Compare) and remembers the one you chose.
- It is restyled as a field notebook or a clipboard of dispatches, not a code editor window called "fire.log".
- **Bug to fix on the way**: the rows are numbered 1, 3, 5 instead of 1, 2, 3 because supply rows are counted (`.log li::before` increments the counter on every row, including `.log li.power`). Only volleys should be numbered.
- The default grey scrollbar with arrow buttons is replaced by a thin styled one.

---

## 3. Each supply is a 3D icon: click it to learn and use it

### The owner's words

> "I want the supplies to be 3 3d Icons Click to learn about it and use it that kinda thing you get Nice beautiful UI"

### Plan

- The three supplies are the **plane**, **scope** and **cloud** icons on the taskbar (request 1), not a separate Supplies panel.
- **Clicking one** opens a small window for that supply only:
  - its name and a two-line explanation, with a short looping preview (the plane crossing, the scope's crosshair, smoke rolling);
  - its picker: a digit for Recon; a digit and a soldier for the Sniper; nothing for Smoke;
  - its action ("Send the plane", "Take the shot", "Pop smoke").
- **The sniper's soldier can be chosen on the field**: click an enemy soldier directly (the red targeting ring already exists), or use the four spot buttons.
- **Clear states, never see-through**:
  - available: full colour;
  - not your turn: dimmed clay, and the window's headline says "Supplies go out on your turn";
  - already used this turn: a small padlock, "One crate a turn";
  - no crates left: grey clay, "No crates left";
  - switched off for this match: the icon is not on the taskbar.
- **Learn once, then short**: the first time a player opens a supply the full explanation shows; after they have used it, it shrinks to one line.

---

## 4. One Pause button in the top corner

### The owner's words

> "noo need for these two we need one Pause button instead that opens a menu having quit game and manual and other stuff like that"

> Pause placement: "TOP CORNER"

### Plan

- One pause icon in the top right corner (also `Esc` and `P`). Leave, Field manual and the sound button all move into the menu, so the corner holds only Pause.
- **The pause menu**, styled from the world (an orders sheet or field notebook sliding over the dimmed field):
  - **Resume**
  - **Field manual**
  - **Sound**: effects and music
  - **Graphics**: Auto, Sharp or Fast (a cap on the renderer's adaptive resolution)
  - **Replay the intro** (request 6)
  - **Quit game**, with the existing warning in a live match: "Leaving now hands the win to your opponent."
- **Against the computer** Pause freezes everything: animations, effects, the match clock and the computer's thinking (its moves are scheduled with timers in `web/src/client/net.js`, which must pause too).
- **In a live match** the opponent's clock cannot stop: the menu says so and shows the turn timer and the match clock, so nobody loses a turn by accident.

---

## 5. The title screen is built from the game's world

### The owner's words

> "I want to improve the title screen the current TITLE screen is kinda trash and AI like see a good example of a title screen see how immersed In the games graphics and universe it doesn't look out of place it looks like part of the game sef THe graphics The controls everything Looks like part of the game perfectly in sync which is what I want please"

> Which frame: "I THINK ALL OF THEM CAUSE THE TITLE SCREEN WILL CONSTANTLY BE MOVING BASED ON WHAT THE USER SELECTS SO ANOTHER SCREEN FOR OPTIONS TO SET A GAME ANOTHER SCREEN FOR OPTIONS LIKE QUICK MATCH"

### What the references teach

- **Breath of the Wild** (07): the hero stands in the world looking at the adventure; the menu is a few words of quiet type in empty sky, selected with a small in-world glyph; the logo carries an object from the world.
- **Cereza and the Lost Demon** (08): the title screen is one object from the story (the book), and starting means opening it.
- **Plants vs. Zombies** (09): every control is an object that matches its meaning, in the gameplay's own art style.

### The title world: a trench network with a place for every choice

The title is no longer one screen. It is a small part of the front line, and every choice lives in its own place. All four frames are used (decision 10):

| Place | Frame and objects | What you do there |
|---|---|---|
| **The trench corner** (home) | a canvas **banner** with the title strung over the trench; a wooden **signpost** of nailed planks; a **dog tag** with your callsign on the post; your record as tally marks on a sandbag; the **field manual** as a book on a crate; a **field radio** for sound | Choose: Play the computer, Play a friend, Quick match, Roll of honour |
| **The war room** (a dugout) | a **dossier on a map table** (your orders), a stack of **supply crates** (1 to 5), three supply tokens (a toy plane, a scope, a smoke canister), a **field clock** | Set up a match: supplies, crates, time limit |
| **The signals dugout** | a field telephone with a rotary dial, a chalkboard | Open a room (the code is chalked up) or dial a friend's code to join |
| **The radio post** | a radio set with a sweeping needle, a clipboard with your orders | Quick match: search the airwaves while adjusting your orders |
| **The notice board** | a roll of honour pinned up, with medals | The leaderboard |
| **The enemy line** | the three enemy commanders on their parapet, with rank insignia | Play the computer: pick your opponent |

- **Selection uses the world**: a hovered plank swings or catches the lantern light; the chosen one gets a small in-world mark. No boxes, lists, chevrons or dropdowns anywhere.
- **Type in the world** is stencilled, painted, chalked or typed on paper. A free stencil typeface under the Open Font License (loaded only for the title) or letters drawn onto textures at load; Archivo stays for small print.
- **The one place that needs typing** (a friend's room code) is the telephone's dial or a row of stencilled tiles, backed by a hidden text box so typing, pasting and phone keyboards still work.

### Accessibility and practical notes

- The 3D objects are clicked by raycasting the scene; a hidden layer of real HTML buttons mirrors them in the same order, so keyboard users can Tab through them and screen readers can read them.
- Tap areas on phones are at least 44 px, bigger than the objects where needed. Every place is framed for portrait phones as well as desktop.
- New props come from the same free CC0 kit already in the game (Quaternius' Toon Shooter Game Kit) or are built in code in the same vertex-coloured style, like the spotter plane. No paid assets.

### Done when

- No web panels remain on the title; every choice is an object in a place; the logo is part of the world; it works with mouse, touch and keyboard.

---

## 6. Moving between choices: one continuous shot, and an intro flight

### The owner's words

> "Anytime the user clicks on any of these action tiles in the title screen its supposed to change the camera view and the new set of action tiles in the games immersive sequence are supposed to show its not supposed to be a dropdown please thats sooo unprofesional and soo bad awful loooking so pleasee pretty pretty pleaseeee lets fix these designs pleaseeeee and improve them"

> "PLEASE PROCEED LET SELECTING OPTIONS IN THE TITLE SCREEN LOOK LIKE ONESHOT WHEN YOU ARE MOVING BETWEEN DIFFERENT SCREENS TOO PLEASE TRY YOUR BEST TO ACHEIVE THE LOOK"

> Intro flight: "YEAH WHY NOT"

### What "one shot" means here

Read as the film technique called a **one-shot** (a "oner"): the camera never cuts. Every change of screen is one continuous camera move through the world, the way the First World War film *1917* follows its soldiers through the trenches in what plays as one long continuous shot. (If the owner meant the video game *OneShot*, this section changes; see "Still open".)

### The map the camera travels

```
                    THE ENEMY LINE  (the three commanders)
      ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~   no man's land   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
                                  ^
                                  |  over the top
    NOTICE BOARD  <-------  THE TRENCH CORNER  (banner, signpost)
    (roll of honour)              |
                                  |  along the trench
    SIGNALS DUGOUT  <---->   THE WAR ROOM   <---->   RADIO POST
    (friends)                (match setup)           (quick match)
```

All places are in the same 3D scene, so the camera can always travel between them.

### The journeys

| Choice | The camera's path |
|---|---|
| **Play the computer** | along the trench into the **war room** (set your orders), then out and **over the top** across no man's land to the **enemy line**, where you pick a commander; the match starts there and the camera flies back to the battle view |
| **Play a friend** | into the **signals dugout**. Open a room: next door to the **war room** for your orders, then back to the telephone, where the code is chalked up. Join: dial the code; the host's orders arrive as a telegram to read before you accept |
| **Quick match** | into the **radio post**; your random orders are on the clipboard and can be changed while the needle searches; when a match is found the camera goes over the top into the supply draw |
| **Roll of honour** | a few steps along the trench to the **notice board** |
| **Field manual** | a push in on the book on the crate, which opens |
| **Back** | the same path in reverse (a back arrow in the corner, and `Esc`) |
| **Into a match, and back** | no cut between the title world and the battle either: the camera travels into the battlefield, and "Back to base" after a match travels back to the trench corner |

### How to make it feel like one take

- **Paths, not jumps**: each journey is a smooth spline through waypoints that clear the props, with gentle ease in and out, about 1.6 to 3 seconds depending on distance.
- **A camera operator's feel**: the camera looks slightly ahead along its path, with the small handheld sway the director already uses, as if carried at walking pace.
- **Foreground wipes**: timber posts, sandbag corners, a hanging lantern or a doorway pass close to the lens as the camera moves, the classic way one-shot films hide their joins.
- **Continuous light and sound**: the same dusk throughout; ambience that changes by place (wind in the trench, a stove in the dugout, static at the radio post) with footsteps and cloth rustle while moving, all synthesised like the game's other sounds.
- **Choices appear on arrival**: a place's objects light up only once the camera settles; clicks during a journey are ignored, except that a second click speeds the journey up (no cut).
- **Reduce motion**: with the system setting on, journeys become short cross-fades (an accessibility exception to the one-shot rule).

### The intro flight (first visit)

- About 8 to 10 seconds, one unbroken take: it starts high over no man's land at dusk, drops low through drifting smoke over the craters and wire, rises over the enemy line, turns back toward our trench, dips over the parapet and settles at the trench corner as the banner unfurls.
- Plays on the first visit in each browser; any click or key skips straight to the end; it can be replayed from the pause menu (request 4).

---

## 7. The losing (and winning) screen is staged in the world

### The owner's words

> "and the losing screen to should be immersed In the game the play again or give up should feel immersed in the game please pretty pretty please"

### Plan

- **The loss happens in the world**: the camera stays on our trench; our soldiers lower their rifles or kneel, a white flag goes up over the sandbags, the enemy cheers across the field, and the ending word is stamped large across the scene like a rubber stamp.
- **The win is the same, reversed**: our squad cheers, the enemy raises the white flag, the stamp reads CRACKED or VICTORY.
- **A win or loss on time** (request 8) gets its own stamp (for example TIME) and the report explains who came closest.
- **The report is paper**: a typed dispatch or telegram ("General cracked your code. 6 volleys fired, 7 enemy soldiers down, 6 of yours lost."), with both codes stencilled on crates or chalked on a board.
- **The choices are objects**: Play again or Rematch as a bugle or field telephone ("Call for reinforcements"); Back to base as the white flag or a signpost pointing home, which starts the one-shot journey back to the trench corner.
- No application-style window, and no "Ceasefire" pill.

---

## 8. Match setup and quick match rules

### The owner's words

> "and more suggestions is setting a game when creating a game let user's choose whether they want powerups to be available in their game or not and how many ranging from 1 to 5 and those games should be timed so they can't play forever document all these suggestive improvements as detailed and helpful as possible please"

> Quick match: "BTW QUICK MATCH RANDOMLY ASIGNS A SETTNG FOR BOTH PLAYERS THEN THE WINNER OF ROCK PAPER SCISORS IS THE SETTINGS THAT APPLY TO THE GAME YOU CAN ALSO ADJUST YOUR SETTINGS AS YOU ARE WAITING FOR ANOTHER PLAYER THAT SELECTED QUICK MATCH STUFF LIKE THAT"

### How matches work today (from `web/src/shared/game.js` and `rules.js`)

- **Supplies** (Recon, Sniper, Smoke) are always on. The rock, paper, scissors draw gives the **winner 3 crates, the loser 2 and the first shot** (`SUPPLIES = { win: 3, lose: 2 }`). One crate per turn; smoke cannot stack.
- **Live timers**: 3 minutes to fill a room, 30 seconds for the draw, 75 seconds to deploy, **60 seconds per turn**. A turn that runs out is a misfire; **three misfires in a row forfeit**. Using a supply extends the turn to at least 20 seconds from then.
- **No limit on the match**: a match ends only on a crack (with the last stand: if the first shooter cracks the code, the second shooter gets one shot to draw level), a player leaving, or three misfires.
- **Against the computer there are no timers at all** (`timers: false` in `web/src/client/net.js`), and `POST /api/solo` counts anything that is not a win as a loss.
- **Quick match** puts two waiting players into a new room with the standard rules (`web/src/worker/lobby.js`). **Rematch** resets the room with the same rules.

### A player's settings ("orders")

In the game's fiction a player's settings are their **orders**, written in the dossier in the war room (or on the clipboard at the radio post).

| Setting | Choices | Standard |
|---|---|---|
| **Recon** | On, Off | On |
| **Sniper** | On, Off | On |
| **Smoke** | On, Off | On |
| **Crates** | 1, 2, 3, 4, 5 (shown only if at least one supply is on) | 3 |
| **Time limit** | 5, 10 or 15 minutes | 10 minutes |

The standard orders reproduce today's game, plus the time limit.

### Crates (decided)

The winner of rock, paper, scissors gets the number of crates in the orders that apply; the loser gets one fewer and fires first.

| Crates | Draw winner | Draw loser (fires first) |
|---|---|---|
| 1 | 1 | 0 |
| 2 | 2 | 1 |
| 3 (standard, today's game) | 3 | 2 |
| 4 | 4 | 3 |
| 5 | 5 | 4 |

- Crates can be spent on any supply that is on; one per turn, as today.
- **All three supplies off**: no crates and no supply icons in the match. The draw still happens, and its prize is the first shot: **the winner fires first**.

### Time limit and turn length (decided)

| Time limit | Time per turn |
|---|---|
| 5 minutes | 30 seconds (decided) |
| 10 minutes | 45 seconds (proposed) |
| 15 minutes | 60 seconds (proposed, today's turn) |

- The match clock starts when the battle starts (after both codes are deployed) and shows in the HUD beside the turn banner (for example "8:42").
- Three misfires in a row still forfeit.
- **Against the computer** the match clock runs, but turns stay untimed, as today.

### When time runs out (decided: closest to cracking wins)

- **The round is finished first**: if the first shooter has fired this round and the second has not, the second still gets their shot; a last stand in progress also finishes.
- If nobody has cracked a code, **the side that came closest wins**, comparing each side's best volley:
  1. more **dead** wins;
  2. then more **injured**;
  3. then the side that reached that volley in fewer shots;
  4. otherwise a **draw** (STALEMATE).
- The report says it plainly: "Time. Your best volley: 2 dead, 1 injured. General's best: 3 dead, 0 injured. General wins on the clock."
- Smoke hides the dead and injured split from the shooter, but the server knows the true values, uses them, and reveals them in the report.

### Whose orders apply, mode by mode

| Mode | Orders | Notes |
|---|---|---|
| **Play the computer** | yours | Set in the war room before you pick a commander. The computer only uses supplies that are on. |
| **Play a friend** | the host's | Set when opening the room. The friend sees them as a telegram before joining. (See "Still open": should the friend bring orders too?) |
| **Quick match** | **the draw decides** | See below. |
| **Rematch** | the same as before | In quick match, see "Still open". |

### Quick match (decided)

1. When you choose Quick match you arrive at the radio post with **random orders** on the clipboard: each supply on or off at random, 1 to 5 crates, 5, 10 or 15 minutes.
2. **While the radio searches you can change any of them.** They lock the moment you are paired.
3. At the start of the match both sides' orders are shown (two dossiers facing each other across the field) and the rock, paper, scissors draw happens.
4. **The winner's orders stand** (stamped "ORDERS STAND") and become the match's rules: its supplies, its time limit and turn length. The winner gets that many crates, the loser one fewer and the first shot (or, if those orders have no supplies, the winner fires first).
5. A drawn throw repeats, as today.

### Solo draws (decided)

- A match against the computer can now end in a draw on time, and it counts as a **solo draw**.
- `POST /api/solo` accepts `win`, `loss` and `draw`; the `players` table gets a `solo_draws` column (added to `schema.sql` for new databases, plus a one-time `ALTER TABLE players ADD COLUMN solo_draws INTEGER NOT NULL DEFAULT 0` on the production database, which touches no existing rows).
- The record on your dog tag shows won, lost and drawn.

### Under the hood (for when building starts)

- **An orders object** stored with each match, for example `{ recon: true, sniper: true, smoke: true, crates: 3, minutes: 10 }`, validated on the server (crates clamped to 1 to 5, minutes one of 5, 10, 15, anything else falls back to the standard).
- **Friend rooms**: `POST /api/rooms` accepts the host's orders; `GET /api/rooms/:code` returns them so the join screen can show them.
- **Quick match**: the lobby keeps each waiting player's orders (sent over the lobby socket and updated while waiting) and passes both to the new room; `resolveRps()` applies the winner's.
- **The draw**: `resolveRps()` hands out crates from the orders that apply and picks the first shooter.
- **Supplies**: `act()` rejects a supply that is off ("Recon is off in this match"); the computer's `choosePower()` only picks supplies that are on.
- **The clock**: `startBattle()` sets the clock's end; `tick()` finishes the round fairly and calls `finish()` with a new reason, `"time"`, using the tiebreak; the turn length comes from the orders. The room's alarm wakes at the earliest of the turn deadline, the clock's end and the room's expiry (today it watches only the first and the last).
- **What the client sees**: `view()` includes the orders and the clock, so the HUD shows the clock and the taskbar shows only the supplies that are on.
- **Records**: the orders go into each match's JSON log (no change to the `matches` table). A win on time counts as a win; "best" (fewest shots to crack) still counts only cracked codes.
- **Tests**: every crate count, each supply switched off and all off, the clock running out before, during and after a round and during a last stand, each tiebreak step, quick match orders chosen by the draw, solo draws, and the alarm schedule.

---

## One visual language for everything in the world

- **Materials**: painted wood, stencilled paint, paper, canvas, brass, and the clay toy look of the soldiers. No glass panels, rounded web cards or operating-system window chrome.
- **Light**: the battlefield's dusk falls on every interface object, with lanterns and flares for emphasis.
- **Type**: in-world lettering is stencilled, painted, chalked, typed or carved; Archivo is for small print and numbers.
- **Colour roles stay**: amber for injured, red for dead, cream for your code, coral for theirs.
- **Motion**: things move physically (planks swing, lids open, flags rise) and the camera never cuts.

## Guardrails

- **Accessibility**: a real HTML control behind every in-world control, a sensible Tab order, a visible focus mark in the scene, labels for screen readers, and "reduce motion" respected.
- **Phones first**: every place framed for portrait too; tap targets at least 44 px.
- **Cost**: free and open assets only (the CC0 kit already used, a free Open Font License stencil face if one is added), the existing three.js scene, no new services. Everything still fits the free Cloudflare plan.
- **Performance**: new props merged and compressed like the existing ones, the trench network kept low-poly with instancing; the frame-rate targets and the black-frame fix stay.

## Build plan (proposed order, once the owner says go)

| Phase | What | Depends on | Size |
|---|---|---|---|
| 1 | **Rules and server**: orders, per-supply switches, crates split, match clock and turn length, time-up tiebreak, quick match orders and the draw, solo draws (schema and API), the computer respecting orders, engine tests | nothing | Medium |
| 2 | **Match screen**: the taskbar of 3D icons, windows with minimise and close, the supply windows, the notebook log (with the numbering fix), taunts, the match clock in the HUD, Pause in the top corner and its menu | 1 | Large |
| 3 | **End of match in the world**: the staged loss and win, the paper report, in-world choices | 2 | Medium |
| 4 | **The trench network**: the trench corner, war room, signals dugout, radio post, notice board and enemy commanders, built from the CC0 kit and code-built props | nothing (can run beside 1 to 3) | Large |
| 5 | **The one-shot title flow**: camera paths, the places' interactions, the hidden accessible controls, the setup dossier, friend rooms, quick match at the radio post, the roll of honour, the intro flight, the journeys into and out of matches | 1 and 4 | Large |
| 6 | **Finish**: portrait framing, accessibility pass, performance budget on phones, updating the browser tests (they click today's menu), deploy | 2 to 5 | Medium |

## Still open

Everything else is decided. These remain, each with a proposed answer:

1. **"One shot"**: read as the continuous single-take camera (like the film *1917*). Did you mean that, or the video game *OneShot*? *Proposed: the single take.*
2. **Turn length for 10 and 15 minute matches**: *proposed 45 and 60 seconds* (5-minute matches are decided at 30).
3. **Friend rooms**: do only the host's orders apply, or does the friend bring orders too, with the draw deciding as in quick match? *Proposed: the host's orders, shown to the friend before joining.*
4. **Quick match rematch**: *proposed: both players keep their own orders (and can change them on the end screen), and a new draw decides again.*
5. **The public repository**: the reference screenshots from Zelda, Cereza and Plants vs. Zombies are in the public repo. Keep them, or remove the three images and keep only their written descriptions?
