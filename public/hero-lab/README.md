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
mouse points an arrow from the hero toward the pointer; E tests the skill and
Q tests the ultimate.

To add a hero, add its definition to `HEROES` in `hero.js`. The shared class
constructs it and the selector lists it automatically.
