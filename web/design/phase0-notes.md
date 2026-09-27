# Phase 0: what the references teach, role by role

Written before any redesign code, after opening every image in [`references/`](references/) at full size and zooming into its regions. The images stay where they are; this file only records what the team took from them.

## What the descriptions missed

- **07 (Breath of the Wild)**: the menu type is *italic*, thin and slightly condensed, which gives it motion without weight. The logo letters are weathered at the edges like old stone, and a small flower ornament sits in the Z beside the sword. The pointer is the same ivory as the logo, so the selection mark and the brand share one material.
- **08 (Cereza)**: the gold title is embossed, so it throws a small shadow on the cloth; the emboss is what makes it read as printed on the object rather than laid over it. The two button glyphs are shaped like the physical shoulder buttons (rounded tops), so even the prompt is a picture of a real object.
- **09 (Plants vs. Zombies)**: the mode names are *carved into* the slabs (dark letters with a lighter bevelled lip), not painted on. The slabs overlap like loose stones pushed out of the grave, each at its own angle, with cracks running across letters. Every object has the same thick dark outline, which is what binds them into one style. The name on the welcome sign sits on a darker inset plank, so the personal part is framed separately from the greeting.
- **04 (taskbar)**: every icon sits in an identical square cell with identical optical weight, so twelve different pictures still read as one calm row. The markers are the only moving part.
- **Current screens**: every listed problem was reproduced in the current build on 27 September 2026 (see QA below).

## Art director

- **One world, one light.** 07 works because the menu sits in the calm part of the same sky the hero looks at; 08 because the title is lit by the same warm side light as the table. Our rule: every interface object is lit by the dusk key light (warm, low, from the left) with cool fill in the shadows, and lanterns only where the fiction has one.
- **Hierarchy by size and position, never by boxes** (09): the most used choice is the biggest object, the rarest the smallest.
- **Materials**: painted wood with worn edges, stencilled paint, paper (cream, typed, stamped), canvas, brass, clay. No glass, no rounded web cards, no drop shadows that float.
- **Type**: Stardos Stencil (OFL) for anything painted or stencilled; Courier Prime (OFL) for anything typed on paper; Caveat (OFL) for chalk and pencil; Archivo only for numbers and small print. All self-hosted (the CSP allows fonts from our own origin only).
- **The logo carries an object** (07): the title is painted on a canvas banner strung across the trench, with the skull and bandage from the game's own logo as the stamps on it.
- **Colour roles stay**: amber for injured, red for dead, cream for your code, coral for theirs. One complementary accent per frame (07's red haze): for us, the red of the enemy line.

## Game designer

- 09 shows that each control must *mean* its action: a watering can for the garden, a key for the shop. For us: a field gun fires, a plane spots, a scope snipes, a cloud hides, a notebook remembers, a speech bubble talks. The rules are explained by the objects themselves; the field manual is a book, the orders are a dossier, a friend's orders arrive as a telegram.
- The personal line on 09's sign (the player's name, the level plaque) is where our record goes: the dog tag carries the callsign, the sandbag carries the tally.

## UX designer (diegetic interfaces)

- **Selection** (07): brighter plus one small in-world mark beside the item. Our mark: a lantern glow on the hovered plank and a chalk tick or a pencil circle on the chosen one. Never a box.
- **States** (04): open is a short mark under the icon, in front is a longer brighter mark. Disabled is solid (dimmed clay, padlock, grey clay), never see-through (01, 03).
- **One thing at a time**: 01 and 03 fail because everything is on screen at once. Each window holds one tool; the reason something is unavailable is the window's headline (03).
- **Accessibility**: every in-world control has a real HTML button in the same place and the same order, so Tab, Enter and screen readers work, and the focus ring is drawn as a world mark (a chalk ring or lantern glow).

## Cinematographer

- 07 frames the hero from behind, on the left third, looking where the player is about to go; the eye loops hero, goal, logo, menu. Our trench corner frames one of our soldiers from behind at the parapet, the enemy line beyond, the banner above and the signpost in the calm right third.
- 08 is a top-down still life with shallow depth; the war room dossier on the map table uses the same angle.
- The one-shot rule: the camera never cuts. Journeys are splines at walking pace with a slight lead of the look ahead of the position, a little handheld sway, and foreground wipes past timber posts and sandbag corners.

## Environment artist

- 09's backyard is the same place you defend in play. Our title world is the same field, behind our own line: a communication trench of duckboards, timber revetments and sandbags, with dugouts cut into it.
- Build from what exists: the CC0 kit props already in `models/props.glb` (sacks, crates, barrels, pallets, medkit, gas can, debris, tank, mine), and code-built props in the same vertex-coloured style as `plane.js`.

## 3D and technical artist

- The icons and props are small vertex-coloured meshes merged per object, lit by the same lights as the field, so they cost one draw call each and no textures except painted lettering.
- Lettering in the world is drawn once onto canvas textures with the self-hosted fonts at load.

## Animator and VFX

- Things that move physically: planks swing on nails, lids hinge open, flags rise on a pole, the stamp lands with an overshoot and a little ink spread. The soldiers already have Idle, Idle_Shoot, Duck, HitReact, Death, Wave, No and Jump clips; surrender and kneel are built from those plus bone offsets.

## Sound designer

- Interface sounds are world sounds: a wood knock for a plank, paper for a sheet, a crank and bell for the telephone, a latch for a crate lid. Places have their own ambience (wind, a stove, radio static). All synthesised in `audio.js`.

## QA: current screens checked in the live build

Run locally against the current `master` build with a desktop viewport (1440 x 900), screenshots kept in the session:

| Screen | Problem from its description | Still there |
|---|---|---|
| 01 | Supply cards drawn at half opacity over the squad, buttons that look pressable while disabled | Yes |
| 02 | `fire.log` pinned on desktop, cannot be hidden, dots do nothing, native scrollbar | Yes |
| 02 | Rows numbered 1, 3, 5: `.log li::before` increments the counter on supply rows | Yes (`style.css` line 302) |
| 03 | "No crates left" as a small caption under a wall of disabled controls | Yes |
| 05 | Leave and Field manual as outlined web buttons in the corner | Yes |
| 06 | Numbered list rows with chevrons, floating title, scrim, corner buttons | Yes |
| 10 | `after.action` window with macOS dots over our squad, small pale OVERRUN, CEASEFIRE pill | Yes |
| 11, 12 | Accordion dropdowns with a two-column chip grid and a web form | Yes |
