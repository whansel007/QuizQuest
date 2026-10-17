# Hero Lab (Hero Test Field)

A standalone multiplayer 2D top-down sandbox where players select heroes, test weapons and abilities, and defend a central campfire from invading zombie monsters in realtime.

The client renderer runs as native ES modules in the browser (rendered with Canvas 2D and HTML5), while an authoritative game loop runs on the Node.js server at 30 ticks per second over Socket.IO.

---

## Quick Start

From the repository root:

```bash
npm run dev
```

Open [http://localhost:5173/hero-lab](http://localhost:5173/hero-lab) in your browser.

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
| **Primary Fire** | Left Mouse Click | Launches the hero's primary weapon attack (e.g. Flamekeeper launches a red Fireball) |
| **Secondary Fire** | Right Mouse Click | Triggers secondary weapon firing mode |
| **Test Skill** | `E` Key or Action Button | Tests the hero's skill ability (logs output to action log) |
| **Test Ultimate** | `Q` Key or Action Button | Tests the hero's ultimate ability (logs output to action log) |
| **Fullscreen** | `F` Key, Button, or Double-click | Toggles fullscreen view centered with dark backdrop |

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
│   ├── zombie.js           # Zombie (🧟) with contact damage and health bar
│   └── index.js            # Barrel re-export for enemies
│
├── projectiles/            # Projectile implementations
│   ├── fireball.js         # Fireball with radial glow, ember trail, and particles
│   └── index.js            # Barrel re-export for projectiles
│
├── hero-list.js            # Single Source of Truth for available HEROES array
├── main.js                 # Client-side renderer, input handling, and particle FX
├── index.html              # Standalone web interface & hero selector
└── README.md               # Documentation
```

### Authoritative Server Backend
- **[`src/hero-lab/world.js`](file:///c:/Users/William/Documents/GitHub/QuizQuest/src/hero-lab/world.js)**: Runs the authoritative server loop on the `/hero-lab` Socket.IO namespace. It manages player positions, monster spawning from outer bounds, monster pathing toward the campfire, projectile simulation, collision detection, and campfire health.

---

## Gameplay Mechanics

1. **The Campfire**:
   - Positioned in the center of the arena `(400, 250)` with 100 HP.
   - Emits an animated warm fire glow and displays a health bar.
   - If monsters reach the campfire, they deal contact damage over time.

2. **Zombie Monsters (`🧟`)**:
   - Spawn outside the arena boundaries and march toward the campfire.
   - Feature individual health bars and contact hitboxes.
   - Take damage and get knocked back/eliminated when struck by projectiles.

3. **Authoritative Combat**:
   - Firing is implemented by each hero, with shared activation details handled by the `Hero` base class.
   - The Flamekeeper's **Ember Staff** launches blazing red fireballs in the aimed direction.
   - Projectile collisions are evaluated by the server, which broadcasts `hit` and `monster_killed` events.
   - Floating damage numbers (`-10`) and particle sparks burst when monsters are struck.

---

## Socket.IO Protocol (`/hero-lab`)

### Client to Server
- **`join`** `{ heroId: string }`: Selects a hero and spawns into the field.
- **`input`** `{ up: boolean, down: boolean, left: boolean, right: boolean }`: Sends directional key state.
- **`aim`** `{ x: number, y: number }`: Sends normalized aim vector.
- **`fire`** `'primary' | 'secondary' | { mode, aim }`: Requests weapon firing.

### Server to Client
- **`welcome`** `{ you: socketId, arena: { width, height } }`: Initial handshake upon joining.
- **`state`** `{ campfire, monsters, players, projectiles }`: Broadcast 30 times per second with authoritative world state.
- **`fired`** `{ mode, hero, position, aim, timestamp }`: Acknowledges weapon activation.
- **`projectile_spawn`** `{ id, ownerId, heroId, x, y, vx, vy, radius, color }`: Broadcasts newly spawned projectiles.
- **`hit`** `{ type, id, x, y, damage }`: Emitted when an entity is damaged.
- **`monster_killed`** `{ id, x, y }`: Emitted when an enemy's health reaches zero.

---

## Extending Hero Lab

### Adding a New Hero
1. Create a new file in `public/hero-lab/heroes/my-hero.js`:
   ```javascript
   import { Hero } from '../bases/hero.js';

   export class MyHero extends Hero {
     constructor(options = {}) {
       super({
         id: 'my_hero',
         name: 'My Hero',
         emoji: '⚡',
         hp: 110,
         attack: 15,
         defense: 6,
         weaponName: 'Lightning Wand',
         weaponDescription: 'casts lightning at the aimed point.',
         skillName: 'Spark',
         skillDescription: 'shocks nearby targets',
         ultimateName: 'Thunderstorm',
         ultimateDescription: 'calls lightning strikes',
         talent: { name: 'Static Charge', description: 'builds charge while moving' },
         ...options,
       });
     }
   }

   export const myHero = new MyHero();
   export default myHero;
   ```
2. Register your hero instance in [`public/hero-lab/hero-list.js`](file:///c:/Users/William/Documents/GitHub/QuizQuest/public/hero-lab/hero-list.js). It will automatically appear in the hero selection UI and server registry.

### Adding a New Projectile Type
1. Create a class in `public/hero-lab/projectiles/` extending `Projectile` from `../bases/projectile.js`.
2. Implement custom `.draw(context)` for visual effects (e.g. trails, glow, particle emitters).
3. Return its configuration from a weapon's `fire(hero, mode)` method.

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
