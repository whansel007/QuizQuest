# Campfire Defense: Hero Guide

The World is a co-op arena game in QuizQuest. Pick one of the six heroes below, survive waves of monsters, and keep the campfire alive. The run ends when the campfire reaches 0 HP.

## The six heroes

Base stats are shown before kingdom upgrades and wave buffs. Attack values are base values; abilities can apply their own multipliers or effects.

| Hero | Type | HP | Attack | Defense | Speed | Weapon | Skill | Ultimate | Talent |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Sheriff 🤠 | Physical | 105 | 12 | 5 | 225 | Revolver | Dynamite | Bullet Rush | Quick Draw — each kill refunds 0.4 s; one Dynamite blast refunds at most 2 s. |
| Guardian 🛡️ | Physical | 155 | 18 | 12 | 190 | Shield Bash | Shield Rush | Unbreakable Charge | Unstoppable — a kill during Unbreakable Charge extends the charge; Charge ramps damage and ends with a slam. |
| Pilot 🧑‍✈️ | Physical | 78 | 10 | 2 | 245 | Scattershot | Dash | Mech Suit | Adrenaline — kills bring Mech Suit closer. |
| Bombardier 💣 | Magic | 95 | 22 | 3 | 210 | Blast Bomb | Proximity Trap | Targeted Bombing | Demolitionist — primary fire explodes. |
| Bubbles 🫧 | Magic | 110 | 12 | 4 | 220 | Bubble Spray | Bubble Trap | Bubble Rush | Finisher — Bubble Trap kills trigger a larger explosion and halve the remaining skill cooldown. |
| Electromancer ⚡ | Magic | 100 | 16 | 4 | 225 | Lightning Orb | Stun Field | Chain Lightning | Overload — Chain Lightning refunds its cooldown; stunned targets refund twice as much. |

## Ability cooldowns and mechanics

Cooldowns below are the base server values, before run buffs and hero talents. Weapon cooldown is the minimum interval between primary attacks. Cooldowns begin when an ability is successfully used; Bombardier's ultimate is the exception because its target can be canceled without spending the cooldown. The server config is the source of truth: [`game-config.js`](./game-config.js).

| Hero | Weapon cooldown | Skill cooldown | Ultimate cooldown |
| --- | ---: | ---: | ---: |
| Sheriff | 0.27 s | 8 s | 30 s |
| Guardian | 0.488 s | 6.5 s | 45 s |
| Pilot | 0.28 s (mech: 0.638 s) | 7 s (mech: 8 s) | 40 s |
| Bombardier | 1.05 s | 14 s | 40 s |
| Bubbles | 0.105 s | 14 s | 35 s |
| Electromancer | 0.525 s | 10 s | 35 s |

### Sheriff

- **Revolver:** Fires one fast bullet. **Dynamite (E):** Throws a fast explosive with a 1.5 s lifetime and 115 px blast radius; it deals 1.6× attack damage.
- **Bullet Rush (Q):** Lasts 5 s and fires an 8 px bullet every 0.18 s while primary fire is held. Aim and position continue updating during the stream.
- **Quick Draw:** Each qualifying kill refunds 0.4 s from Dynamite's remaining cooldown. Dynamite kills qualify, but a single Dynamite blast can refund at most 2 s total. Dynamite's base cooldown remains 8 s.

### Guardian

- **Shield Bash:** Throws a short-lived shield projectile (0.24 s) for 0.8× attack damage.
- **Shield Rush (E):** A quick 300 px mouse-aimed hop over 0.25 s, invulnerable for the dash plus 0.3 s after. It ends in a 130° fan shockwave (210 px radius) dealing 1.0× attack damage and pushing enemies radially away — brutes are pushed half as far, bosses and the Brute King not at all. Each enemy is hit at most once. The old kill-extension on the skill is gone.
- **Unbreakable Charge (Q):** A steerable 6 s charge at 440 px/s with invulnerability. It hits the same enemy at most once every 0.35 s. Each hit increases damage to subsequent hits by 10%, up to +100%. Kills can extend the charge by 0.15 s each, up to 7.2 s total. When the charge ends, Guardian slams for 2× attack damage (before the ramp) in a 150 px radius, with knockback. Press Q again to end early. The optional 40% damage-reduction brace for 1.5 s after the dash is implemented but disabled by default.

### Pilot

- **Scattershot:** Fires 7 pellets with a 0.32 radian spread; each pellet deals 0.4× attack damage.
- **Dash (E):** A 250 px aimed dash over 0.4 s.
- **Mech Suit (Q):** Lasts 12 s, is invulnerable, and changes Pilot's stats and moves. The weapon becomes a 2.8× explosive fist; the skill becomes a 260 px dash over 0.42 s, dealing 1.5× mech attack damage with knockback.
- **Adrenaline:** Kills remove up to 1 s from Mech Suit's remaining ultimate cooldown, capped at reducing 50% of the base cooldown in one cooldown cycle.

### Bombardier

- **Blast Bomb:** Bomb travels at 410 px/s, then explodes at its 0.85 s lifetime or range end, dealing 1.2× attack damage in a 100 px radius.
- **Proximity Trap (E):** Places a trap at Bombardier's position. It triggers within 125 px, then deals 2.2× attack damage in a 130 px blast.
- **Targeted Bombing (Q):** Opens a 5 s targeting window. Left-click confirms a 280 px pattern and schedules five bombs at 1 s intervals. Each blast uses a 135 px radius and 1.7× attack damage. The 40 s cooldown starts on confirmation; canceling or timing out does not consume it.

### Bubbles

- **Bubble Spray:** Holding primary fire sprays bubbles every 0.105 s. Each bubble has randomized spread, travels up to 315 px, and deals 0.14× attack damage.
- **Bubble Trap (E):** Launches at 880 px/s for up to 390 px. On enemy contact, it carries the target. At the end of travel it deals 9 damage in a 110 px blast. If the carried target has 44 HP or less when the trap resolves, it instead deals 44 damage in a 235 px finisher blast. A kill credited to Bubble Trap halves the remaining skill cooldown.
- **Bubble Rush (Q):** Lasts 6 s at 2.6× walking speed; it pops early if Bubbles fires or uses E. The pop deals 2.2× attack damage within 145 px.

### Electromancer

- **Lightning Orb:** Fires a piercing orb (up to 2 pierces) with a 2.4 s lifetime.
- **Stun Field (E):** Fires a blue projectile at 440 px/s. On detonation it deals 0.7× attack damage and stuns enemies in a 120 px radius for 1.9 s.
- **Chain Lightning (Q):** Deals 1.4× attack damage per hit and jumps every 0.26 s to nearby enemies within 220 px. It can chain through any number of enemies in range, hitting each target once per cast.
- **Overload:** Each Chain Lightning hit refunds 4% of its 35 s base ultimate cooldown (1.4 s). Hitting a stunned enemy refunds twice that (2.8 s). Refunds are based on the base cooldown, so Rally does not increase them. Q cannot be cast again for at least 5 s after any cast, even if the cooldown refills sooner. Overload no longer adds damage to stunned targets.

Run buffs can modify cooldowns or combat values. The Rally team buff reduces ultimate cooldowns by 20%. Cooldown refunds from talents are described above; live remaining times and the Electro lockout are shown by the HUD.

### Kingdom upgrades in World

The server reads building levels from the signed-in student's saved kingdom when the hero joins. Library and Workshop add 10% of the hero's base attack per level, before run buffs, up to level 3 (+30%). Garden adds 10% of the base campfire HP per level for each player in the shared run, once per player (also capped at level 3):

- **Library:** +10% base attack per level for magic heroes.
- **Workshop:** +10% base attack per level for physical heroes.
- **Garden:** +10% of base campfire max HP per level per player in the shared run.
- **Tower:** makes the four stat buff cards (max HP, attack, defense, speed) 10% stronger per level on your own hero, up to level 3 (+30%).

At level 3, the Library or Workshop grants +30% matching attack. With the 100 HP base campfire, Garden level 3 gives 130 max HP in a solo run; four players with Garden level 3 each give the shared campfire 220 max HP. The shared run adds each player's Garden bonus once. The client does not send its own building levels or bonus values.

The Tower multiplies the four stat buff cards on the owner's own hero only: each level adds 10% to the card's effect, so at level 3 an attack card's +15% becomes +19.5%. Every hero uses its own Tower level — nothing is pooled, averaged or taken from the host. It never scales the campfire card or the rare effect cards.

#### How stat buff cards are derived

The room stores only the ordered list of cards taken this run, never pre-scaled numbers. Each hero's final stats are recomputed from that list, its base stats, its own building levels and the active effect cards:

1. `attack = baseAttack × (1 + Library/Workshop bonus) × (1 + Σ attack cards × Tower) × Glass Cannon`
2. `maxHP = baseHP × (1 + Σ max-HP cards × Tower) × Glass Cannon`
3. `defense = min(50%, baseDefense + Σ defense cards × Tower)`
4. `speed = baseSpeed × (1 + min(40%, Σ speed cards × Tower))`

Same-stat cards add together, then the Tower multiplier scales that sum; caps apply after the multiplier. At Tower level 3, one card each becomes: attack +19.5%, max HP +26%, defense +13%, speed +10.4%; two attack cards become +39%. Increasing max HP raises current HP by the same amount; Glass Cannon lowers max HP and clamps current HP.

## Controls

| Action | Control |
| --- | --- |
| Move | `W`, `A`, `S`, `D` or arrow keys |
| Aim | Mouse pointer |
| Weapon | Left mouse button |
| Skill | `E` |
| Ultimate | `Q` |
| Bombardier target | Activate ultimate with `Q`, aim, then left-click to confirm; `Esc` cancels |
| Hero information | `I` or the Information button |

## Game loop

- The server owns movement, attacks, cooldowns, enemy behavior, damage, and wave buffs.
- Waves grow in size over time. After clearing a wave, everyone can vote for one team buff before the next wave.
- Zombies and skeletons attack the campfire; devils chase heroes. The campfire heals slowly while heroes stand nearby.
- The shared run ends as soon as the campfire is extinguished. Hero HP reaching zero removes that hero from the fight; the remaining team can continue.
- With multiple players, the HUD shows teammate HP under the current player's HP.

## Running the standalone sandbox

From the repository root, run `npm run dev`, then open `http://localhost:5173/hero-lab`. This standalone sandbox is useful for combat iteration and allows signed-in players to select any hero without summoning it first. In the signed-in QuizQuest app, open **World**; the server applies the selected player's kingdom upgrades there.

## Code map

- [`game-config.js`](./game-config.js): hero stats, combat tuning, building bonuses, waves, and HUD colors.
- [`hero-list.js`](./hero-list.js): the six selectable hero instances and server constructor registry.
- [`heroes/roster.js`](./heroes/roster.js): compatibility registry that exports the hero constructors and shared instances.
- [`heroes/sheriff.js`](./heroes/sheriff.js), [`heroes/guardian.js`](./heroes/guardian.js), [`heroes/pilot.js`](./heroes/pilot.js), [`heroes/bombardier.js`](./heroes/bombardier.js), [`heroes/bubbles.js`](./heroes/bubbles.js), and [`heroes/electromancer.js`](./heroes/electromancer.js): individual hero stats and combat behavior.
- [`heroes/shared.js`](./heroes/shared.js): shared configuration and projectile construction helpers.
- [`world.js`](./world.js): browser renderer, controls, and HUD.
- [`src/hero-lab/world.js`](../../src/hero-lab/world.js): authoritative combat server and student-session kingdom bonus application.
- [`HOW_THIS_WORKS.md`](./HOW_THIS_WORKS.md): plain-language implementation notes and playtest guide.

The former Class World's quiz gathering and raid backend remains in `src/world/world.js` for quiz functionality. The student navigation now opens Campfire Defense as **World**.
