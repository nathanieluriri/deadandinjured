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
- **The keypad's keys** were redone after the owner rejected the first version: four designers built it in four directions (vintage typewriter, celluloid and nickel, bakelite field telephone, a steel fire-control panel), three judges scored the renders, and the winner was refined with the best details of the others.

## Phase 3: the end of the match, staged in the world

### Sketch (art director, UX designer, cinematographer)

- **A loss**: the enemy's code rises out of their trench as today, then the camera comes home and settles low behind our squad. Our soldiers let their rifles drop and go down on one knee with their hands up; a white flag on a stick rises over our sandbags; across no man's land the enemy cheers. The camera cranes up slowly as the flag rises, so the last frame holds our kneeling squad in the foreground, the flag, and the cheering line beyond, with sky left for the stamp.
- **A win** is the same beat turned around: our squad cheers, the enemy kneels and raises the white flag over their parapet, and the camera holds from behind our cheering soldiers looking across at it.
- **A draw** keeps both squads standing, both flags at half mast, smoke drifting across.
- **The stamp**: the ending word (OVERRUN, CRACKED, VICTORY, FORFEIT, STALEMATE, TIME) lands across the sky like a rubber stamp: big, tilted, red ink with a worn edge, landing with a thump and a little overshoot.
- **The report is a telegram**: cream paper strips pasted on a form, typed, with STOP between sentences ("GENERAL CRACKED YOUR CODE STOP 6 VOLLEYS FIRED STOP"). Both codes are stencilled on two little crate labels on the form. A loss or win on time says who came closest and by what.
- **The choices are objects on the plank** the tools sat on during the match: a field telephone to call for reinforcements (play again, or ask for a rematch, which rings until they answer) and a signpost pointing home (back to base). In quick match the telegram also carries your orders, which you can change before calling for a rematch.
- **Framing**: on desktop the telegram sits to one side so the staged ending stays in view; on a phone the ending plays first, then the telegram rises from the plank.
