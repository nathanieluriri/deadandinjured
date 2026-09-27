# Reference screenshots for the redesign

**Every image in this folder is kept on purpose, to be analyzed properly.** The owner asked for all of them to stay in the repository so the next agent can study them: "KEEP THEM IN THE REPO THE NEXT AGENT WILL AND SHOULD ANALYZE THOSE IMAGES SO SPECIFY THAT ALL THOSE IMAGES ARE KEPT TO BE ANALYZED PROPERLY".

- Do not delete, move, rename, compress or replace any image here.
- Open and study each image itself, at full size, before designing or building anything from the plan in [`../redesign-requests.md`](../redesign-requests.md). The written descriptions are a guide, not a substitute for looking.
- Images 07, 08 and 09 come from other games. They are references for the approach (a title and menu built from the game's own world); nothing from them is copied into Dead & Injured.

## The images

| # | Image | Description | What it shows | Kind |
|---|---|---|---|---|
| 01 | [image](01-supply-cards-faded.webp) | [description](01-supply-cards-faded.md) | The three supply cards drawn see-through over the field (desktop) | Current UI, to be replaced |
| 02 | [image](02-fire-log-window.png) | [description](02-fire-log-window.md) | The fire log window, always open on desktop | Current UI, to be replaced |
| 03 | [image](03-supply-cards-no-crates.webp) | [description](03-supply-cards-no-crates.md) | The supply cards when no crates are left | Current UI, to be replaced |
| 04 | [image](04-windows-taskbar.png) | [description](04-windows-taskbar.md) | The Windows 11 taskbar | Reference: the model for the match's icon bar |
| 05 | [image](05-leave-and-manual-buttons.png) | [description](05-leave-and-manual-buttons.md) | The Leave and Field manual buttons | Current UI, to be replaced by one Pause button |
| 06 | [image](06-title-screen-current.webp) | [description](06-title-screen-current.md) | The current title screen (desktop) | Current UI, to be replaced |
| 07 | [image](07-title-zelda-breath-of-the-wild.webp) | [description](07-title-zelda-breath-of-the-wild.md) | The Legend of Zelda: Breath of the Wild, title screen | Reference: a title that belongs to its world |
| 08 | [image](08-title-cereza-and-the-lost-demon.webp) | [description](08-title-cereza-and-the-lost-demon.md) | Bayonetta Origins: Cereza and the Lost Demon, title screen | Reference: the title as one object from the story |
| 09 | [image](09-menu-plants-vs-zombies.webp) | [description](09-menu-plants-vs-zombies.md) | Plants vs. Zombies, main menu | Reference: every control an object in the world |
| 10 | [image](10-defeat-screen-current.webp) | [description](10-defeat-screen-current.md) | The current defeat screen | Current UI, to be staged in the world |
| 11 | [image](11-menu-dropdown-play-the-computer.png) | [description](11-menu-dropdown-play-the-computer.md) | The title menu with "Play the computer" opened as a dropdown | Current UI, to be replaced |
| 12 | [image](12-menu-dropdown-play-a-friend.png) | [description](12-menu-dropdown-play-a-friend.md) | The title menu with "Play a friend" opened as a dropdown | Current UI, to be replaced |

Images 11 and 12 are recaptures: the owner's own screenshots of these two states never reached the session's disk, so the same states were captured again from the same build. Their descriptions note the small differences.

## How to analyze them

1. Read [`../redesign-requests.md`](../redesign-requests.md) from start to end.
2. For each image, open the image file at full size and zoom into its regions (the menus, the controls, the lettering, the lighting), then read its description beside it. Note anything the description missed.
3. For the references (04, 07, 08 and 09), write down the principles each one teaches: composition, hierarchy, how the selected item is shown, and how the controls are made from the world. Map them onto the places and objects in the plan.
4. For the current screens (01 to 03, 05, 06 and 10 to 12), check in the live build that every problem listed in the description still exists before changing anything.
5. Keep the images here after the redesign ships, so the before and after can always be compared.
