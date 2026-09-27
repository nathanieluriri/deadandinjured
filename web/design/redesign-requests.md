# Dead & Injured: redesign requests

Collected from the owner's correction messages on 27 September 2026. **Nothing in this document has been built yet.** The owner asked to wait for the complete list of corrections before any change is made, so this is a record of what was asked, what it means, how it could work, and what still needs an answer.

The screenshots and their detailed descriptions are in [`references/`](references/).

## The requests at a glance

| # | Request | Screens | Type |
|---|---|---|---|
| 1 | The bottom controls become a taskbar of 3D icons, with windows that minimise and close | [04](references/04-windows-taskbar.md) | Match UI |
| 2 | The fire log can be hidden (a minimise button) | [02](references/02-fire-log-window.md) | Match UI |
| 3 | The supplies become three 3D icons: click to learn about one and use it | [01](references/01-supply-cards-faded.md), [03](references/03-supply-cards-no-crates.md) | Match UI |
| 4 | Leave and Field manual are replaced by one Pause button and a pause menu | [05](references/05-leave-and-manual-buttons.md) | Match UI |
| 5 | The title screen belongs to the game's world, like the references | [06](references/06-title-screen-current.md), [07](references/07-title-zelda-breath-of-the-wild.md), [08](references/08-title-cereza-and-the-lost-demon.md), [09](references/09-menu-plants-vs-zombies.md) | Title |
| 6 | Choosing an option moves the camera to a new scene with the next choices; no dropdowns | [11](references/11-menu-dropdown-play-the-computer.md), [12](references/12-menu-dropdown-play-a-friend.md) | Title |
| 7 | The losing screen (and so the winning one) is staged in the world, with in-world choices | [10](references/10-defeat-screen-current.md) | End of match |
| 8 | When creating a game: supplies on or off, 1 to 5 of them, and a time limit so matches end | none | Game rules |

The owner's words are quoted exactly under each request.

---

## 1. The bottom controls become a taskbar of 3D icons

### The owner's words

> "only 3d icons should show I want the options at the bottom instead of a tab I want them to be like this windows task bar Just icons so they can be minimized nicely and also closed"

### What it means

- Replace today's bottom switcher (a sliding tab control labelled **Aim**, **Supplies**, **Log**, plus a taunt button) with a row of **icons only**, like the Windows taskbar in screenshot 04.
- The icons are **3D**: small objects in the game's clay toy style, not flat line icons.
- Each icon opens a **window** (the keypad, the supplies, the log). A window can be **minimised** back into its icon or **closed**.
- Open windows are marked on the bar, the way Windows puts a small pill under an open app.

### Today

- `#switchRow` holds `#switch` (a `role="tablist"` with three tabs and a sliding thumb) and `#tauntBtn`. Only one pane shows at a time; on desktop the log is not a tab but a fixed side window.
- Code: `web/src/client/index.html` (`.dock`, `.panes`, `#switch`), `web/src/client/style.css` (`.switch`, `.thumb`, `.pane`), `web/src/client/match.js` (`pane()`, `thumb()`, `fitPanes()`).

### Proposal

A small bar centred at the bottom of the match screen:

```
+----------------------------------------------------------------------+
|  You ##          YOUR SHOT          Recruit ###              [ || ]  |
|                                                                      |
|                        (the 3D battlefield)                          |
|                                                                      |
|            +--------------------------------------+                  |
|            | Keypad                       [_] [x] |                  |
|            |  1 2 3 4 5 6 7 8 9 0   <-   FIRE     |                  |
|            +--------------------------------------+                  |
|                                                                      |
|              [keypad]  [crate 2]  [notebook]  [bubble]               |
|                 ==          =                                        |
+----------------------------------------------------------------------+
   == the focused window's marker        = an open but unfocused window
```

- **Icons** (proposed objects, all to be confirmed):
  - **Aim**: a field gun or a brass keypad.
  - **Supplies**: a wooden supply crate, with the number of crates left as a small stencilled badge.
  - **Log**: a field notebook or a clipboard of dispatches, with a dot when new volleys arrive while it is minimised.
  - **Taunt**: a speech bubble or a megaphone.
- **Behaviour**, copied from the taskbar:
  - Click an icon: its window opens, rising out of the icon.
  - Click the icon of the window in front: the window minimises back into the icon.
  - Each window has a title bar with **minimise** and **close** buttons that really work (unlike today's decorative dots).
  - **Minimise** keeps the window's state (typed digits, a chosen supply) and keeps its marker on the bar. **Close** hides the window and resets it.
  - A short marker under an icon means "open"; a longer, brighter one means "in front".
- **Desktop**: several windows can be open together (for example the keypad and the log). They sit at fixed, tidy positions (keypad above the bar, log on the left, supplies above the bar in place of the keypad) rather than being freely dragged, so nothing can be lost off screen. Their open or closed state is remembered between matches.
- **Phones**: one window at a time, as a sheet that slides up from the bar; opening another replaces it.
- **Keyboard**: number keys still type into the keypad even when it is minimised (it opens itself); `A`, `S`, `L` toggle the three windows; `Esc` minimises the window in front, and opens the pause menu when nothing is open.
- **Reminder**: when it is your turn and the keypad is closed, the Aim icon pulses (this joins the existing idle reminder).
- **3D icons, cheaply**: the game already renders an overlay scene on top of the field (`stage.overlay`, used by the 3D logo stamps). The icons can be real 3D objects in that overlay, so they turn slightly on hover, using a handful of extra draw calls and no new image files. If that ever costs too much on slow phones, the same objects can be rendered once at load into small images.
- **Labels**: no visible text on the bar; each icon gets a tooltip on hover (desktop), a label on long press (phone) and an `aria-label` for screen readers.

### Open questions

- Should the keypad be closable at all during your turn, or only minimisable?
- Which objects for the four icons (the proposals above, or others)?
- Should the bar also hold the pause button, or should pause stay in the top corner (request 4)?

### Done when

- The bottom of the match screen shows only the icon bar and whatever windows are open.
- Every window can be minimised and closed, markers show what is open, and state survives a minimise.
- It works with mouse, touch and keyboard, on phones and on desktop.

---

## 2. The fire log can be hidden

### The owner's words

> "the logs should be able to be hidden if the user wants there should be a minimize button or something"

### What it means

The log window (screenshot 02) is always open on desktop and covers the left side of the field. It needs a way to put it away.

### Today

- On desktop, `.log-pane` is `position: fixed` on the left and cannot be hidden. On phones it is the Log tab.
- The window has three coloured dots that look like window controls but do nothing.

### Proposal

- The log becomes one of the taskbar windows from request 1: minimise sends it into the notebook icon, close hides it and resets its scroll, and the icon brings it back.
- While minimised, new volleys show as a small count on the notebook icon (for example "2"), cleared when the log opens.
- Keep the three views (Your fire, Their fire, Compare) and the remembered choice.
- Restyle it as an object from the world (a field notebook or a clipboard of dispatches) instead of a code editor window named "fire.log".
- Two small fixes to carry along:
  - **Numbering bug**: the list skips numbers because supply rows are counted (`.log li::before` increments the counter on every row, including `.log li.power`). Volleys should be numbered 1, 2, 3 with supply rows marked "+".
  - **Scrollbar**: the default grey scrollbar with arrow buttons should be replaced by a thin styled one.

### Done when

- The log can be minimised and closed on every screen size, comes back from its icon, and shows unread volleys while hidden.

---

## 3. The supplies become three 3D icons

### The owner's words

> "I want the supplies to be 3 3d Icons Click to learn about it and use it that kinda thing you get Nice beautiful UI"

### What it means

- Today the Supplies tab shows three text-heavy cards at once, and they turn see-through when you cannot use them (screenshots 01 and 03).
- Instead: **three 3D objects**, one per supply. Clicking one explains it and lets you use it.

### Proposal

- **The three objects**:
  - **Recon**: the spotter plane (the model already exists in `web/src/client/scene/plane.js`).
  - **Sniper**: a rifle with a telescopic sight, or the scope alone.
  - **Smoke**: a smoke canister or grenade with a wisp of smoke.
- **The Supplies window** (from the crate icon in request 1) shows the three objects side by side on a crate lid or a tray, with the crate count.
- **Hover** (desktop): the object turns and lifts, and its name appears.
- **Click**: a small panel opens for that supply only:
  - its name and a two-line explanation, with a short looping preview (the plane crossing, the scope's crosshair, smoke rolling);
  - its picker: a digit for Recon; a digit and a soldier for the Sniper; nothing for Smoke;
  - its action button ("Send the plane", "Take the shot", "Pop smoke").
- **Choosing the sniper's soldier in the world**: besides the four spot buttons, the player can click an enemy soldier on the field directly; the red targeting ring (already built) marks him.
- **Clear states instead of transparency**:
  - available: full colour, crate count shown;
  - not your turn: dimmed clay with the reason as the panel headline ("Supplies go out on your turn");
  - already used this turn: a small padlock ("One crate a turn");
  - no crates left: grey clay and an empty crate ("No crates left").
- **Progressive detail**: the first time a player opens a supply the full explanation shows; after they have used it once, the explanation shortens to one line.

### Done when

- The Supplies window shows three 3D objects, never a wall of text; each opens a focused panel; unavailable states are solid and explained; the whole flow works on a phone with one thumb.

---

## 4. One Pause button instead of Leave and Field manual

### The owner's words

> "noo need for these two we need one Pause button instead that opens a menu having quit game and manual and other stuff like that"

### Proposal

- **One button** with a pause icon in the top right corner of the match (and `Esc` or `P` on a keyboard). The sound button folds into the menu too, leaving the corner almost empty.
- **The pause menu**, styled from the game's world (for example a field notebook or an orders sheet sliding over a dimmed field):
  - **Resume**
  - **Field manual** (the rules, the legend, the example, the supplies)
  - **Sound**: effects and music (today there is a single on/off toggle)
  - **Graphics**: Auto, Sharp or Fast (the renderer already adapts its resolution; this lets a player cap it)
  - **Quit game** (today's Leave), with the existing warning in a live match: "Leaving now hands the win to your opponent."
- **Against the computer**, Pause really freezes the match: the animations, the effects and the computer's thinking all stop until Resume. (The computer's moves are scheduled with timers in `web/src/client/net.js`, so those timers need pausing too.)
- **In a live match** the opponent's clock cannot stop. The menu opens over a still-running game and says so, and shows the turn timer inside the menu so the player cannot lose a turn by accident.

### Done when

- The match screen has one pause control; the menu covers quitting, the manual and settings; pausing against the computer freezes everything; live matches warn that the clock keeps running.

---

## 5. A title screen that belongs to the game's world

### The owner's words

> "I want to improve the title screen the current TITLE screen is kinda trash and AI like see a good example of a title screen see how immersed In the games graphics and universe it doesn't look out of place it looks like part of the game sef THe graphics The controls everything Looks like part of the game perfectly in sync which is what I want please"

### What the references teach

- **Breath of the Wild** (07): the hero stands in the world, looking at the adventure; the menu is a few words of quiet type in empty sky, selected with a small in-world glyph; the logo carries an object from the world (the sword).
- **Cereza and the Lost Demon** (08): the whole title screen is one object from the story (the book); starting is opening it; the only interface is a tiny button prompt.
- **Plants vs. Zombies** (09): every control is an object from the world, chosen to match its meaning (modes on a tombstone, options in flower pots, the shop as a car key), all in the gameplay's own art style.

### Proposal: the trench is the menu

- **The opening shot**: dusk, close on one soldier of the player's squad at the parapet, seen from behind or three-quarters, looking across no man's land at the enemy line; smoke on the horizon; the soldiers idle and breathe.
- **The title belongs to the world**: stencilled across the side of a big supply crate, or painted on a canvas banner strung between two posts, or on a wooden trench sign, lit by the dusk and by a lantern; no floating 3D letters.
- **The main choices are objects**, for example planks nailed to a wooden signpost at the trench corner, each plank a choice, in stencilled paint:
  - **Play the computer**
  - **Play a friend**
  - **Quick match**
  - **Roll of honour** (today's Leaderboard)
- **The player is in the scene**: the callsign stamped on a dog tag hanging from the signpost ("Welcome back, nattyboi"), the record as tally marks scratched on a sandbag or a medal ribbon, signing in and out by clicking the dog tag.
- **Everything else is an object too**: the Field manual is a book on a crate; sound is a field radio or a gramophone; quitting to the landing page is not needed (the browser does that).
- **Selection** uses the world: hovering a plank lights it with the lantern or swings it slightly; the chosen one gets a small in-world marker, never a box.
- **Type**: in-world lettering is stencilled or painted (a free stencil typeface under the Open Font License, loaded only for the title, or letters drawn onto textures at load). The interface font (Archivo) stays for small print only.

### Accessibility and practical notes

- The 3D objects are clicked by raycasting the scene; a hidden layer of real HTML buttons mirrors them in the same order, so keyboard users can Tab through and screen readers can read them.
- Tap areas on phones are at least 44 px, larger than the objects where needed.
- A "reduce motion" setting (and the system setting) replaces camera flights with quick fades.
- New props should come from the same free kit already used (Quaternius' Toon Shooter Game Kit, CC0) or be built in code in the same vertex-coloured style, so no paid assets and little extra download.

### Open questions

- Which frame do you prefer for the title: a signpost in the trench, a crate, a banner, or a Cereza-style object (a war-room dossier on a map table that opens into the menu)?
- Should the title screen play a short intro (the camera sweeping over the field) the first time only?

### Done when

- No web-style panels, lists or chevrons remain on the title screen; every choice is an object in the scene; the logo is part of the world; the screen works with mouse, touch and keyboard.

---

## 6. Choosing an option moves the camera; no dropdowns

### The owner's words

> "Anytime the user clicks on any of these action tiles in the title screen its supposed to change the camera view and the new set of action tiles in the games immersive sequence are supposed to show its not supposed to be a dropdown please thats sooo unprofesional and soo bad awful loooking so pleasee pretty pretty pleaseeee lets fix these designs pleaseeeee and improve them"

### What it means

- Today, "Play the computer" and "Play a friend" open accordion dropdowns under their rows (screenshots 11 and 12).
- Instead, each choice is a **move to a new place** in the world, where the **next choices** appear as part of that place. Back returns the camera.

### Proposal: a sequence of camera stations

The camera director already flies between named shots (`web/src/client/scene/director.js`), so each station is a new shot plus a few props.

| Choice | The camera goes to | The next choices there |
|---|---|---|
| **Play the computer** | across no man's land to the enemy trench | The three enemy commanders stand at the parapet, each a toy soldier with rank insignia: **Recruit** (one chevron, "Fires half blind"), **Sergeant** (two chevrons, "Never wastes a shot"), **General** (stars, "Reads every volley"). Hover: he steps forward or salutes. Click: the match begins and the camera flows straight into the supply draw. |
| **Play a friend** | a signals dugout: a field telephone, a radio set and a chalkboard | **Open a room**: crank the field telephone. First the match setup (request 8), then the room code appears chalked on the board or on a dog tag, with **Share the link**. **Join a room**: dial the friend's five-character code on the telephone's rotary dial or a row of stencilled tiles; the keyboard types straight into it. |
| **Quick match** | the radio operator's post | The radio needle sweeps the band while searching (replacing today's search card); "Play the computer instead" and "Cancel" are switches on the set. |
| **Roll of honour** | a notice board in the dugout | The leaderboard pinned up as a sheet of names with medals. |
| **Field manual** | a book on a crate | The book opens, and its pages turn for the rules. |

- **Back**: a small back control in the corner (and `Esc`) flies the camera back to the previous station.
- **No accordions, lists or form rows anywhere** in this flow. The one place text must be typed (a room code) is shown as an in-world dial or tiles, backed by a hidden text input so typing, pasting and phone keyboards still work.
- **Timing**: flights of about 0.8 to 1.2 seconds, with the choices fading in as the camera settles; any click during a flight is ignored.

### Done when

- Every title choice changes the camera and shows its next choices in the scene; no dropdown or accordion remains.

---

## 7. The losing screen (and the winning one) is staged in the world

### The owner's words

> "and the losing screen to should be immersed In the game the play again or give up should feel immersed in the game please pretty pretty please"

### Today

- The camera pulls far back, a small pale 3D word (OVERRUN) floats above the hills, and a dark application-style window ("after.action", with fake macOS dots) reports the result and offers **Play again** and **Back to base** (screenshot 10). The player's squad is hidden behind that window.

### Proposal

- **Stage the loss**: the camera stays on the player's trench. The soldiers lower their rifles or kneel, a white flag goes up over the sandbags, and across the field the enemy squad cheers and waves. The ending word is stamped large across the scene, like a rubber stamp.
- **Stage the win the same way**, reversed: the player's squad cheers, the enemy raises the white flag, the stamp reads CRACKED or VICTORY.
- **The report is an object**: a typed dispatch or telegram on paper ("General cracked your code. 6 volleys fired, 7 enemy soldiers down, 6 of yours lost."), with both codes stencilled on crates or chalked on a board in the scene.
- **The choices are objects**:
  - **Play again** (against the computer) or **Rematch** (live): a bugle or a field telephone: "Call for reinforcements".
  - **Back to base** (the "give up" option): the white flag, or a signpost pointing back to base.
- The HUD's "Ceasefire" pill goes, since the scene says it.

### Done when

- The end of a match is shown in the world, both the result and the choices; no application-style window remains.

---

## 8. Match setup: supplies and a time limit

### The owner's words

> "and more suggestions is setting a game when creating a game let user's choose whether they want powerups to be available in their game or not and how many ranging from 1 to 5 and those games should be timed so they can't play forever document all these suggestive improvements as detailed and helpful as possible please"

### How matches work today (from `web/src/shared/game.js` and `rules.js`)

- **Supplies** (the power-ups: Recon, Sniper, Smoke) are always on. A rock, paper, scissors draw at the start decides them: the **winner gets 3 crates, the loser 2 and the first shot** (`SUPPLIES = { win: 3, lose: 2 }`). One crate can be spent per turn; smoke cannot be stacked.
- **Timers in live matches**: 3 minutes to fill the room, 30 seconds for the draw, 75 seconds to deploy a code, **60 seconds per turn**. A turn left to run out becomes a misfire (a wasted shot), and **three misfires in a row forfeit the match**. Using a supply extends the turn to at least 20 seconds from that moment.
- **No limit on the match itself**: as long as each player fires within 60 seconds, a match can go on for any number of rounds. It only ends when a code is cracked (with the last-stand rule: if the first shooter cracks the code, the second shooter gets one last shot to draw level), when someone leaves, or after three misfires in a row.
- **Matches against the computer have no timers at all** (`timers: false` in `web/src/client/net.js`).
- **Quick match** creates a room with the standard rules for both players (`web/src/worker/lobby.js`).
- **Rematch** resets the match in the same room with the same rules.
- **Records**: each finished live match is stored in the `matches` table (winner, reason, number of volleys, start and end times, and a JSON log). Wins, losses, draws, kills and "best" (fewest shots to crack a code) are kept per player.

### The three new settings

When a player **opens a room** (Play a friend), they set up the match before the room code is shown:

| Setting | Choices | Default | Meaning |
|---|---|---|---|
| **Supplies** | On, Off | On | Whether Recon, Sniper and Smoke exist in this match at all |
| **Crates** | 1, 2, 3, 4, 5 | 3 | How many supplies each side can spend (shown only when Supplies is On) |
| **Time limit** | 5, 10 or 15 minutes | 10 minutes | How long the battle may last before it is decided |

The defaults reproduce today's game, plus the new time limit.

#### Crates: how the number is shared out

Two sensible rules; one needs choosing:

- **A. Keep the draw's reward (recommended)**: the winner of rock, paper, scissors gets the chosen number, the loser gets one fewer and fires first. With 3 this is exactly today's game (3 and 2). With 1, the winner gets one crate and the loser gets none but shoots first.
- **B. Equal crates**: both sides get the chosen number and the draw only decides who fires first. Simpler to explain, but the draw matters less.

#### Supplies off

- No crates, no supply icons in the match, no supply rows in the log, and the manual's supplies page says they are off for this match.
- The rock, paper, scissors draw stays (it is a good moment), but its prize becomes the first shot: **the winner fires first**.

#### Time limit: what happens when time runs out

- The clock starts when the battle starts (after both codes are deployed) and is shown in the HUD next to the turn banner (for example "8:42").
- The per-turn limit of 60 seconds stays, so nobody can stall inside the match clock.
- **Fair ending**: when the clock reaches zero, the current round is finished first. If the first shooter has fired this round and the second has not, the second shooter still gets their shot (the same fairness idea as the last stand). A last stand in progress also finishes.
- **Who wins** if nobody has cracked a code by then: **the side that came closest**, compared on each side's best volley:
  1. more **dead** in their best volley wins;
  2. if equal, more **injured** in that volley wins;
  3. if still equal, the side that reached that volley in fewer shots wins;
  4. if still equal, the match is a **draw** (STALEMATE).
- The end screen explains it plainly: "Time. Your best volley: 2 dead, 1 injured. General's best: 3 dead, 0 injured. General wins on the clock."
- Smoked volleys: smoke hides the split between dead and injured from the shooter, but the server knows the true values and uses them; the end screen reveals them.
- A player who cracks the code before the time is up wins as today.

### Where each setting applies

| Mode | Settings |
|---|---|
| **Play a friend, Open a room** | The host chooses. The joining player sees the rules before and after joining ("Supplies on, 3 crates, 10 minutes"). |
| **Rematch** | Keeps the same rules. |
| **Quick match** | Standard rules for everyone (Supplies on, 3 crates, 10 minutes), so strangers always play the same game. |
| **Play the computer** | Proposed: the same setup step after choosing a commander, pre-set to the standard rules, so a player can practise without supplies or against the clock. The computer already only uses supplies it has. |

### What this changes under the hood (for later)

- **Rules object** stored with the match, for example `g.rules = { supplies: true, crates: 3, minutes: 10 }`, created by `newGame()` and validated on the server (crates clamped to 1 to 5, minutes one of 5, 10, 15, anything else falls back to the defaults).
- **Opening a room**: `POST /api/rooms` accepts the three settings; `Room.init()` stores them.
- **Peeking at a room**: `GET /api/rooms/:code` also returns the rules, so the join screen can show them before joining.
- **The draw**: `resolveRps()` hands out crates from the rules (rule A or B) or none when supplies are off, and picks the first shooter accordingly.
- **Supplies**: `act()` rejects any supply when supplies are off ("Supplies are off in this match").
- **The clock**: `startBattle()` sets `g.clockEnds = now + minutes`; `tick()` checks it, finishes the round fairly and calls `finish()` with a new reason, `"time"`, and the winner from the best-volley comparison. The Room's alarm must wake at the earliest of the turn deadline, the clock end and the room's expiry (today it only watches the first and the last).
- **What the client sees**: `view()` includes the rules and `clockEnds`, so the HUD can show the clock, and the supply icons can hide when supplies are off.
- **Solo matches**: `LocalMatch` passes the same rules; the match clock runs even though the per-turn timers stay off against the computer.
- **Records**: the rules go into the match's JSON log (no database change needed). A win on time counts as a win; "best" (fewest shots to crack) still only counts codes actually cracked.
- **Tests**: engine tests for every crate count under both rules, supplies off, the clock running out before, during and after a round, each tiebreak step, and the alarm schedule.

### How the setup could look (in the immersive flow of request 6)

In the signals dugout, before the room code appears:

- **Supplies**: a supply crate on the table: lid open means On, lid shut means Off.
- **Crates**: one to five small crates stacked beside it; click to add or remove one (with plus and minus for keyboard and screen readers).
- **Time limit**: a field clock or pocket watch with three settings (5, 10, 15 minutes); the hands swing to the chosen time.
- **Open the room**: crank the field telephone; the code appears on the chalkboard.

### Open questions for the owner

1. Crates: rule A (the draw winner gets the number, the loser one fewer and the first shot) or rule B (both get the same)?
2. Time limits: are 5, 10 and 15 minutes the right choices, and should "no limit" never be offered?
3. At time up: is "closest to cracking wins" (best volley) the rule you want, or do you prefer something else, such as sudden death (the next volley that beats the other side's best wins)?
4. Should the per-turn limit shrink for short matches (for example 30 seconds per turn in a 5-minute match)?
5. Should matches against the computer get the same setup step?
6. Should the host also be able to switch off individual supplies (for example no Sniper)?

---

## One visual language for everything in the world

These apply to every request above:

- **Materials**: painted wood, stencilled paint, paper, canvas, brass and the same clay toy look as the soldiers; no glass panels, no rounded web cards, no macOS window chrome.
- **Light**: the same dusk light as the battlefield falls on the interface objects, with lanterns or flares for emphasis.
- **Type**: in-world lettering is stencilled, painted, typed on paper or carved; the Archivo interface font is kept for small print and numbers.
- **Colour**: the existing roles stay (amber for injured, red for dead, cream for your code, coral for theirs) so the game's meaning does not change.
- **Motion**: things in the world move physically (planks swing, lids open, flags rise); camera moves are smooth and short; everything respects "reduce motion".

## Guardrails

- **Accessibility**: every in-world control has a real HTML button behind it in a sensible Tab order, a visible focus state in the scene, and a label for screen readers.
- **Phones first**: every station is framed for portrait screens too; tap targets are at least 44 px.
- **Cost**: free and open assets only (the CC0 kit already in use, free fonts under the Open Font License if a stencil face is added), built in the existing three.js scene; no new services.
- **Performance**: new props are merged and compressed like the existing ones; icons and title objects add only a few draw calls; the frame-rate targets and the black-frame fix stay in place.

## All open questions in one place

1. Taskbar icons: which objects for Aim, Supplies, Log and Taunt? Can the keypad be closed during your turn?
2. Pause: in the top corner, or on the taskbar?
3. Title frame: a signpost, a crate, a banner, or a dossier on a map table?
4. A first-time intro flight over the field on the title screen?
5. Crates: rule A or rule B?
6. Time limits: 5, 10 and 15 minutes? Never "no limit"?
7. Time up: best volley wins, or sudden death?
8. Shorter turns in short matches?
9. Match setup against the computer too?
10. Allow switching off individual supplies?

The owner said more corrections are coming; this document will be updated with them before any work starts.
