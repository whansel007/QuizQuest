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
- `hero.js` defines the shared `Hero` class and three sample hero definitions,
  with stats, weapon, skill, ultimate, talent, and buff slots. The live
  position and aim used in a game session are held by the server.
- `main.js` handles hero selection, sends keyboard and aim input over
  Socket.IO, and draws the latest server snapshot on the canvas.
- `../../src/hero-lab/world.js` owns the live player state and movement loop.
  It accepts input, updates positions, and emits snapshots on the `/hero-lab`
  Socket.IO namespace.

Open the page in multiple tabs to see each other's heroes. The browser sends
held-key state and aim direction; the server owns player positions and
broadcasts the shared state at 30 ticks per second. The browser renders those
snapshots with `requestAnimationFrame`, similar to the actual multiplayer World
in `src/world/world.js` and `web/src/student/WorldView.vue`. Hero Lab deliberately
has no login, class rooms, enemies, or combat resolution. Left/right-click
fire is acknowledged by the server for demonstration; the skill and ultimate
buttons only log their descriptions. E tests the skill, Q tests the ultimate,
and F (or the Fullscreen button / double-click) toggles fullscreen mode.

The "Test AI" button sends a request to NVIDIA NIM (`deepseek-ai/deepseek-v4.1-flash`)
asking for a multiple choice question about AI and prints the model's response to the
browser console. To configure the API key, set `NVIDIA_API_KEY=nvapi-...` in `.env`,
or set `NVIDIA_API_KEY` in `public/hero-lab/main.js`.

To add a hero, add its definition to `HEROES` in `hero.js`. The shared class
constructs it and the selector lists it automatically.
