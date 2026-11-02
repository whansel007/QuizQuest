# 02 — Animation system

## 1. WHAT THE PLAYER SEES

Characters blink, walk and hop; building tiles appear in stages; panels and pages move or fade; the arena adds impacts, floating numbers, confetti, rings and shake. These effects are split among CSS, JavaScript timers, and canvas drawing rather than one animation engine.

## 2. HOW IT WORKS

**Tween:** a tween changes a value from a start to an end over time, like slowly turning a dimmer knob. **Easing:** a curve that changes how quickly that value moves (steady, slow-start, or slow-stop). Both terms are in the glossary.

| Effect | Method and source | Timing / curve found |
|---|---|---|
| Login town camera and hero stroll | Canvas scene in `LoginPreview.vue`; `cameraCentre()` interpolates using `ease(t) = t*t*(3-2*t)`; heroes hop with `abs(sin(.../150))*5` | `PAN_SPEED=34` world px/s and `PAN_REST_MS=1600`; each pan duration is computed from travel distance/speed; alternating camera centers; 30 FPS target |
| Avatar blinking | `AvatarPreview.vue` chooses frames from visual config on a `setTimeout` cadence; canvas redraw | `IDLE_FPS`, fallback 5; blink clip is loaded from avatar config |
| Avatar/town player sprite | `KingdomTown.vue` draws a cropped sprite to canvas and applies `tintedPlayerFrames`; movement is direct position update, not CSS | `TOWN_WALK_SPEED = 180`; per-frame delta time; sprite idle clip defaults to 5 FPS |
| Wandering heroes | Sprite frame drawing plus procedural sinusoidal vertical hop and ground shadow in `KingdomTown.vue` | `TOWN_HERO_HOP_HEIGHT=10`, `TOWN_HERO_HOPS_PER_SECOND=3`; reduced-motion hop height 3; walk speed 72 |
| Live campfire flame | Canvas paths and sine sway/lift in `town-art.js:drawFlame` | Uses `time/160`, sine multipliers; not CSS |
| Isometric kingdom block drop | SVG block geometry from `IsoKingdom.vue` and CSS class `drop`; per-block delay is computed from z/x/y | `70ms` per height layer, `12ms` offset by `(x+y)%3`, plus `90ms` building stagger on initial scene; end cleanup at last delay + 700ms |
| Town decorative animation | CSS keyframes, e.g. `LibraryProp.vue`, `KingdomView.vue`; SVG fireflies/glows/flames/bubbles | Values declared in each scoped style; examples firefly 3.4s, library flame 1.6s |
| Summon sky stars/meteors | Canvas plus rAF, with visibility and reduced-motion handling in `SummonSky.vue` | 30 FPS cap; 140 stars, 12 twinkles; meteors every random 7–16s, duration 700ms |
| Summon prize reveal | DOM elements animated by CSS keyframes in `app.css`; confetti count from `gacha/rarity.js` | Starter/common 40, rare 80, epic 140; CSS confetti lasts 1.8s |
| Page wipe | DOM overlay + CSS keyframes; timing is selected in `transitions.js` | Page 260ms cover/reveal; telescope 460/520ms; reduced motion 110/130ms |
| Practice battle | DOM/CSS animations, timers and state in `QuizRunner.vue`, styles in `app.css` | Turn animation waits in component; CSS impacts about .42s, defeated sprite .55s, damage float .9s |
| Main arena | Canvas/JS in `public/hero-lab/`; tuning in `config/tuning.js` and `game-config.js` | `FRAME_CAP_FPS=24`, target frame 20ms; confirm specific mechanics in arena source |

**Hop math:** In the Kingdom town, moving heroes use `abs(sin(((time + hopOffset) / 1000) * PI * TOWN_HERO_HOPS_PER_SECOND)) * height`; current height is 10px, or 3px under reduced motion. A steady ground shadow is drawn at the ground position, so it stays beneath the lifted sprite. Facing is set by scaling canvas x by -1 or 1. The student avatar uses a separate `abs(sin(time * .018))` hop phase scaled to 4px (reduced motion 1.5px); its shadow stays anchored at the ground. Login walkers use `abs(sin((time + offset) / 150)) * 5`. Arena players use another transform/effect system in `public/hero-lab/world.js`; hop behavior is not assumed there.

**Walking and blinking:** The town player moves at `TOWN_WALK_SPEED=180` world pixels per second, with elapsed time applied to movement distance. Movement sets facing from x direction; hero walkers similarly update facing. The player idle clip's initial fallback is ten `open` entries followed by `closed`, `open`, `closed`; loaded avatar visual config may replace it with `IDLE_CLIP`. Hero and player sprite animation uses image frames/config; it is not CSS. Avatar preview's blink scheduling uses configured `IDLE_FPS` (fallback 5).

**Particles and pools:** A particle is a small short-lived visual piece (such as confetti, sparks or smoke), like a tossed paper scrap. Summon reveal confetti is a DOM particle set; the arena uses particle arrays and effect caps. `config/tuning.js` sets `PARTICLE_CAP=200`, `MAX_BURSTS_PER_FRAME=3`, death burst 4–6 and `DAMAGE_NUMBER_CAP=20`. Pooling means reusing an existing particle object instead of making a new one every time, like reusing cups after a party. The arena does pool: expired objects return to `particlePool` in `public/hero-lab/world.js`.

### Easing inventory

| Curve | Location/use |
|---|---|
| `t*t*(3-2*t)` smoothstep | `LoginPreview.vue` camera pan |
| `abs(sin(...))` | Kingdom player/hero hops, walking hero previews and decorative oscillations; `KingdomTown.vue` and `LoginPreview.vue` |
| `1-exp(-dt*4.2)` (14 with reduced motion) | `KingdomTown.vue:updateCamera()` camera follow smoothing |
| `cubic-bezier(.65, 0, .35, 1)` | `ScreenWipe.vue` paper cover/reveal |
| `cubic-bezier(.65, 0, .4, 1)` and `cubic-bezier(.35, 0, .3, 1)` | `ScreenWipe.vue` telescope close/open |
| `cubic-bezier(.16,1,.3,1)`, `(.18,.78,.2,1)`, `(.2,.7,.3,1)`, `(.2,.75,.25,1)`, `(.2,.8,.25,1)`, `(.35,0,.2,1)`, `(.7,0,.3,1)`, `(0.1,0.7,0.3,1)`, `(0.2,0.5,0.5,1)`, `(0.2,0.8,0.2,1)`, `(0.2,0.9,0.3,1.15)`, `(0.25,1.35,0.55,1)`, `(0.3,0,0.2,1)` | One-off CSS transitions/animations in `web/src/app.css`, student scoped styles and HUD styles. Search the literal curve in those styles to find its effect. These are the distinct cubic curves found across those sources. |
| CSS `ease`, `ease-in`, `ease-in-out`, `ease-out`, `linear` | Also used in `web/src/app.css`, student scoped styles and `public/hero-lab/hud.css`; each declaration belongs to its local effect. |
| Arena zoom pulse | Boss wave uses `1 + (scale - 1) * pulse` over 300ms; `world.js` also triggers vortex zoom when enabled. The pulse calculation is in `world.js`; scale/duration values are in `game-config.js`. |

## 3. WHERE IT LIVES

`config/tuning.js` contains town hop/walk values, arena frame/particle/shake values, and Summon sky values. `LoginPreview.vue`, `AvatarPreview.vue`, `KingdomTown.vue`, `town-art.js`, `IsoKingdom.vue`, `SummonSky.vue`, `PrizeReveal.vue`, `QuizRunner.vue`, `app.css` and `ScreenWipe.vue` implement the effects named above. Arena logic is under `public/hero-lab/`.

## 4. DATA AND TIMING

CSS keyframes start when Vue adds a class/state; canvas motion is calculated from time/frame callbacks; timer-driven blinking schedules another redraw after `1000 / IDLE_FPS`. Reduced motion is checked in `KingdomTown.vue`, `SummonSky.vue` and `transitions.js`; arena has its own settings. Keep durations in milliseconds when names end `_MS`, seconds when names end `_S`.

## 5. HOW TO CHANGE IT

1. “Set town hero hop height to X pixels by changing `TOWN_HERO_HOP_HEIGHT` in `config/tuning.js`; keep reduced-motion behavior intact.”
2. “Slow the page wipe by changing `TIMING.page` cover/reveal in `web/src/transitions.js`; keep the callback covered until the new view paints.”
3. “Increase boss confetti quantity by changing `CONFETTI_COUNT` in `config/tuning.js`; retain the quality scaling and duration.”
4. “Change the Summon sky frame cap in `SUMMON_SKY_FRAME_CAP_FPS`; keep the sky paused while hidden or offscreen.”
5. “Change the avatar idle blink cadence via the loaded avatar config's `IDLE_FPS`; do not change the town hero hop clock.”

## 6. GOTCHAS

- CSS and canvas may animate different parts of one view; changing a CSS rule will not affect canvas sprites.
- Reduced motion is handled separately by several components, not one app-wide controller.
- Frame caps regulate drawing cost, not the server's game tick or button input.
- CSS easing values are distributed across the global sheet, scoped styles and arena HUD; keep a source search as the final authority if a new style adds a curve.
