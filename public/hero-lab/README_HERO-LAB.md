# Campfire Defense: Hero Guide

The World is a co-op arena game in QuizQuest. Pick one of the six heroes below, survive waves of monsters, and keep the campfire alive. The run ends when the campfire reaches 0 HP.

## The six heroes

Base stats are shown before kingdom upgrades and wave buffs. Attack values are base values; abilities can apply their own multipliers or effects.

| Hero | Type | HP | Attack | Defense | Speed | Weapon | Skill | Ultimate | Talent |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Sheriff 🤠 | Physical | 105 | 12 | 5 | 225 | Revolver | Dynamite | Deadeye | Quick Draw — kills reduce Dynamite cooldown. |
| Guardian 🛡️ | Physical | 155 | 18 | 12 | 190 | Shield Bash | Shield Rush | Unbreakable Charge | Unstoppable — kills while dashing extend the dash. |
| Pilot 🧑‍✈️ | Physical | 78 | 10 | 2 | 245 | Scattershot | Dash | Mech Suit | Adrenaline — kills bring Mech Suit closer. |
| Bombardier 💣 | Magic | 95 | 22 | 3 | 210 | Blast Bomb | Proximity Trap | Targeted Bombing | Demolitionist — primary fire explodes. |
| Bubbles 🫧 | Magic | 110 | 12 | 4 | 220 | Bubble Spray | Bubble Trap | Bubble Rush | Finisher — Bubble Trap kills trigger a larger explosion. |
| Electromancer ⚡ | Magic | 100 | 16 | 4 | 225 | Lightning Orb | Stun Field | Chain Lightning | Overload — deals bonus damage to stunned enemies. |

### Kingdom upgrades in World

The server reads building levels from the signed-in student's saved kingdom when the hero joins. Each level grants a flat +10:

- **Library:** +10 attack per level for magic heroes.
- **Workshop:** +10 attack per level for physical heroes.
- **Garden:** +10 campfire max HP per level for each player in the shared run.
- **Tower:** no combat bonus is configured yet.

Buildings cap at level 3, so each active upgrade grants up to +30. The shared run adds each player's Garden bonus once. The client does not send its own building levels or bonus values.

## Controls

| Action | Control |
| --- | --- |
| Move | `W`, `A`, `S`, `D` or arrow keys |
| Aim | Mouse pointer |
| Weapon | Left mouse button |
| Skill | `E` |
| Ultimate | `Q` |
| Bombardier target | Activate ultimate with `Q`, aim, then right-click to confirm; `Esc` cancels |
| Hero information | `I` or the Information button |

## Game loop

- The server owns movement, attacks, cooldowns, enemy behavior, damage, and wave buffs.
- Waves grow in size over time. After clearing a wave, everyone can vote for one team buff before the next wave.
- Zombies and skeletons attack the campfire; devils chase heroes. The campfire heals slowly while heroes stand nearby.
- The shared run ends as soon as the campfire is extinguished. Hero HP reaching zero removes that hero from the fight; the remaining team can continue.
- With multiple players, the HUD shows teammate HP under the current player's HP.

## Running the standalone sandbox

From the repository root, run `npm run dev`, then open `http://localhost:5173/hero-lab`. This standalone sandbox is useful for combat iteration. In the signed-in QuizQuest app, open **World**; the server applies the selected player's kingdom upgrades there.

## Code map

- [`game-config.js`](./game-config.js): hero stats, combat tuning, building bonuses, waves, and HUD colors.
- [`hero-list.js`](./hero-list.js): the six selectable hero instances and server constructor registry.
- [`heroes/roster.js`](./heroes/roster.js): hero weapons, skills, ultimates, and talents.
- [`world.js`](./world.js): browser renderer, controls, and HUD.
- [`src/hero-lab/world.js`](../../src/hero-lab/world.js): authoritative combat server and student-session kingdom bonus application.
- [`HOW_THIS_WORKS.md`](./HOW_THIS_WORKS.md): plain-language implementation notes and playtest guide.

The former Class World's quiz gathering and raid backend remains in `src/world/world.js` for quiz functionality. The student navigation now opens Campfire Defense as **World**.
