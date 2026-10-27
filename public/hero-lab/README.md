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
- `main.js` is the earlier single-page version of the field, from before the
  picker and the arena were split apart. No page loads it and the elements it
  reaches for are not on either page, so it is dead: it throws if it is
  loaded. Delete it, or move the "Test AI" handler into the arena first.

WASD or arrow keys move the selected hero; the mouse points an arrow from the
hero toward the pointer; left-click activates primary fire and right-click
activates secondary fire; E uses the skill and Q uses the ultimate.

The professor-only "Test AI" check has no button in the pages at the moment.
The endpoint is still there: `POST /api/hero-lab/test-ai` needs a professor
session and uses the shared Gemini client, capped at three attempts, so a
button can be wired to it from `world.html`. Configure `GEMINI_API_KEY` and
`GEMINI_MODEL` in the backend `.env`. Never put API credentials in browser
files. The shared Gemini quota limits apply.

To add a hero, add its definition to `HEROES` in `hero-list.js`. The shared
class constructs it and the picker lists it automatically.
