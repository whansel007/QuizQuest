# 04 — Avatar and cosmetics

## 1. WHAT THE PLAYER SEES

The student sees a small gray cat-like avatar in the town and can preview/equip coat colors and wardrobe items in the Castle. The same player visual appears in other surfaces when that surface requests it; hero art and the student's avatar are separate systems.

## 2. HOW IT WORKS

The visible avatar uses a source sprite image split into named frames. A **sprite** is a picture used as a character frame, like one drawing in a flipbook. `avatar.js` fetches the avatar configuration, loads its source image, crops frames into offscreen canvas images, and can tint the player frame to a selected color. `tintedPlayerFrames()` caches colored versions by color to avoid repeating pixel work. `KingdomTown.vue` draws those frames; `AvatarPreview.vue` draws the same family in the Castle wardrobe and is also used by `QuizRunner.vue` for the quiz-side preview; `AvatarPreview` draws cosmetic overlays too. The shared `drawAvatarCosmetics()` art helper is used across Castle mirror, Duel, World and walkable Kingdom paths (documented by its source comment in `avatar.js`); the arena iframe renders avatar visuals through its own world code and shared art helper.

The frame is painted in parts in a fixed order: body/base image, then equipped hat/accessory overlay via `drawAvatarCosmetics()` from `kingdom/avatar-cosmetics.js`. This repository does not assemble every body feature (ears, ball and eyes) as independent shapes in the town; the base art is an image/sprite. Do not describe it as separate ear/eye geometry without checking the actual sprite asset/config.

Color flow: `KingdomView.vue` initializes preview/current wardrobe colors from `S.me.avatarColor` (fallback `TOWN_AVATAR_DEFAULT_COLOR = '#F2BA55'`). The Castle wardrobe saves color and equipped items together through `PUT /api/student/castle/wardrobe/loadout` in `saveWardrobeLook()`. Server handlers in `src/quiz/api.js` validate and save the color; its nested `validatedAvatarColor()` helper validates it before assignment. On success the view updates `S.me.avatarColor` and `S.me.avatarVisual`; the selected color is passed into `KingdomTown`, which requests cached tinted frames. Preset colors and allowed lightness bounds are in `config/tuning.js`; server-side validation means the UI alone is not the security boundary.

Wardrobe state in `KingdomView.vue` includes `wardrobeCatalog`, `wardrobeOwnedIds`, `wardrobeResources`, `wardrobeEquipped` and selected hat/accessory. It loads `GET /api/student/castle/wardrobe`, displays it in a DOM panel, and previews with `AvatarPreview`. `config/avatar-cosmetics-data.json`, `config/avatar-cosmetics.js` and `web/src/student/kingdom/avatar-cosmetics.js` describe the cosmetic catalog and art hooks; hats and accessories are implemented slots. New slots would need data/catalog support, rendering order/art in `drawAvatarCosmetics`, preview wiring, and server validation/ownership/equip persistence—not only an image.

## 3. WHERE IT LIVES

- Sprite loading/tint/cache: `web/src/student/avatar.js`: `loadPlayerVisuals`, frame creation, `tintedPlayerFrames`, `drawCosmeticIcon`.
- Town player rendering: `web/src/student/KingdomTown.vue` (props `avatarColor`, `avatarVisual`; `playerFrames`).
- Preview: `web/src/student/AvatarPreview.vue` and `CosmeticIcon.vue`.
- Player cosmetic art: `web/src/student/kingdom/avatar-cosmetics.js`, definitions in `config/avatar-cosmetics.js` and `config/avatar-cosmetics-data.json`.
- Castle wardrobe panel and saving: `web/src/student/KingdomView.vue`: `loadWardrobe`, `saveWardrobeLook`, `claimWardrobeCosmetic`.
- Server validation/persistence: `src/quiz/avatar.js`, routes `POST /api/student/avatar/color`, `GET /api/student/castle/wardrobe`, `POST /api/student/castle/wardrobe/purchase`, `PUT /api/student/castle/wardrobe/loadout` in `src/quiz/api.js`, persistence layer in `src/quiz/store.js` / database adapter.
- Arena avatar art is a separate implementation under `public/hero-lab/`.

## 4. DATA AND TIMING

`AvatarPreview.vue` uses a canvas with CSS display size 132×132, intrinsic width/height 144×144, and device-pixel backing up to 3×. It redraws when color or equipped cosmetics change and uses a timeout based on visual `IDLE_FPS` (fallback 5) for blinking unless reduced motion is requested. Color change invalidates/selects a tint-cache entry; it is not a CSS filter transition. Saved color and cosmetics are account data; preview selection is local Vue state until save succeeds.

## 5. HOW TO CHANGE IT

1. “Add preset coat color `#...` to `TOWN_AVATAR_PRESET_COLORS` in `config/tuning.js`; keep server validation bounds and contrast checks consistent.”
2. “Change the default town avatar color by changing `TOWN_AVATAR_DEFAULT_COLOR` in `config/tuning.js` and check the login/preview defaults.”
3. “Add a hat cosmetic by adding its catalog definition and draw branch in `kingdom/avatar-cosmetics.js`, then wire owned/equipped data and preview in `KingdomView.vue`.”
4. “Change avatar blink speed in the avatar visual config's `IDLE_FPS`; keep frame crop names unchanged.”
5. “Make a new avatar color visible in the arena as well as the town by updating the arena's separate avatar rendering path under `public/hero-lab/`.”

## 6. GOTCHAS

- Town, preview, separate world, and arena render avatar art through different components; a change may not propagate everywhere automatically.
- Tinted frames are cached per color; changing how tint pixels are computed may require cache invalidation.
- The student selects a preview before the server accepts the saved look; show server errors and restore server data on failure.
- Sprite source/config file values should be treated as the authority for exact ears/eyes/frame layout; the code does not draw all body parts separately.
