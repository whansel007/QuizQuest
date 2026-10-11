# Hero test field

This folder contains a small, standalone hero sandbox under the existing
`public/` static-assets directory. It is separate from the main Vue
application: its HTML, styles (none required), hero objects, and game-loop
code live here. The shared Node server maps the `/hero-lab` URL to this folder,
and Vite forwards that URL to the server in development.

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
- `hero.js` defines the shared `Hero` class and three sample hero instances.
  Each instance has its own stats, weapon, skill, ultimate, talent, and buff
  slots, along with position and aim direction.
- `main.js` connects the page to the hero objects. It handles selection,
  keyboard movement, mouse aiming, canvas rendering, and test action buttons.

The field has no enemies or combat implementation. Testing an action only
adds a description to the log. WASD or arrow keys move the selected hero; the
mouse points an arrow from the hero toward the pointer; left-click activates
primary fire and right-click activates secondary fire (logged to the console and
action log); E tests the skill, Q tests the ultimate, and F (or the Fullscreen
button / double-click) toggles fullscreen mode.

The "Test AI" button sends a request to NVIDIA NIM (`deepseek-ai/deepseek-v4.1-flash`)
asking for a multiple choice question about AI and prints the model's response to the
browser console. To configure the API key, set `NVIDIA_API_KEY=nvapi-...` in `.env`,
or set `NVIDIA_API_KEY` in `public/hero-lab/main.js`.

To add a hero, add its definition to `HEROES` in `hero.js`. The shared class
constructs it and the selector lists it automatically.
