# Studio notes: sketches and reviews, phase by phase

The team's working notes for the redesign in [`redesign-requests.md`](redesign-requests.md): the sketch each place or screen was built from, and the review each phase passed before it shipped. Phase 0 is in [`phase0-notes.md`](phase0-notes.md).

## Phase 1: rules and server

Shipped as planned: orders, supply switches, the crates split, the match clock and turn length, closest to cracking at time up, quick match orders chosen by the draw, solo draws. Reviewed by the game designer, gameplay programmer and QA: 37 engine tests, a server test (`test/api.mjs`) against local and live, a clock alarm test, and full matches in the browser.

## Phase 2: the match screen

### Sketch

- **The bar** is a worn wooden plank drawn in 3D under the icons, lit by the same dusk as the field, with rope lashing between the groups and nail heads at the ends. The icons are clay objects: the field gun, the spotter plane, a rifle scope, a smoke canister with its curl, a field notebook with a pencil, a speech bubble, and a small crate beside the supplies with the count painted on. A chalk dash under an icon means its window is open; a lit brass bar means it is in front.
- **Every window is an object**: fire control is a wooden board with round typewriter keys and a red firing button; each supply is a manila dossier with a photograph clipped to it, and the photograph is a live scene (the plane crossing and dropping its flare, a helmet in the scope, a canister rolling out smoke); the log is a leather field notebook with paper index tabs and ruled pages written in pencil and ink; taunts are a message pad of torn slips. Minimise and close are two brass studs.
- **Pause** is a brass stud in the top corner. Its menu is a typed sheet of standing orders on a clipboard.
- **Phones** show one window at a time as a sheet rising from the plank; the plank's width is budgeted so it never runs off the screen from 320 px up.
- **The keypad's keys** were redone after the owner rejected the first version: four designers built it in four directions (vintage typewriter, celluloid and nickel, bakelite field telephone, a steel fire-control panel), three judges scored the renders (bakelite 172, celluloid 165, fire panel 165, typewriter 163), and the winner was refined with the best details of the others: oxblood bakelite keys with stencilled cream numerals in an aged brass switch plate, the code in a brass strip of ivory drums with an amber cursor, and FIRE as a red bakelite key with a pilot lamp, sunk in a brass guard.

### Review

- Art director: every piece is wood, brass, paper or clay, lit by the dusk; nothing reads as a web panel. The end of the match is next (phase 3).
- Game designer: each supply's window says why it cannot go out as its headline; the explanation shrinks to one line once used; supplies that are off leave the bar.
- UX designer: solid states (dimmed clay, a padlock, grey clay), open and in-front markers, labels on hover, focus and long press; phones show one sheet at a time; pause from the corner, Esc or P.
- Cinematographer: the camera's inset is set by the board's size, so opening windows never moves it; the squad stays in view.
- Animation and sound: windows rise out of their icons and sink back; icons lift on hover and the gun pulses on your turn; paper, fold and knock sounds.
- QA: engine, server and browser tests green; phone and desktop screenshots; the bar at 320 to 412 px and every window at 320, 360 and 390 px; keyboard paths with and without reduce motion.
- Accessibility and performance: every icon is a real, labelled button in a sensible Tab order with a visible focus mark; reduce motion honoured; supply previews draw only while their dossier is open.

## Phase 3: the end of the match, staged in the world

### Sketch (art director, UX designer, cinematographer)

- **A loss**: the enemy's code rises out of their trench as today, then the camera comes home and settles low behind our squad. Our soldiers let their rifles drop and go down on one knee with their hands up; a white flag on a stick rises over our sandbags; across no man's land the enemy cheers. The camera cranes up slowly as the flag rises, so the last frame holds our kneeling squad in the foreground, the flag, and the cheering line beyond, with sky left for the stamp.
- **A win** is the same beat turned around: our squad cheers, the enemy kneels and raises the white flag over their parapet, and the camera holds from behind our cheering soldiers looking across at it.
- **A draw** keeps both squads standing, both flags at half mast, smoke drifting across.
- **The stamp**: the ending word (OVERRUN, CRACKED, VICTORY, FORFEIT, STALEMATE, TIME) lands across the sky like a rubber stamp: big, tilted, red ink with a worn edge, landing with a thump and a little overshoot.
- **The report is a telegram**: cream paper strips pasted on a form, typed, with STOP between sentences ("GENERAL CRACKED YOUR CODE STOP 6 VOLLEYS FIRED STOP"). Both codes are stencilled on two little crate labels on the form. A loss or win on time says who came closest and by what.
- **The choices are objects on the plank** the tools sat on during the match: a field telephone to call for reinforcements (play again, or ask for a rematch, which rings until they answer) and a signpost pointing home (back to base). In quick match the telegram also carries your orders, which you can change before calling for a rematch.
- **Framing**: on desktop the telegram sits to one side so the staged ending stays in view; on a phone the ending plays first, then the telegram rises from the plank.

### What was built

- **The stamp** is a real rubber stamp in HTML: the word in stencil type inside a double-ruled frame, red ink worn by a painted mask (gaps, thin patches and scratches), landing with a thump, a little overshoot and a soft ink spread. It sits in the sky, to the left of the telegram on wide screens.
- **The telegram** is typed on pasted strips that come off the tape one after another, each ending in STOP, with both codes on crate labels. A win or loss on time adds each side's best volley. It rises from the plank on an upright phone and stands to the right of the scene on a desktop or a phone on its side; a soft fade at its foot says when there is more to read.
- **The choices** are a field telephone and a signpost on the plank, each with a paper tag on a string. The telephone came out of a design panel (three directions, two judges, one refinement): an olive field case with its magneto bell and crank, and a big bakelite handset that reads as a telephone at 56 px. It rings (two bursts of the bell, then a pause) while a rematch call is waiting, at both ends, and goes dead with a note if the room closes. In quick match the telegram carries your orders, with an Amend link that opens the orders form.
- **Order of events**: the ending plays in full, the stamp lands, and only then does the telegram come, carrying the final count. Leaving or starting a new match ends the sequence at once; a reconnect that missed the end plays it from the state.

### Review

- Art director: the loss, the win and the stalemate are all told by the field itself; the only paper on screen is the telegram and the tags, and the stamp is ink, not a web banner.
- Game designer: the telegram says why the match ended, and on time who came closest and by what; a closed room or a player who left says plainly why there is no rematch.
- UX designer: the telephone and the signpost are real buttons with their labels always on show; focus goes to the telephone when the telegram arrives; the telegram comes first in the Tab order, so amending orders leads straight to the call.
- Cinematographer: on a phone the shots turn to keep the white flag, both squads and the stamp's sky in one frame, and the camera glides up to make room for the telegram instead of jumping.
- Animation and sound: the stamp lands on a thump, the strips type in with a telegraph sounder, the telephone rings with a bell and a crank; under reduced motion the camera cuts, nothing shakes and nothing types.
- QA: two reviewers tried to break it and 19 of their 20 findings were confirmed and fixed (the ending leaking into the menu, a reconnect that never showed the end, the stale battle state during the ending, a telephone that rang forever after the room closed, focus marks, tap sizes, widths from 441 to 555 px, phones on their side). Checked at 320, 360, 390, 441, 480, 520, 600 and 1440 wide and 844 by 390; engine and report tests, and a live two-player match with a rematch.
- Accessibility and performance: the verdict and the report's first line are read out once; the tags and the telegram are text; the telephone and signpost are two merged meshes on the existing icon pass.

## Phase 4: the trench network

### Sketch (environment artist, cinematographer, performance)

- **Where**: a survey of every battle shot, on a desktop and on a phone with the phone's pull-back, found the one region no battle camera ever sees: the left flank behind our line (left of about x -13 at our line, widening further back). The whole network lives there, so no match view changes.
- **How it is built**: the ground there is levelled (`palette.js networkMask`, fading to nothing exactly at the edge of what battle sees) and the trench is built up, breastwork style, rather than dug, since the terrain's metre-wide cells cannot carve a clean trench. Everything is built in code in the soldiers' clay style (the kit's download host was unavailable, and code props cost nothing): stuffed sandbags laid in bond, timber revetments, corrugated iron, duckboards, A-frames, doorways with gas curtains, lanterns with glowing glass.
- **The places**: the trench corner with the title painted on a canvas banner (the skull and the bandage from the logo stamped at its ends) and a signpost of four planks; the notice board on the corner's wall; the communication trench back to the war room (map table, dossier, crates, the three supply tokens, a field clock); a branch to the signals dugout (the field telephone under a chalkboard); the radio post under a sheet of iron with its aerial and clipboard; and on the enemy parapet, for the title only, their three commanders dressed by rank (the Recruit's side cap, the Sergeant's chevrons, the General's peaked cap and star) behind stencilled nameplates.

### What was built

- **The corner**: the banner is a canvas texture on a cloth that sags and ripples (only while the title is up), with the skull and the bandage cropped from the logo images; the signpost's planks share one painted atlas, lettered with the stencil face, and swing when pointed at. Your dog tag hangs on the post, your record is chalked as tallies on the parapet, the field manual is a book on a crate whose cover lifts open, and sound is a field radio on the firestep.
- **The war room** shows the orders as you set them: a stack of one to five toy supply crates on the map and only the tokens of the supplies that are on. **The signals dugout** has the field telephone on a shelf and a chalkboard where a room's code is written in chalk. **The radio post**'s needle sweeps the dial while it searches. **The notice board** carries the roll of honour, typed, with three medals hung from its rail.
- **Cost**: the static trench is one merged mesh plus one for the lanterns' glass. Sandbags and timber are low-poly (a sack is a box with its middle pushed out), which brought the corner from 456 thousand triangles to 117 thousand; every place draws in 28 to 39 calls on a phone and a desktop alike. The battle views are untouched: nothing of the network, the banner or the nameplates is in any of their frames, and the ground under the battle is exactly as it was.

## Phase 5: the title, lived in the trench

### Sketch (UX designer, cinematographer, gameplay programmer)

- **Every choice is an object** in its place, with a real button laid over it each frame (so Tab, screen readers and taps all work); planks carry their own painted words, other objects a paper tag. The web header, the menu cards and the separate wait and search windows are gone.
- **One take**: the camera walks between places along the trench on smooth curves (`director.travel`), looking a little ahead like a walking operator, with the trench's posts and walls passing the lens; a click during a walk hurries it; reduced motion turns walks into short fades. Leaving for a match climbs out over the top into the battle, and Back to base walks back to the corner.
- **Paths**: Play the computer is the war room (your standing orders in the dossier), then over the top to the commanders; a friend's room is opened on the telephone (orders in the war room, then the code chalked up) or dialled, and the host's orders arrive as a telegram to accept; quick match searches from the radio post with random orders on the clipboard, changeable while it searches; the roll of honour is pinned to the notice board; the field manual is the book on the crate, sound is the field radio, your callsign and record are on your dog tag.
- **The first visit** flies in over the field: high over no man's land, low past the commanders, across the wire and over our parapet into the corner. A click or a key skips it; the dog tag replays it.

### What was built

- **The places and their journeys** are as sketched. Every journey is one curve with footsteps on the duckboards; a click hurries it, a resize moves where it ends, and a journey cut short by another (a match found mid-walk) never lays out its place. Leaving for a match climbs out over the top from the place, or from wherever the camera is if it was walking; joining a match already under way (a reload, a reopened link) leaves the title at once, with the commanders stood down.
- **Sound by place**: wind in the open trench, a stove ticking in the dugouts with the wind shut out, static and call signs at the radio post; the banner unrolls with a snap of canvas at the end of the intro.
- **Rooms**: a host's room is only opened if they are still in the dugout when the line comes back; reopening your own room's link takes you straight back into it; declining a friend's telegram leaves your own room open; walking away from the dugout closes it.
- **The field manual** is a push in on the book, which opens before the manual's pages come up; closing it steps back to the corner with the focus on the book again.
- **Places answer back**: a plank pointed at swings once and settles lifted; every plank's and nameplate's button takes the object's own length and angle on screen each frame, and where two overlap the nearer object is on top, so a tap anywhere along a plank opens that plank's way (checked by sampling each plank at 320, 390, 844 by 390, 1024 and 1440 wide). A phone on its side comes closer to the signpost so the painted words read, and its sheets stand at the right with the place moved left of them; on a desktop the place also moves left of an open sheet.

### Review

- Art director: every choice is an object in the world, lettered in paint, chalk or type; the only paper is the sheets, and they are dossiers, notepads, clipboards and telegrams. The war room, the radio and the notice board now show what they are for (the crates, the needle, the medals).
- Game designer: rooms behave: your own room's link takes you back into it, walking away from the dugout closes it, declining a friend's call keeps your room open, a room opened after you left is closed again.
- UX designer: arrivals are read out from one status line; a keyboard or screen reader press carries the focus on to the next place; Esc puts away an open sheet before it walks back; Back comes first in the Tab order and shows its focus; the place note shows on phones again (a pause-menu rule was hiding it).
- Cinematographer: journeys are one curve that a resize redirects instead of cutting; a sheet arriving or leaving glides the view; the field manual is a push in on the book.
- Animation and sound: footsteps on the duckboards, wind, a stove and radio static by place, a canvas snap as the banner unrolls; under reduced motion journeys fade, the camera holds still, the banner and planks do not move, no shells burst on the horizon and the intro is not offered.
- QA: two reviewers found 26 problems; the 12 in the title's logic were each reproduced by a second reviewer and all 26 are fixed (commanders left on the parapet when rejoining a match under way, a walk cut short that left the title busy, a room opened after walking away, a telegram that closed your own room, Enter during the intro pressing a plank, P that could not be typed while hosting, plank buttons that opened the wrong way on a phone on its side, the hidden place note, tags off the edge at the front, the roll's faint ranks, sheets scrolling inside scrollers). New tests cover hosting, rejoining as host and guest, and tap routing; the engine tests, quick match and a live two-player match with a rematch pass. The third reviewer (performance and leaks into the battle) was stopped at the owner's request; its measurements were taken by hand instead (below).
- Performance: every title place draws in 28 to 39 calls and 80 to 118 thousand triangles on a phone and a desktop; the battle views draw nothing of the network.

## Phase 6: the finish

### Sketch (producer, UX designer, accessibility, performance, QA)

- **Framing on every screen**: every title place and every match phase checked at 320 by 568 and 640, 360 by 740, 390 by 844, 412 by 915, phones on their side (667 by 375, 740 by 360, 844 by 390, 932 by 430), 1024 by 768 and 1440 by 900: nothing cut off, nothing scrolling sideways, no paper over the thing it describes. First, the one known blemish: on a phone on its side the place note sits over the banner's pole; on a short screen it moves to whichever top corner the scene leaves clear.
- **Tap sizes**: every control at least 44 px, the planks included (today 25 to 38 px tall on an upright phone): planks on the same side of the post are far enough apart for 44 px areas, so each plank's area grows to 44 px without reaching another's.
- **Accessibility pass**: an automated audit (axe, run from the test tools only, nothing added to the game) of every title place, every match phase, the pause menu and the dialogs; a whole match played with the keyboard alone; names, roles and states on every control; contrast on the paper tags; reduced motion.
- **Performance budget on phones**, measured on a 390 by 844 phone with the processor slowed four times: at most 50 draw calls and 150 thousand triangles in any view, the canvas textures under 8 MB, the scene's per-frame script under 2 ms, the trench built in under a third of a second, and the download unchanged within 5%. Anything over is cut down (smaller canvases on phones first).
- **Tests**: the hosting, rejoining and tap tests written in phase 5 join the repository's browser tests, and the README says how to run them.

### What was built

- **Phones on their side**: the place note moves to the top left on a short screen, clear of the banner, after Back when there is one; the corner comes closer to the signpost so its painted words read; sheets stand at the right, sized to what is on them, and take no taps when none is open. Notched phones keep every edge control out of the notch on either side (the header, the match's windows, the telegram, Back, the sheets).
- **Tap sizes**: every plank's button grows to the full 44 px without reaching another plank's; small objects (the dog tag on the post) stay above the planks' buttons; on touch screens the match's window buttons, notebook tabs, taunts and pause menu options are 44 px too, and the digit pickers keep 44 px on the narrowest phones.
- **Accessibility**: an axe audit of every title place, every match phase, the pause menu and the dialogs, on a desktop and a phone, is clean; the way in is a named landmark, the roll of honour can be scrolled from the keyboard, and the callsign on the dog tag is inked in blue stencil (it was near white on the paper). A whole match can be started from the keyboard alone.
- **A win is stamped in green**, a loss or a draw still in red.
- **Performance on a phone with the processor slowed four times**: at most 39 draw calls and 122 thousand triangles in any view, 7.8 MB of canvas textures (the banner and the nameplates are painted at half size, which no screen can tell apart), and 1.4 ms of the scene's own script a frame. The sandbags, 85% of the trench's shape, are one instanced mesh instead of 1,500 merged copies, and the trench's other pieces are built once per size and copied.
- **Framing**: the enemy commanders' tags hang at two heights on the narrowest phones so they never touch, the opponent's name in the match header has room on a phone, and the dog tag no longer pushes the corner sideways.

