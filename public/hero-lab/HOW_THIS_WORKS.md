# How Hero Lab works now

Hero Lab is the place to try changes to heroes and combat before they are
connected to the student game. The browser draws the arena and sends input;
the Node server owns hero stats, cooldowns, damage, projectiles, monsters,
waves, and the campfire. The browser cannot decide whether an attack is ready
or how much damage it dealt.

## Playing

1. Start the app with `npm run dev` and open `http://localhost:5173/hero-lab`.
2. Pick a hero. Open another browser tab and pick a hero there to share the
   same test field.
3. Move with WASD or the arrow keys, aim with the mouse, and click the left
   mouse button to fire. Press E for the skill, Q for the ultimate, and I (or
   click **Information**) to open the live stats panel.
4. The top-left panel shows the selected hero and a health bar. The panel at the
   top center shows the current wave and the server's enemy count. The three
   circles at bottom right show Weapon, Skill, and Ultimate cooldowns. Their
   color rises from the bottom while the server cooldown runs.

## What is implemented

- The Phase 2 roster is Sheriff, Guardian, Pilot, Bombardier, Bubbles, and
  Electromancer. Flamekeeper and Ranger remain available as Hero Lab trials.
- Sheriff fires long-range revolver shots, throws an explosive dynamite stick,
  and channels a rapid-fire Deadeye ultimate.
- Guardian throws a shield, rushes through enemies with a protected dash, and
  steers an invulnerable charge during the ultimate.
- Pilot fires pulse shots and retreats. The ultimate changes the hero into a
  mech temporarily, replacing the weapon and skill with a punch and impact dash.
- Bombardier throws timed explosive bombs, can place one proximity trap, and
  marks five random airstrike locations before they explode.
- Bubbles fires damaging bubbles, switches to teammate-healing bubbles with E,
  and pops a large area bubble that heals heroes and damages enemies.
- Electromancer fires a limited-pierce lightning orb, launches an area stun
  ball, and chains lightning between nearby enemies.
- All skill, damage, timing, and radius values for these heroes are grouped in
  `game-config.js`. The server owns cooldowns, targeting, damage, healing,
  knockback, and the temporary Pilot form.
- When the campfire reaches zero HP, the server ends the shared run for every
  connected player and stops waves and combat. In multiplayer, the HUD shows
  each teammate's health in a compact list beneath your own health bar.
- Hero defense reduces incoming damage. At least one point always gets through,
  except while a hero is explicitly invulnerable. A short server-side damage
  interval prevents a single contact from draining health every frame.
- Player projectiles hit one monster and disappear unless their `piercing`
  property is set. Enemy projectiles have their own kind and damage heroes
  through the same defense rules.
- Monster count, health, stats, and ability cooldowns are sent from the server.
  The HUD smooths the time between snapshots but does not set cooldowns.
- The hero visual is currently the `visual` emoji field. Replacing that field's
  renderer with images later should not require changing combat rules.

The six new heroes are still isolated to Hero Lab; they are not connected to
the main game's selection, progression, or gacha systems yet. Enemy projectiles
and the later wave, skeleton, healing, and upgrade work remain future phases.

## Tuning values

Combat and game-feel values are grouped in
[`game-config.js`](./game-config.js): default and hero cooldowns, damage floor
and damage interval, projectile defaults, existing hero stats, enemy stats,
arena dimensions, campfire size and health, wave timing and size, and the
physical/magic HUD colors. Hero definitions can override their cooldowns.

## How to verify this phase

Run `npm run check` and `npm test` from the repository root. For a manual
playtest:

1. Start `npm run dev`, open `/hero-lab`, and choose each of the six new heroes.
   Confirm each card and ability HUD uses the correct hero and ability names.
2. Move and aim with WASD/arrows and the mouse, click to use the weapon, press E
   for the skill, and Q for the ultimate. Try Sheriff Q while moving the mouse;
   it should fire a stream in the current aim direction.
3. Try Guardian E/Q, then Pilot Q followed by M1 and E to check the mech form
   and its updated ability labels. Try Bombardier E twice to confirm only one
   trap remains, and Q to see five marked strike sites.
4. Open a second tab, choose another hero, and confirm their compact health row
   appears under your own health bar in both tabs. Bubbles can aim healing
   bubbles at the other player after pressing E.
5. Let enemies reach the center campfire. When its HP reaches zero, both tabs
   should show the end overlay and return to hero selection; neither tab should
   continue into another wave.
