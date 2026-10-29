# Mobile Student Experience Plan

## Goal

Make the student experience practical on both laptops and phones, with the game and quiz as the first priorities. The same screens should adapt to the device; laptop keyboard and mouse play must remain fully supported. The game will have a left-side on-screen thumbstick for touch movement.

The Kingdom page must also fit and remain usable on a phone. Portrait should be supported, with landscape treated as its preferred mobile presentation. The quiz must work in both portrait and landscape without asking the student to rotate their device.

## Current state

- The app already has responsive layouts for several student screens, including the practice setup and Hero Lab lobby.
- The practice quiz has a narrow-screen layout, but its battle scene and question flow still need to be checked on real phone-sized viewports.
- The game HUD has some small-screen CSS. In-run movement currently depends on WASD, aiming and firing depend on pointer input, and abilities use keyboard keys. That makes the game lobby browseable on mobile but the actual game is not yet fully touch-playable.
- The game runs in its own page and is embedded by the student view, so touch controls and viewport sizing need to work both standalone and in the embedded frame.

## How game input works today

The in-run arena is a fixed 1920×1080, 16:9 canvas. The canvas scales to fit the viewport while keeping that aspect ratio, and the HUD is positioned separately against the viewport. The small-screen CSS moves and compacts some HUD elements, but it does not change the input model or add touch controls.

- **Movement:** WASD or arrow keys set four held direction flags. The client sends those flags to the game server as input state; movement and collision are applied by the server.
- **Aim:** pointer movement over the canvas is converted from screen coordinates into arena coordinates. The client sends a direction vector from the player's position to that point, with aim updates rate-limited. A pointer press also sends an immediate aim update.
- **Primary weapon:** left mouse press sends one shot and starts a held-fire state. The server repeats shots at the hero's weapon cooldown while held. Releasing the pointer stops held fire. Aim and fire are separate states: moving the pointer aims, while holding the mouse button fires.
- **Secondary fire:** right mouse button sends the secondary-fire event. It is only used to confirm the Bombardier's targeted ultimate; there is no general secondary weapon for the current heroes.
- **Skill and ultimate:** E emits the skill event; Q emits the ultimate event. They use the most recently received aim where the hero's ability is directional. The current HUD shows ability icons, cooldowns, and E/Q/M1 key labels, but those items are display elements rather than touch buttons.
- **Targeting and panels:** Bombardier's ultimate enters a temporary targeting mode. A map click chooses the strike location, and Escape cancels it; right-click also confirms it. I opens the information panel.
- **Release handling:** the client clears held movement on window blur and held primary fire on any pointer-up or pointer-cancel. Touch input will need pointer-ID-aware cleanup so releasing one finger cannot stop another active control or leave a state held.

### Ability-to-aim dependency by hero

| Hero | Skill | Ultimate | Mobile implication |
| --- | --- | --- | --- |
| Sheriff | Dynamite projectile follows current aim. | Bullet Rush fires repeatedly in the current aim direction while primary fire is held. | Primary hold/drag aims while firing; hold/drag Skill to aim Dynamite, release to throw. |
| Guardian | Shield Rush locks its dash and ending fan to current aim when cast. | Unbreakable Charge activates the charge; movement input steers the run. | Hold/drag Skill to set dash direction, release to cast; movement stick still steers the charge. |
| Pilot | Normal form dashes along current aim; mech form's Impact Dash also uses aim. | Mech Suit is a timed form activation. | Hold/drag Skill to aim either dash; tap Ultimate to activate the mech. |
| Bombardier | Proximity Trap is placed at the player's position. | Enters targeted mode, then a map point is chosen before timeout. | Tap Skill to place the trap; hold Ultimate, drag to a battlefield point, and release to confirm the strike. |
| Bubbles | Bubble Trap projectile follows current aim. | Bubble Rush is a timed close-range rush around the player. | Hold/drag Skill to aim Bubble Trap; tap Ultimate to start the area rush. |
| Electromancer | Stun Field projectile follows current aim. | Chain Lightning attacks around the player. | Hold/drag Skill to aim Stun Field; tap Ultimate to chain around the player. |

The key design constraint is that aiming is shared state, not an argument passed with each skill press. Aim-dependent abilities use the last aim vector the server received. Mobile controls must therefore update aim before sending an ability event, including when the player taps a skill without recently aiming or firing.

## Experience and input design

### Shared student shell

- Keep the existing laptop navigation and inputs.
- Make navigation and account controls reachable by touch without hover or pointer movement.
- Use viewport-safe sizing, including mobile browser chrome and device safe-area insets. Avoid locking page scrolling globally; only game surfaces should suppress browser gestures while actively playing.
- Use responsive behavior based on available width and touch capability where appropriate, rather than treating every narrow window as a phone.

### Game world

- Add a virtual thumbstick anchored in the lower-left control area. It should respond to touch and pen, support continuous directional movement, clamp to a comfortable radius, and return to neutral when released, cancelled, or interrupted.
- Preserve keyboard movement on laptops. Touch input should feed the existing movement intent so server-side movement, collision, and multiplayer state remain authoritative.
- Use one fixed movement thumbstick on the left and MOBA-style hold-and-drag aiming on the ability controls at the right. There is no separate aim stick: the player chooses what to do by touching Primary, Skill, or Ultimate, then drags from that control to set the aim direction.
- **Primary:** touch and hold starts continuous primary fire; drag while holding to steer aim; release stops firing. Send an immediate first shot on press, matching the existing mouse behavior.
- **Directional Skill or Ultimate:** touching the ability enters its aim state; dragging sets aim; releasing casts in that direction. A short tap can cast using the latest aim, with a clear visual cue when the control has entered aim mode. This should avoid requiring a separate confirm button for ordinary directional casts.
- **Non-directional abilities:** keep a simple tap to activate. Do not force players to drag for abilities that use no aim vector.
- Make the ability controls real, touch-sized buttons with the current cooldown/readiness feedback, hero-specific icons, and names. Preserve E/Q keyboard shortcuts on laptops.
- Preserve pointer aiming and click/hold firing on laptops. Keep the existing E and Q shortcuts, keyboard cancellation, I information shortcut, and right-click behavior where applicable.
- Support simultaneous left-stick movement and a right-hand ability drag. Track pointer IDs independently; releasing the ability touch must not release movement. Handle `pointercancel`, tab/app interruption, and window focus loss, and prevent stuck movement, aim, or fire states.
- For Bombardier's targeted ultimate, holding the Ultimate button enters target-placement mode; dragging that same touch onto the arena moves the strike marker and previews its radius, and releasing confirms the location. Provide an explicit cancel action, clear timeout feedback, and a safe cancel when the touch is interrupted. Do not let primary-fire hold accidentally confirm a target.
- Keep the selected action and its aim gesture connected in the client, then send the latest aim before the existing ability event. This avoids stale server aim while leaving server-side combat rules authoritative.
- Keep important HUD values readable around the control zones. On small screens, reposition or compact wave, campfire health, hero health, room code, and action controls so they do not cover the playfield or each other.
- Keep portrait usable, while making landscape play comfortable. Offer a gentle rotate-device hint only if a particular screen is too constrained; do not force orientation.
- Make controls discoverable in the briefing/help UI, with different instructions for keyboard/mouse and touch.

### Quiz and practice

- Review the setup, active question, feedback, and result states at phone widths and short landscape heights.
- Keep the question text and answer controls in a clear reading order, with no horizontal scrolling. Make answer options and primary actions comfortably tappable (target at least 44 CSS px where practical).
- Preserve quiz battle feedback while reducing decorative arena height on narrow or short screens so the active question and answers appear without excessive scrolling.
- Ensure timer, retry, report, next-question, and end-of-quiz controls remain visible, understandable, and keyboard accessible.
- Check text-entry question types, math, images, and long prompts as well as multiple choice.

### Kingdom

- Make the Kingdom page fit within the available mobile viewport without clipping essential status, navigation, or interaction controls.
- Support portrait as a complete usable layout. Prefer landscape for the richer town view, using the additional width for the world and its supporting panels.
- In portrait, reorganize or collapse supporting panels and keep the town interaction reachable; avoid shrinking the whole desktop layout until text and controls become too small.
- Keep town canvas touch interaction, overlays, building details, and close/back actions reachable with one hand where practical.
- Adapt to mobile browser chrome, safe-area insets, and orientation changes without trapping the page in a stale size.

## Implementation phases

1. **Audit and baseline** — map student routes and game/quiz states; note overflow, clipped controls, keyboard-only actions, and the iframe viewport behavior at representative laptop and phone sizes.
2. **Touch input layer** — implement the left movement stick and MOBA-style hold/drag-to-aim behavior on the primary, skill, and ultimate controls; connect gestures to existing client input events while preserving keyboard and mouse. Handle multi-touch, cancellation, and safe release paths.
3. **Responsive game HUD** — tune control placement, sizing, safe areas, canvas sizing, and briefing/help for portrait, landscape, and short viewports.
4. **Responsive quiz flow** — refine setup and active quiz layouts, question types, touch targets, and vertical space usage across phone and laptop breakpoints.
5. **Kingdom responsive layout** — make the town and its panels fit on phone screens, retain a usable portrait arrangement, and give landscape the preferred roomy presentation.
6. **Student navigation and polish** — verify shell navigation, focus states, reduced motion, labels/instructions, and transition behavior between student screens and the embedded game.
7. **Device verification** — check representative viewport sizes and touch interactions, including game joystick plus fire input, ability activation, Kingdom portrait and landscape layouts, quiz use in both orientations, resize, reconnect, and laptop keyboard/mouse regression.

## Likely files to review or change

- `public/hero-lab/world.html` — in-game HUD and controls markup.
- `public/hero-lab/hud.css` — game control placement and responsive HUD.
- `public/hero-lab/world.js` — pointer and keyboard input handling, aim, firing, and cleanup.
- `web/src/student/HeroLabView.vue` — embedded game viewport and lobby-to-game handoff.
- `web/src/student/KingdomView.vue` and `web/src/student/KingdomTown.vue` — Kingdom page layout, panels, canvas sizing, and touch interaction.
- `web/src/student/QuizRunner.vue` and `web/src/student/QuestionForm.vue` — quiz states and input semantics.
- `web/src/app.css` — student shell and responsive practice/quiz layouts.

## Acceptance criteria

- A student can complete the full game loop on a touch phone: join or create a room, move with the left thumbstick, and aim/cast by holding and dragging the selected ability control on the right.
- The left movement stick works concurrently with a right-side primary, skill, or ultimate aim gesture. Primary fires while held; directional skills/ultimates cast on release; non-directional abilities remain easy to tap. Releasing or interrupting one touch never leaves movement or firing stuck.
- Directional skills use the latest aim direction even if no shot was fired immediately before activation.
- Bombardier can hold Ultimate, drag a target point with a visible radius preview, and release to confirm; cancel, timeout, and touch interruption recover cleanly.
- Laptop gameplay continues to support its existing keyboard and mouse controls without requiring touch controls.
- The Kingdom remains fully usable in portrait, presents its preferred mobile layout in landscape, and keeps essential content and controls within the usable screen area.
- Practice setup, question answering, feedback, and results work at narrow phone widths without horizontal page scrolling or clipped primary controls.
- Quiz setup, answering, feedback, and results are usable in both portrait and landscape without requiring device rotation.
- Keyboard navigation and visible focus remain available throughout the student experience.
- Mobile browser resizing, safe areas, embedded game sizing, and portrait/landscape transitions do not strand the player or hide essential controls.

## Out of scope for the first pass

- Replacing the game engine or changing authoritative game rules and balance.
- A separate native mobile app.
- Reworking teacher workflows, unless shared shell changes are required to avoid regressions.
- Forcing landscape orientation or removing laptop input paths.
