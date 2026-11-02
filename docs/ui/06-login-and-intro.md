# 06 — Login and intro

## 1. WHAT THE PLAYER SEES

Signed-out students see the login/sign-up flow over a colorful campfire-and-kingdom scene. A party of heroes walks around while the view glides across the town. Login has email then password steps, account creation and a demo-account path where enabled. Once a student signs in, the app selects Kingdom.

## 2. HOW IT WORKS

The UI layout and form are DOM/CSS in `LoginView.vue`; the campfire is inline SVG in `LoginCampfire.vue` with CSS keyframes; the town showcase is a canvas in `LoginPreview.vue`. **Camera pan** means shifting the view's window across a wider scene, like panning a camera over a miniature set. Here JavaScript changes the canvas transform/camera center; it is not a CSS background pan. `cameraCentre(time)` alternates between configured world-center points; an easing function `t*t*(3-2*t)` smooths the travel. Hero walkers draw from cached static town art and animate their positions in the same rAF loop.

Form flow: `LoginView.vue` keeps a `page` and `step` state, validates required inputs and calls `signIn()` or `signUp()` from `api.js`. Sign-in sends `POST /api/login`; signup sends `POST /api/register`. `api.js:startSession()` stores the returned token in per-tab session storage and sets `S.me`; students are routed to `kingdom`. On reload, `restoreSession()` calls `GET /api/me`; invalid sessions clear. Login demo account loader is `loadDemo()` and the hidden version/debug controls are gated by tap/code behavior in the same component.

There are two separate camera motions. The login showcase pan described above happens while signed out and is decorative. After sign-in, the Kingdom town camera follows the student's character whenever the viewport cannot show the active town/north zone at once; this includes a desktop browser window snapped to one side. `KingdomTown.vue:cameraTarget()` centers on the player and clamps to zone edges, while `updateCamera()` eases toward that target. `KingdomView.vue` also has a first-visit tour (`maybeStartIntro/openIntro/nextIntro`); the tour is an overlay/spotlight, not the camera-follow behavior.

## 3. WHERE IT LIVES

- Form and hidden controls: `web/src/LoginView.vue`: `go`, `next`, `back`, `submit`, `register`, `loadDemo`, `tapVersion`, `enterDebugCode`.
- Showcase and pan: `web/src/components/LoginPreview.vue`: `ease`, `cameraCentre`, `tick`, `resize`; canvas sizing.
- Campfire: `web/src/components/LoginCampfire.vue`, CSS animations in component.
- Session routing: `web/src/api.js`: `signIn`, `signUp`, `startSession`, `restoreSession`; shell gate in `web/src/App.vue`.
- Kingdom intro: `web/src/student/KingdomView.vue`: `maybeStartIntro`, `openIntro`, `nextIntro`, `closeIntro`.

## 4. DATA AND TIMING

The login preview pan uses elapsed time and a rAF callback; `PAN_SPEED=34` world pixels/second and `PAN_REST_MS=1600` are in `LoginPreview.vue`; travel duration is calculated from distance divided by speed. The backdrop loop targets 30 FPS, stops/cleans up on component unmount and holds a still camera when reduced motion is requested. Separately, the Kingdom camera follows the student when the app window is narrow; see `03-kingdom-town.md`. SVG campfire has CSS animations: flames 1.6s, flame sway 1.1s, glow 2.4s, spark 2.8s. Login session requests are event-driven; no polling. Fresh student sign-in lands on Kingdom. On reload, `App.vue` restores the session but `S.tab` begins null, so `App.vue:current` falls back to the first role tab; a student's first tab in `TABS.student` is Kingdom.

## 5. HOW TO CHANGE IT

1. “Make the login town camera pan last X milliseconds by changing the relevant `PAN_*` constants in `LoginPreview.vue`; preserve smoothstep easing.”
2. “Change the login campfire flicker speed by editing the CSS animation duration in `LoginCampfire.vue`; keep the SVG flame layers intact.”
3. “Change the student landing tab after sign-in by editing `startSession()` in `web/src/api.js`; do not change teacher routing.”
4. “Add a signup field by updating `LoginView.vue` form state/validation and the matching server `/api/register` handler; do not send an unsupported field only from the browser.”

## 6. GOTCHAS

- The background pan is canvas camera math; CSS changes to the login panel will not alter it.
- Showcase motions are intentionally decorative and should respect reduced-motion preference.
- Authentication success and user role come from the server response; the client should not invent a student identity.
- The hidden debug/version dialog is in LoginView but is not an ordinary student-facing route.
