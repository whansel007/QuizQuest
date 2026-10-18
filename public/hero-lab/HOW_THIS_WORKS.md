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

- Flamekeeper, Ranger, and Guardian can join the shared Hero Lab field. The
  existing Ranger and Guardian actions are still placeholders; Flamekeeper can
  fire, dash, and launch one stronger Meteor Strike projectile.
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

There is not yet an enemy that fires projectiles, nor a hero that uses piercing
or dash invulnerability. Those are building blocks for the Skeleton and the
new hero set in later phases.

## Tuning values

Combat and game-feel values are grouped in
[`game-config.js`](./game-config.js): default and hero cooldowns, damage floor
and damage interval, projectile defaults, existing hero stats, enemy stats,
arena dimensions, campfire size and health, wave timing and size, and the
physical/magic HUD colors. Hero definitions can override their cooldowns.

## How to verify this phase

Run `npm test` from the repository root. For a manual check, choose Flamekeeper
and click once: the weapon circle should gray and refill, and holding the mouse
should not fire continuously. Press E and Q and check their cooldown circles;
press I to toggle the four live stats. Use two tabs to see the shared wave
count. The Q action is now one powerful projectile; Sheriff will be the only
hero with an automatic weapon stream during an ultimate.
