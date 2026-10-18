# Hero Lab (Hero Test Field)

A standalone multiplayer 2D top-down sandbox where players select a hero, then enter a full-page world to defend the campfire through increasingly large waves of zombies and devils.

The client renderer runs as native ES modules in the browser (rendered with Canvas 2D and HTML5), while an authoritative game loop runs on the Node.js server at 30 ticks per second over Socket.IO.

---

## Quick Start

From the repository root:

```bash
npm run dev
```

Open [http://localhost:5173/hero-lab](http://localhost:5173/hero-lab), choose a hero, and the game opens at `/hero-lab/world`.

> [!TIP]
> Open the page in two or more browser tabs or windows side-by-side to test multiplayer interactions in realtime!

To run on a production build:
```bash
npm run build
npm start
# open http://localhost:3000/hero-lab
```

---

## Controls

| Action | Control | Description |
| :--- | :--- | :--- |
| **Move** | `W`, `A`, `S`, `D` or Arrow Keys | Moves your hero smoothly around the arena (bounded by arena walls) |
| **Aim** | Mouse Pointer | Directs your hero's aim pointer towards the mouse position |
| **Primary Fire** | Left Mouse Click | Flamekeeper fires a Fireball, with a one-second cooldown |
| **Skill** | `E` | Flamekeeper dashes 180 pixels in the aimed direction |
| **Ultimate** | `Q` | Fires a five-second barrage, one fireball every 500 ms |

---

## Directory Architecture

The code follows an Object-Oriented modular architecture:

```
public/hero-lab/
├── bases/                  # Foundational base classes
│   ├── hero.js             # Hero base class (stats, movement, aim, actions)
│   ├── enemy.js            # Enemy base class (movement towards target, takeDamage)
│   ├── projectile.js       # Projectile base class (velocity, lifetime, collisions)
│   └── index.js            # Barrel re-export for all base classes
│
├── heroes/                 # Individual hero implementations
│   ├── flamekeeper.js      # Flamekeeper (Wizard 🧙) wielding the Ember Staff
│   ├── ranger.js           # Ranger (Archer 🏹) wielding the Longbow
│   └── guardian.js         # Guardian (Knight 🛡️) wielding the Iron Mace
│
├── enemies/                # Enemy monster implementations
│   ├── zombie.js           # Zombie (🧟) that attacks the campfire
│   ├── devil.js            # Devil (😈) that chases and attacks players
│   └── index.js            # Barrel re-export for enemies
│
├── projectiles/            # Projectile implementations
│   ├── fireball.js         # Fireball with radial glow, ember trail, and particles
│   └── index.js            # Barrel re-export for projectiles
│
├── hero-list.js            # Single Source of Truth for available HEROES array
├── main.js                 # Hero selection page
├── world.js                # Full-page world renderer and input handling
├── index.html              # Hero selector page
├── world.html              # Full-page game world
└── README.md               # Documentation
```

### Authoritative Server Backend
- **[`src/hero-lab/world.js`](file:///c:/Users/William/Documents/GitHub/QuizQuest/src/hero-lab/world.js)**: Runs the authoritative server loop on the `/hero-lab` Socket.IO namespace. It manages players, waves, enemy targeting, projectiles, collisions, and game over.

---

## Gameplay Mechanics

1. **The Campfire**:
   - Positioned in the center of the 1920 × 1080 arena `(960, 540)` with 100 HP.
   - Emits an animated warm fire glow and displays a health bar.
   - If monsters reach the campfire, they deal contact damage over time.

2. **Zombie Monsters (`🧟`)**:
   - Spawn outside the arena boundaries and march toward the campfire.
   - Feature individual health bars and contact hitboxes.
   - Take damage and get knocked back/eliminated when struck by projectiles.

3. **Devils (`😈`)**:
   - One enemy in every five spawned chases the closest living player.
   - Contact attacks damage that hero. A hero who reaches 0 HP gets game over and returns to hero selection.

4. **Waves**:
   - Wave `n` contains `5 + n × (2 + n)` enemies, so wave 1 starts with 8.
   - After all enemies are defeated, the next wave starts after a five-second break.

3. **Authoritative Combat**:
   - The client sends a fire request; the server calls the selected hero's `fire()` method and creates any projectile.
   - The Flamekeeper's **Ember Staff** launches blazing red fireballs in the aimed direction.
   - Projectile collisions are evaluated by the server, which broadcasts `hit` and `monster_killed` events.
   - Floating damage numbers (`-10`) and particle sparks burst when monsters are struck.

---

## Socket.IO Protocol (`/hero-lab`)

### Client to Server
- **`join`** `{ heroId: string }`: Selects a hero and spawns into the field.
- **`input`** `{ up: boolean, down: boolean, left: boolean, right: boolean }`: Sends directional key state.
- **`aim`** `{ x: number, y: number }`: Sends normalized aim vector.
- **`fire`** `'primary' | 'secondary'`: Requests weapon firing; the server creates and broadcasts any projectile.
- **`skill`**: Requests the selected hero's skill.
- **`ultimate`**: Activates the selected hero's ultimate.

### Server to Client
- **`welcome`** `{ you: socketId, arena: { width, height } }`: Initial handshake upon joining.
- **`state`** `{ wave, campfire, monsters, players, projectiles }`: Broadcast 30 times per second with authoritative world state.
- **`hit`** `{ type, id, x, y, damage }`: Emitted when an entity is damaged.
- **`monster_killed`** `{ id, x, y }`: Emitted when an enemy's health reaches zero.
- **`game_over`**: Sent to a player when their hero dies.

---

## Extending Hero Lab

The `Hero` base class owns shared health and combat stats. Each specific hero
defines its own `fire()`, `skill()`, and `ultimate()` methods. For primary fire,
the client sends a fire request; the server calls the selected hero's `fire()`.
The hero returns a projectile instance, and the server assigns its ID and adds
it to the world. The world advances projectiles and checks collisions. A
projectile's `onHit(target)` returns `true` to remove it or `false` to let it
continue; each projectile can hit a target only once.

### Adding a New Hero
1. Create a new file in `public/hero-lab/heroes/my-hero.js`:
   ```javascript
   import { Hero } from '../bases/hero.js';
   import { LightningBolt } from '../projectiles/lightning-bolt.js';

   export class MyHero extends Hero {
     constructor() {
       super({
         id: 'my_hero',
         name: 'My Hero',
         emoji: '⚡',
         hp: 110,
         attack: 15,
         defense: 6,
         speed: 220,
       });
       this.weaponName = 'Lightning Wand';
       this.skillName = 'Spark';
       this.ultimateName = 'Thunderstorm';
     }

     fire(mode) {
       if (mode !== 'primary') return null;
       return new LightningBolt({
         x: this.position.x + this.aim.x * 24,
         y: this.position.y + this.aim.y * 24,
         aim: this.aim,
       });
     }

     skill() {
       return `${this.name} used Spark`;
     }

     ultimate() {
       return `${this.name} used Thunderstorm`;
     }
   }

   export const myHero = new MyHero();
   export default myHero;
   ```
2. Register the hero class and an instance in [`public/hero-lab/hero-list.js`](file:///c:/Users/William/Documents/GitHub/QuizQuest/public/hero-lab/hero-list.js). The instance appears in the selector; the server uses the class to create a separate hero for each player.

### Adding a New Projectile Type
1. Create a class in `public/hero-lab/projectiles/` extending `Projectile` from `../bases/projectile.js`. Set its own defaults, including projectile speed.
2. Implement custom `.draw(context)` for visual effects (e.g. trails, glow, particle emitters).
3. Return `new LightningBolt({ x, y, aim: this.aim })` from the hero's `fire(mode)` method. The server assigns its ID and adds the returned instance to the world.

---

## Automated Tests

Run the backend unit tests:
```bash
node --test test/hero-lab-test.js
```

Run the end-to-end Playwright browser tests:
```bash
node --test --test-name-pattern=hero test/browser.test.cjs
```
