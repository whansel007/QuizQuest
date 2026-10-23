# How Campfire Defense works

Campfire Defense is the student **World** game. The browser draws the arena
and sends input. The Node server owns hero stats, cooldowns, damage,
projectiles, monsters, waves, votes, and the campfire. The standalone Hero Lab
route remains available for quick sandbox playtests.

## Playing

1. Start the app with `npm run dev` and open `http://localhost:5173/hero-lab`.
2. Pick a hero. Open another browser tab and pick a hero there to share the
   same field.
3. Move with WASD or the arrow keys, aim with the mouse, click the left mouse
   button to fire, press E for the skill, and Q for the ultimate. Bombardier
   uses Q to aim and right-click to confirm a target. Escape cancels targeting.
4. Press I (or click **Information**) to see current stats and the hero's
   passive talent. Teammate health appears under your own health bar.

## Heroes and talents

- **Sheriff:** yellow, long-range revolver bullets; fast, flashing dynamite;
  Deadeye fires a stream from the hero's current position and aim. Quick Draw
  refunds 0.4 seconds from Dynamite's remaining cooldown per kill. Dynamite
  kills count; a single blast can refund at most 2 seconds total.
- **Guardian:** a short-range shield bash, a longer invulnerable Shield Rush,
  and a steerable invulnerable charge. Any kill during a dash extends its timer
  and shows a `+time` popup, within the existing cap. Each Unbreakable Charge
  hit increases damage to later hits by 10%, to a +100% cap; ending the charge
  triggers a 150 px ground slam for 2x attack damage before the ramp. Press Q
  again to slam early. The optional 40% post-Rush damage-reduction brace lasts
  1.5 seconds and is disabled by default.
- **Pilot:** a fragile base form fires a seven-pellet shotgun and can dash in
  any aimed direction. Kills reduce the Mech Suit cooldown. The temporary mech
  is invulnerable and changes the weapon to a short-range explosive fist and
  the skill to a longer knockback dash.
- **Bombardier:** primary bombs explode at the end of their range. E places one
  large-radius proximity trap. Q enters targeting mode; right-click confirms
  the center of a five-bomb pattern. Each bomb gets a marker before it explodes.
  If targeting times out or is canceled, Q is not consumed.
- **Bubbles:** rapid blue bubble spray chips enemies at short range. E launches a
  Bubble Trap that carries the first enemy it hits and explodes after traveling.
  A kill from the trap triggers its larger finisher blast and halves the
  remaining skill cooldown.
  When the trapped enemy is within the finisher blast's lethal damage, the trap
  uses its larger, stronger explosion. Q wraps Bubbles in a fast-moving bubble for six
  seconds. It pops around the hero when time expires, or early when Bubbles uses
  primary fire or E. The pop damages nearby enemies. Bubbles has no healing mode.
- **Electromancer:** a larger lightning orb, a traveling stun zone, and delayed
  chain lightning. The chain jumps through every enemy it can reach, hitting
  each target once per chain. Overload refunds 4% of the 35-second base ultimate
  cooldown per hit (1.4 seconds), or twice as much on a stunned target. The
  refund stays based on the unmodified base cooldown, even with Rally; a
  five-second lockout prevents an immediate recast. Overload no longer adds
  damage to stunned enemies. Stunned enemies show an ⚡ indicator while they
  remain stunned.
Every hero has a passive talent name and description in the Info panel. Talent
effects run on the server. Monster kills carry the attacking hero and ability
through projectile hits and explosions so kill-based talents can apply.

## Enemies, campfire, and waves

- Zombies walk to the campfire. Devils chase the nearest hero. Skeletons pause
  periodically to fire a red bullet at the nearest hero, then resume walking.
- Heroes slowly recover health while standing near the campfire.
- When a wave is cleared, the server shows three randomly selected team-buff
  cards from max HP, attack, defense, speed, and campfire max HP. Every
  connected player votes once. The winning flat bonus applies to every hero,
  or to the campfire for its max-HP card. If the vote ties, the
  server chooses randomly among tied cards. A disconnected player's vote is
  removed; if all remaining players have voted, the result is applied. Voting
  also ends after the configured timeout.
- Wave buffs last for the run. The server resets them when the last player
  leaves. If campfire HP reaches zero, the shared run ends for every player and
  waves stop.
- When a signed-in student joins through the app, saved kingdom levels are
  applied server-side: Library adds 10% of base attack per level to magic
  heroes, Workshop adds 10% of base attack per level to physical heroes, and
  Garden adds 10% of base campfire max HP per level for each player in the
  shared run. Each player's Garden bonus is applied once per run; bonuses from
  players in the shared run add together. At level 3, Garden adds 30 HP to the
  100 HP base campfire (130 HP solo); four players with Garden level 3 each
  produce 220 max HP. Tower has no combat effect yet. Buildings cap at level 3.

## HUD and server rules

- The top-left HUD shows your health and a compact live health list for other
  players. The centered top HUD shows wave status and enemy count.
- The bottom-right weapon, skill, and ultimate circles use server cooldowns.
  Pilot's labels and stats change during the mech form. Bombardier's targeting
  state is shown above the arena.
- The Info panel shows live health, attack, defense, speed, and talent text.
- Defense is percentage damage reduction, capped at 50%. Heroes have a short
  server-side damage interval. Campfire loss is a
  shared game-over event.
- Projectiles have their own color, size, emoji/shape, and optional direction
  rotation. By default they hit one enemy. Piercing, explosions, stuns, and
  teammate healing are explicit projectile options.

## Tuning and assumptions

Game-feel values live in [`game-config.js`](./game-config.js), including hero
stats and cooldowns, projectile visuals, talent effects, enemy behavior,
campfire healing, wave growth, building bonuses, buff range, vote timeout, and
HUD colors.

The playtest brief left exact values open, so these are configurable starting
points: Sheriff refunds 0.4 seconds of Dynamite cooldown per kill (capped at 2
seconds per blast); Guardian gains 0.15 seconds per dash kill within the
existing 1.2x dash-duration cap; Pilot gains 1 second on Mech Suit per kill;
Bombardier fires five bombs at one-second intervals inside a 280-pixel target
circle; Bubbles' finisher activates when the trapped enemy has no more HP than
the base explosion damage; Chain Lightning refunds 4% of its base ultimate
cooldown per hit (doubled for stunned targets), with a 5-second lockout; and
campfire healing is 1.5 HP per second within 150 pixels.

Wave voting lasts 10 seconds in multiplayer and has no timer in solo. Ties are
random, disconnected votes are removed, and if nobody votes the server randomly
picks one of the offered cards. Cards include percentage stat upgrades and,
from wave 3, one rare effect that is not already active.

### Wave 5 enemy and buff workflow

- Enemy count starts at 10 and grows by 4 per wave, with additional enemies for
  larger parties. Enemy health and damage scale by wave. The server limits the
  number of live enemies and queues the rest.
- Brutes appear from wave 4 with high health, slow movement, and reduced
  knockback. Exploders appear from wave 7, warn before damaging the campfire,
  and burst for reduced damage when killed. Every fifth wave adds a Brute King
  with six escorts; its slam has a visible warning and damages nearby heroes
  and the campfire.
- Every third non-boss wave can add Horde, Fast Night, or Supply Drop. Horde
  doubles enemy count and halves health; Fast Night increases enemy and hero
  speed; Supply Drop releases a healing pickup every 10 kills.
- The ten rare effects are Thorns, Scavenger, Overcharge, Rally, Glass Cannon,
  Second Wind, Life Steal, Ricochet, Volatile, and Powder Keg. A rare effect
  can only be acquired once in a run. HUD icons show active effects and a
  separate health bar appears while the Brute King is alive.

## Hero Summon, collection, and debug menu

The student **Hero Summon** tab replaces the old Pets & Shop page. A new
student starts with Sheriff. Each summon costs 50 coins by default. A common
pull gives 5 units of one kingdom resource; rare pulls are Sheriff, Guardian,
Bubbles, or Electromancer; epic pulls are Pilot or Bombardier. Duplicate heroes
refund the full pull cost by default. Cost, refund fraction, resource amount,
rates, hero rarities, and pity thresholds are in `game-config.js`.

The server owns summon RNG, coin spending/refunds, resource rewards, hero
ownership, and pity counters. Hero pity guarantees a rare-or-epic hero after 10
pulls without one. Epic pity guarantees a 5-star hero after 50 pulls without
one; it wins if both guarantees are due. Getting either hero rarity resets the
hero counter. Getting an epic resets both counters. Pull history and owned
heroes persist with the student's inventory. World validates ownership again
when the student joins, so the client cannot select a locked hero.

The collection lists all six heroes and their owned/locked state. History at
the bottom switches between coin and resource transactions. To adjust coins in
the local demo, enter the Konami code (`↑ ↑ ↓ ↓ ← → ← → B A Enter`) from the
student UI. The hidden debug menu writes an auditable wallet adjustment on the
server. Its endpoint refuses requests when `NODE_ENV=production` or
`QUIZQUEST_DEMO=false`.

### Playtest this phase

1. Sign in as a student and open **Hero Summon**. Confirm Sheriff is owned and
   the other five heroes are visible but locked.
2. Enter the Konami code. Set the balance to 500 and confirm the wallet updates.
3. Summon repeatedly. Check that common results add the shown resource amount,
   new hero results unlock a collection card, and duplicate heroes refund the
   configured amount.
4. Confirm pity counters survive page reloads. The 10th pull since the last
   hero must be rare or epic; the 50th pull since the last epic must be epic.
   If both counters reach their threshold together, the result must be epic.
5. Open **World**. Confirm only owned heroes can be selected and that a newly
   summoned hero becomes selectable. Check kingdom bonuses still apply.
6. Switch **History** between Coins and Resources and confirm summon charges,
   duplicate refunds, and common resource prizes appear in the matching list.
7. In a production environment, confirm the debug menu does not open and the
   wallet adjustment endpoint returns not found.

Assumptions for this phase: default summon cost is 50 coins, duplicate refund
is 100%, a common prize is 5 units of one uniformly selected resource, and
Sheriff is the free starter hero. Hero pity resets on any hero; epic pity
resets only on an epic. Both pity counters are persistent and have no time or
daily reset.

Campfire Defense is now the student **World** entry point. The old Class World
screen is out of the student navigation; its quiz server and question-gathering
code remain in place so existing quiz behavior is preserved.

## Verification and Hero Lab regression checks

Run `npm run check`, `npm test`, and `npm run test:browser` from the repository
root. For a manual playtest:

1. Choose Sheriff. Open Information and read **Quick Draw**. Fire primary and
   Dynamite, then use Deadeye while moving and changing aim. Confirm the stream
   follows the hero and kills shorten Dynamite's cooldown.
2. Choose Guardian. Dash through a group with E and Q. Confirm the trail,
   invulnerability, and `+time` popup after a kill. Chain kills, check the ramp
   pill and end slam, and verify the configured dash cap.
3. Choose Pilot. Fire at a group up close and at range to compare the shotgun.
   Use E toward and away from enemies. Activate Q, then try the rotating fist
   and longer knockback dash. Confirm invulnerability and HUD label changes.
4. Choose Bombardier. Fire primary and place a trap with E. Press Q, move the
   target circle, right-click to confirm, and watch each marker and explosion.
   Press Q then Escape (or wait for timeout) to confirm no cooldown is used.
5. Choose Bubbles. Spray at an enemy, then use E to trap and carry one into a
   group. Check the normal and lethal finisher explosions. Use Q and watch the
   growing bubble pop. Confirm there is no healing mode.
6. Choose Electromancer. Use E to stun enemies and see the electric ring and ⚡
   status. Use Q on a group; check the CHAIN counter, cooldown refill, doubled
   stunned-target refunds, and the 5-second lockout. Confirm stunned targets do
   not take Overload bonus damage.
7. Use two tabs. Let enemies reach the campfire to see the global game-over
   overlay. In another run, clear a wave, vote in both tabs, and verify the
   same winning buff updates both players. Disconnect one voter during a vote
   to confirm their vote no longer counts.
