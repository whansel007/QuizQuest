# Student UI guide

These pages explain the student-facing screens from the code that currently exists. The main entry point is `web/src/App.vue`; it selects the student tab and mounts its view. The Kingdom town and game scenes use canvas for fast custom drawing, while navigation, forms, panels and most overlays are ordinary HTML styled with CSS.

## Reading order

1. [00-inventory.md](00-inventory.md) maps screens to components and entry points.
2. [01-foundations.md](01-foundations.md) explains the app, rendering, state and assets.
3. [02-animation-system.md](02-animation-system.md) covers animation methods and timing.
4. [03-kingdom-town.md](03-kingdom-town.md) covers the walkable town.
5. [04-avatar-and-cosmetics.md](04-avatar-and-cosmetics.md) covers the player character and wardrobe.
6. [05-transitions-and-camera-effects.md](05-transitions-and-camera-effects.md) covers wipes and game camera effects.
7. [06-login-and-intro.md](06-login-and-intro.md) covers sign-in and its animated showcase.
8. [07-game-ui-and-hud.md](07-game-ui-and-hud.md) covers quiz/game screens and HUDs.
9. [08-world-lobby-summon.md](08-world-lobby-summon.md) covers Campfire Run, Summon and page-level features.
10. [09-glossary-and-cheatsheet.md](09-glossary-and-cheatsheet.md) is the glossary, change guide, overview and risk list.

Claims name source paths and the relevant component/function/config. Values reflect the checked-in source at the time these notes were written. If this document says **unverified**, the named source did not establish the behavior conclusively.
