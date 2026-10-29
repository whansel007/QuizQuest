# Hero test field

This folder contains the hero field under the existing `public/` static-assets
directory. It is separate from the main Vue application: its HTML, styles
(none required), hero objects, and game-loop code live here. The shared Node
server maps the `/hero-lab` URL to this folder, and Vite forwards that URL to
the server in development.

## Run it

From the repository root:

```bash
pnpm dev
```

Open <http://localhost:5173/hero-lab>. To try the production server instead,
build the app with `pnpm build`, run `pnpm start`, and open
<http://localhost:3000/hero-lab>.

## What's in this folder

Two pages, one per step:

- `index.html` is the hero picker. `picker.js` lists the heroes and hands the
  chosen one over to the arena.
- `world.html` is the arena. `world.js` connects the page to the hero objects:
  selection, keyboard movement, mouse aiming, canvas rendering, and the HUD.

The pieces they share:

- `bases/hero.js` defines the shared `Hero` class. Each instance has its own
  stats, weapon, skill, ultimate, talent, and buff slots, along with position
  and aim direction.
- `hero-list.js` exports `HEROES`, the heroes the picker offers.
- `heroes/`, `enemies/`, `projectiles/` and `bases/` hold the individual
  classes, `game-config.js` the tuning, and `arena-audio.js` the sound.
- `README_HERO-LAB.md` is the guide to the heroes themselves.
- `test-ai.js` is the professor-only "Test AI" check. It stays inert until the
  page has a `#test-ai-btn` element - see the note below.

WASD or arrow keys move the selected hero; the mouse points an arrow from the
hero toward the pointer; left-click activates primary fire and right-click
activates secondary fire; E uses the skill and Q uses the ultimate.

The professor-only "Test AI" check has no button in the pages at the moment.
The handler is in `test-ai.js`, and it does nothing until the page has a
`#test-ai-btn` element. To switch it on, add that button to `world.html`:

```html
<button id="test-ai-btn" type="button">Test AI</button>
```

The endpoint is `POST /api/hero-lab/test-ai`: it needs a professor session and
uses the shared Gemini client, capped at three attempts. Configure
`GEMINI_API_KEY` and `GEMINI_MODEL` in the backend `.env`. Never put API
credentials in browser files. The shared Gemini quota limits apply.

To add a hero, add its definition to `HEROES` in `hero-list.js`. The shared
class constructs it and the picker lists it automatically.
