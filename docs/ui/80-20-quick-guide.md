# QuizQuest UI: the 80/20 guide

This is the short version of the UI guide: the architecture, paths and rules that explain most student-facing behavior and make most UI changes safe. It was checked against the UI source on 15 November 2026. Use the linked topic pages when you need implementation detail.

## The mental model

The app is a **single Vue app with tab-based views**, not a set of separate student pages. Signed-out users see the login flow. `web/src/App.vue` restores the session, selects the role-specific tab list and mounts one view at a time. Dialogs and flows such as quiz results, the Kingdom tour, hero books and Summon reveals are usually states inside a view.

Most controls, text, navigation and panels are HTML styled with CSS. Canvas draws the walkable Kingdom and decorative scenes. **Campfire Run** has a separate arena inside an iframe, with its own canvas world and DOM HUD. Treat those as distinct rendering surfaces: changing app CSS does not automatically change the arena.

The browser presents and collects actions; the **server is authoritative** for accounts, quiz marking, rewards, inventory, upgrades, summon results and room state. Do not implement an important rule only in the UI.

## The five student destinations

| Destination | What it is | Start here |
|---|---|---|
| Kingdom | Walkable town, buildings, resources, wardrobe, hero archive and tour | `web/src/student/KingdomView.vue`, `KingdomTown.vue` |
| Quiz | Solo practice, question answering, feedback and results | `PracticeView.vue`, `QuizRunner.vue` |
| My Progress | Review of the student's practice history | `ProgressView.vue` |
| Campfire Run | Hero picker/lobby, then co-op arena in an iframe | `HeroLabView.vue`, then `public/hero-lab/` |
| Summon | Pull actions, reveal, history and details | `PetsView.vue`, `SummonSky.vue` |

The separate `WorldView.vue` class world exists in source but is **not connected to a student tab** in `App.vue`. The `world` tab ID means Campfire Run and opens `HeroLabView.vue`.

## The source map that answers most questions

- **Shell, tabs, navigation and shared overlays:** `web/src/App.vue`
- **Session, tab state and HTTP client:** `web/src/api.js`
- **Shared student home/profile loading:** `web/src/student/home.js`
- **Global styles and responsive shell rules:** `web/src/app.css`, `web/src/mobile-config.js`
- **Town drawing, movement, collision and layout:** `web/src/student/KingdomTown.vue`, `web/src/student/kingdom/town-scene.js`, `town-art.js`, `config/tuning.js`
- **Building panels and hero info:** `web/src/student/KingdomView.vue`, `web/src/student/kingdom/panels/`, `HeroBook.vue`, `hero-ability-guide.js`
- **Arena HUD, controls and drawing:** `public/hero-lab/world.html`, `hud.css`, `world.js`, `game-config.js`
- **Server behavior and persistence:** routes/handlers in `src/quiz/api.js`, game rules in the corresponding `src/` modules

## Five rules that prevent most UI regressions

1. **Change the whole behavior path.** A visible result can depend on a view, shared state, API handler, config and persistence. Follow the action from its button to the server response before editing it.
2. **Keep server-owned outcomes server-owned.** The client can animate a reward or display a score, but it must use the result returned by the server. Pull odds, answer correctness and inventory are not UI decisions.
3. **Canvas is not semantic UI.** Canvas objects are pixels, not buttons or readable labels. Pair canvas interaction with keyboard/pointer handling and accessible DOM controls or names.
4. **Keep related geometry and rendering in sync.** In the town, map placement, collision footprints, doors and art are separate data. Moving a building or prop may require changing more than its drawing.
5. **Clean up view-owned work.** Views remount on tab/session changes. Stop timers, animation frames, observers, event listeners and sockets when a view unmounts. Animation timing and reduced-motion handling are spread across components; there is no global game loop or single FPS setting.

## When a change crosses a boundary

- **Town/map change:** inspect layout, art, collision, door interaction and responsive camera behavior together.
- **Hero or ability change:** check the roster/ownership rules, shared hero config, Hero Book descriptions, selector, arena HUD and server behavior.
- **Mobile change:** check the app shell and the target view separately. The arena is an iframe with its own responsive controls; outer-page CSS cannot style its contents.
- **Animation change:** identify whether that effect is CSS, a component timer/rAF loop, or arena canvas drawing; preserve reduced-motion and visibility pause behavior where present.
- **Data/action change:** follow the UI call through `web/src/api.js` to its handler and storage. Update both client and server when a rule or value is mirrored.

## Deeper pages

- [00 — Screen inventory](00-inventory.md) for the full screen map.
- [01 — Foundations](01-foundations.md) for app state, rendering and communication.
- [03 — Kingdom town](03-kingdom-town.md) and [04 — Avatar and cosmetics](04-avatar-and-cosmetics.md) for the town and wardrobe.
- [05 — Transitions](05-transitions-and-camera-effects.md) and [02 — Animation system](02-animation-system.md) for motion.
- [07 — Game UI and HUD](07-game-ui-and-hud.md) and [08 — Campfire Run and Summon](08-world-lobby-summon.md) for gameplay surfaces.
- [09 — Glossary and cheatsheet](09-glossary-and-cheatsheet.md) for terms, change locations and broader risks.
- [10 — Teacher Analytics](10-teacher-analytics-dashboard.md) for the teacher dashboard.
