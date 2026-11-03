# 07 — Game UI and HUD

## 1. WHAT THE PLAYER SEES

Practice is an individual quiz with an illustrated turn-based battle and result summary. The co-op Campfire Run arena shows player/hero roster, room code, wave/enemy count, campfire health, ability buttons, an emote picker and between-wave cards. Damage numbers, hit flashes, telegraphs, floating labels and boss confetti appear over the arena. The main arena is an iframe with a DOM HUD over a canvas world.

## 2. HOW IT WORKS

### Quiz

`PracticeView.vue` loads or starts a quiz session and mounts `QuizRunner.vue`. QuizRunner fetches questions, renders `QuestionForm.vue`, sends answers through API calls, handles retry/feedback, animates the small battle turn and shows summary/result components. A leave-confirm dialog and report modal are Vue DOM. The battle figures use DOM elements and CSS classes/rules (e.g. `.battle-damage`, `.battle-impact`, `.battle-enemy-sprite` in `app.css`); this is distinct from the canvas arena.

### Campfire Run HUD

`public/hero-lab/world.html` supplies the arena's HUD element structure; `hud.css` styles it; `world.js` reads server snapshots and updates named DOM fields using `setHudText`, `setHudStyle` and class toggles. Socket.IO supplies room/state/ability events. HUD is not redrawn as part of every canvas pixel: `setHudText()` caches text per element and `setHudStyle()` caches styles, returning early if a value is unchanged; hero labels also use a signature cache. `updateHud()` and nearby functions handle player list, room code, wave phase and campfire bar. Campfire bar width is health/max health, green above 50%, gold above 25%, rose otherwise. CSS transition is `.15s` for width/color.

The HUD includes player portraits/names/HP, room code/copy affordance, wave banner/count, campfire health bar, controls/pills/tooltips, and ability controls. Its shared palette in `hud.css` uses dark pine panels (`--hud-panel: #2E4A39`), cream text (`#F0EAD2`), gold (`#F2BA55`), leaf green (`#8DB872`), ember (`#EF7137`), rose (`#E0807B`) and sky blue (`#8FCBDC`). Roster portraits are 32px desktop (26px narrow), HP bars 7px; the campfire bar is 14px. Weapon/skill/ultimate use M1/E/Q; cooldown fill is a CSS custom property ring with `COOLDOWN_RING_TRANSITION_MS=100`; ready glow period is 1000ms; ready pulse is 300ms. CSS sizes are responsive: ultimate has `--btn-size-ult: 88px` default and 62px in a narrow viewport (`hud.css`). Hero information is an HTML panel in `world.html` toggled with the info button: `world.js` fills selected hero health, attack, defense, speed, building bonuses, momentum, talent and connection status. Per-hero pill badges show state such as Samurai stacks or Ranger ultimate/window state. Cooldown and talent descriptions appear through button/title text and the info panel; check the hero-specific DOM update code for exact tooltip copy.

### Campfire Run emotes

The emote picker opens with **Z** or the **Emote** HUD button, so it is available on touch devices as well. It offers the same six choices as Kingdom: thumbs up, thumbs down, wave, heart, laugh and question. Number keys 1–6 choose directly; arrow keys move focus; Escape or Z closes the picker. The menu is an accessible HTML dialog styled in `public/hero-lab/hud.css`; the chosen bubble is drawn over the player sprite by `drawPlayerEmote()` in `public/hero-lab/world.js` and fades after 2.4 seconds. The client sends an `emote` Socket.IO intent; `src/hero-lab/world.js` routes it to that player's room, where `src/hero-lab/room.js` validates the choice, applies a 500ms rate limit and includes the active glyph and remaining time in each player snapshot. Emotes are visual/social only and do not affect combat. The help card and join briefing in `world.html` document the desktop key and touch button.

### Canvas effects and art

Arena `world.js:draw()` draws scene objects on the game canvas. Damage numbers rise 40px over 600ms (`game-config.js` arena tuning), and merge within 150ms; maximum visible is 20. Impact sparks last 150ms, hit flash is 80ms; enemy hit flash is rate limited (`HIT_FLASH_MIN_INTERVAL_MS=120`, thorns 500ms). Area rings use canvas dashed outlines and translucent fills (widths 4px/5px; dash 14 on, 10 off; alpha values in `config/tuning.js`). Their colors differ for heal, player, thorns and enemy danger.

Hero art is loaded/cached in arena code and drawn to canvas. Upright facing changes transform/flip direction around the sprite; hit flash is a visual state; ultimate can temporarily switch the hero art/pose according to selected hero visual config. Exact per-hero swap condition is in `world.js` functions building the visual state; do not change the normal sprite sheet by editing only the HUD icon.

Boss celebration: `CONFETTI_COUNT=120`, duration 3 seconds, banner 2000ms; speed 220–620px/s; pieces 5–11px; gravity 260; drag 0.6; the effects are drawn in canvas as screen-space celebration and are explicitly unaffected by camera shake/boss zoom. Particles are pooled: `particlePool` receives expired particle objects and reuses them, avoiding repeated allocation. Live particle count is capped at 200, with adaptive quality factors high=1, medium=.6, low=.35. Per-frame full death bursts cap at 3; damage text cap 20.

### Live updates and game timing

The iframe joins the room through Socket.IO (see `public/hero-lab/world.js`, Socket.IO handlers and `src/hero-lab/rooms.js`). Server state snapshots update local `state`; the client renders the latest snapshot in rAF. `FRAME_CAP_FPS=24` controls render cadence; the server room owns authoritative game state/timing. Textual countdowns derive elapsed client time since the last received state between updates. DOM HUD fields are updated selectively, while canvas redraw is expected each game frame.

## 3. WHERE IT LIVES

- Quiz screens: `web/src/student/PracticeView.vue`, `QuizRunner.vue`, `QuestionForm.vue`, `ReportForm.vue`, `ResultBlock.vue`.
- Arena structure and styles: `public/hero-lab/world.html`, `public/hero-lab/hud.css` (including the emote dialog/button).
- Arena live state, sockets, HUD and drawing: `public/hero-lab/world.js` (keyboard/button emote picker, `drawPlayerEmote`, `draw`, socket listeners, HUD update functions, particle/damage drawing).
- Arena display/effect values: `public/hero-lab/game-config.js`, shared constants in `config/tuning.js`.
- Server room and intent routing: `src/hero-lab/room.js`, `src/hero-lab/rooms.js`, `src/hero-lab/world.js` (emote validation, rate limit and shared snapshots are room-owned).

## 4. DATA AND TIMING

Arena: server socket snapshots/events; browser rAF draws at up to 24 FPS; UI button cooldown rings interpolate with CSS over 100ms. Wave/rest/vote timings are defined in game config and server tuning (for example `REST_DURATION_S=8`, `VOTE_DURATION_S=10`, `PRE_WAVE_S=2` in `config/tuning.js`; check matching client game config before altering). Quiz: HTTP session and question responses; answer countdown uses `setInterval(tickTimer, 250)` in `QuizRunner.vue`; entry/turn transitions use local timers.

## 5. HOW TO CHANGE IT

1. “Make the arena HUD campfire bar transition last X ms by changing the `.campfire-track span` transition in `public/hero-lab/hud.css`; keep server HP as the value source.”
2. “Resize ability buttons for mobile in `hud.css`; preserve 88px desktop/62px narrow ultimate sizing unless deliberately changing both.”
3. “Change damage number rise or lifetime in `ARENA_TUNING.damageNumbers` in `public/hero-lab/game-config.js`; keep merging and visible cap behavior.”
4. “Change boss confetti amount/duration in `config/tuning.js`; keep screen-space confetti independent of camera shake.”
5. “Change ability readiness pulse via `READY_GLOW_PERIOD_MS` or `COOLDOWN_RING_TRANSITION_MS` in `config/tuning.js` and verify the game config passes those values to CSS.”

## 6. GOTCHAS

- The Quiz battle is a Vue DOM/CSS illustration; Campfire Run is an iframe game with canvas and DOM HUD.
- Server state is authoritative. A visual change must not change client-side reward or grading assumptions.
- The HUD's DOM does not shake with the canvas. Confetti is intentionally screen-space.
- Emote choices and timing are server-owned; keep the client picker IDs in sync with `PLAYER_EMOTES` in `src/hero-lab/room.js` and the Kingdom list if changing the shared choices.
- HUD identifiers are linked between `world.html`, `world.js` and `hud.css`; renaming one without all three breaks the display.
- Game config mirrors/imports some tuning. Check where a value is sourced before adding a duplicate constant.
