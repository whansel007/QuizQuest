# Hero test field

This folder contains a small, standalone hero sandbox under the existing
`public/` static-assets directory. Its page and renderer are separate from the
main Vue application, but its realtime game loop runs on the shared Node
server. The server maps `/hero-lab` to this folder, and Vite forwards that URL
to the server in development.

## Run it

From the repository root:

```bash
npm run dev
```

Open <http://localhost:5173/hero-lab>. To try the production server instead,
build the app with `npm run build`, run `npm start`, and open
<http://localhost:3000/hero-lab>.

## What's in this folder

- `index.html` provides a hero list, canvas world, stats, action buttons, and
  action log.
- `hero.js` defines the shared `Hero` class and sample hero definitions.
- `weapon.js` defines the modular `Weapon` class with custom firing logic.
- `skill.js` defines the `Skill` class.
- `ultimate.js` defines the `Ultimate` class.
- `enemies.js` / `enemy.js` defines the `Enemy` base class and `Zombie` enemy.
- `main.js` handles hero selection, sends keyboard and aim input over
  Socket.IO, and draws the latest server snapshot on the canvas.
- `../../src/hero-lab/world.js` owns the live player state, monsters, campfire, and movement loop.
  It accepts input, updates positions, and emits snapshots on the `/hero-lab`
  Socket.IO namespace.

Open the page in multiple tabs to see each other's heroes. The browser sends
held-key state and aim direction; the server owns player positions and
broadcasts the shared state at 30 ticks per second. The browser renders those
snapshots with `requestAnimationFrame`, similar to the actual multiplayer World
in `src/world/world.js` and `web/src/student/WorldView.vue`. Hero Lab deliberately
has no login or class rooms. The center features a shared campfire with a health
bar that players defend against zombie monsters (`🧟`) that advance from outside the arena.
Left/right-click fire is acknowledged by the server (with the Flamekeeper's
Ember Staff actively firing blazing red fireballs in the mouse aim direction to damage and defeat zombies);
the skill and ultimate buttons only log their descriptions. E tests the skill,
Q tests the ultimate, and F (or the Fullscreen button / double-click) toggles fullscreen mode.

The "Test AI" button sends a request to NVIDIA NIM (`deepseek-ai/deepseek-v4.1-flash`)
asking for a multiple choice question about AI and prints the model's response to the
browser console. To configure the API key, set `NVIDIA_API_KEY=nvapi-...` in `.env`.

To add a hero, add its definition to `HEROES` in `hero.js`. The shared class
constructs it and the selector lists it automatically.
