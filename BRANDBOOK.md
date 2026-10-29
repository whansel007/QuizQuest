# QuizQuest Brand Book (v0.2)

**Brand idea:** a cartoon storybook adventure about learning together around a campfire. The interface should feel like a page from a warm forest tale: inked characters, illustrated clearings, softly textured paper, and friendly game pieces.

This direction replaces the earlier dark-indigo, pixel-flavored proposal for the student experience. It keeps the cat heroes smooth and expressive and uses rounded storybook lettering, earthy forest colors, and warm parchment surfaces.

---

## 1. Personality and art direction

| We are | We are not |
|---|---|
| Whimsical, welcoming, adventurous | Babyish, noisy, or sarcastic |
| Hand-drawn and clearly readable | Corporate, glossy, or generic |
| Warm, curious, and encouraging | Dark, grim, or pressuring |
| A game world that supports learning | A game that distracts from learning |

Use a cartoon storybook look with confident outlines, simple expressive shapes, layered forest scenery, and warm light. Keep cat sprites smooth and recognizable. UI illustrations should look as if they were drawn for the same book as the heroes.

Paper texture is a quiet material detail. Use a fine, low-contrast fiber or speckle texture over parchment surfaces. Keep text and controls crisp above it. Texture must never interfere with reading.

---

## 2. Color palette

### Storybook foundation

| Token | Hex | Use |
|---|---|---|
| Forest | #32533E | Full-screen woodland scenes |
| Deep pine | #254937 | Headings and strong forest accents |
| Ink | #23382F | Body text, outlines, and illustration strokes |
| Parchment | #FBF2D8 | Cards, menus, and paper surfaces |
| Page light | #FFF8E4 | Highlighted paper and input fills |
| Earth shadow | #7A6545 | Hard offset shadows and pressed controls |

### Story accents

| Token | Hex | Use |
|---|---|---|
| Campfire gold | #F2BA55 | Main action and selected details |
| Ember | #EF7137 | Fire and warm illustration accents |
| Leaf | #7FAE58 | Garden, healing, and nature |
| Story blue | #6DB8CF | Library, sky, and defensive details |
| Lavender | #8062A9 | Magic and rare accents |
| Rose | #D86F6B | Book covers and small highlights |

Use dark ink on pale paper and on bright accents. Keep small text at accessible contrast. Use color together with labels, shapes, or icons; never make color the only indicator.

**Keep page palettes cohesive.** When a page adopts a palette variation, apply it as one coordinated system across the page background, navigation, cards, fields, buttons, feedback states, and dialogs. Avoid leaving old palette surfaces behind beside newly recolored components. Preserve contrast and reserve other colors for clearly meaningful status cues.

Keep the forest-and-parchment identity consistent across student pages. The World and Kingdom may use full forest scenes; reading and setup views such as Practice and My Progress should keep the paper surfaces and forest-green page chrome. Do not introduce a new page palette without carrying it through every surface and state on that page.

Hero stats may use distinct, pale tints: green for HP, peach for attack, blue for defense, and lavender for speed. Keep the numbers and labels dark.

---

## 3. Typography

| Role | Typeface | Use |
|---|---|---|
| Story titles | Georgia or Palatino Linotype | Page titles and important names |
| Body and controls | Nunito, Trebuchet MS, system UI | Instructions, buttons, and interface copy |
| Small labels | Cascadia Code or a system monospace | Compact uppercase section labels and room codes |

Keep the story title serif and prominent. Body copy should be friendly, short, and easy to scan. Small uppercase labels are secondary decoration and must remain readable. Avoid pixel fonts.

---

## 4. Shape, line, paper, and depth

- Use a 2–3 px warm dark-ink outline for important cards, buff tiles, and controls.
- Favor hand-cut paper corners with slight radius variation rather than perfectly pill-shaped everything.
- Use a firm, short offset shadow to make cards feel layered on a page. Reserve soft shadows for character grounding and scene lighting.
- Paper surfaces use the shared storybook-paper.svg texture over a cream base. Keep the texture subtle and repeating.
- Use dashed or hand-drawn rules for dividers inside the storybook UI.
- Bright action buttons use campfire gold with dark ink text and a darker hard shadow.
- Keep cards spacious enough to breathe, while allowing game menus to use the screen efficiently.

---

## 5. Student experience and screen layout

Game tabs are immersive spaces. World, Kingdom, and Summon fill the available viewport without the standard site footer or a persistent navigation bar taking up screen space. Practice and My Progress keep the navigation visible because they are reading and setup views; their content remains readable and scrollable.

The student navigation is fixed just above the top edge while hidden. Moving the pointer to the top edge brings it down; it stays visible while hovered or keyboard-focused and tucks away after the pointer leaves. Keyboard users can reveal it by focusing a navigation control. Keep this behavior limited to the student experience; teacher navigation remains normally visible.

### World / Campfire Chronicles

- Use a full-bleed forest clearing with square viewport edges; do not leave a white page rim or rounded outer frame.
- The party panel and the 2×2 camp-buff board sit at the upper left. The party panel has a clear horizontal divider between joining and hosting.
- Keep the selected hero’s stats and talent in a shallow strip above the hero on the right.
- In combat, preserve each enemy’s normal body and circle colors during stun, slow, pull, and hold effects. Show the state with small head icons only: ⚡ stunned, 🌀 pulled or held by a vortex, and 🐌 slowed. Never tint or add a colored status ring to an enemy, since that can reduce contrast. Place status icons higher over larger training dummies so they do not collide with the target or health bar.
- Mark area-of-effect boundaries with their colored dashed stroke and a soft fill. Keep the established stroke thickness, omit the black under-stroke, and favor muted storybook colors over neon white; use sage `#C2D7A7` for the campfire healing ring. The colored dash and fill should make the area clear without a heavy dark outline.
- Fairy’s combat effects use a pink-only palette, from bright pink through pale pink highlights. Keep the Vortex core near-black, but use pink for its rim, disk, arcs, wind trails, and debris; do not introduce teal or cyan accents.
- Let the campfire sit visibly left of center and anchor it to the ground line. Make the selected cat the largest character in the clearing, on the right, with its shadow directly below its base.
- Keep the hero selector as one horizontal paper strip along the bottom on wide screens.
- Include a short story line explaining the objective: choose a hero, gather friends, and keep the campfire alive.
- On narrow screens, stack the controls and allow scrolling rather than squeezing text or overlapping the hero.

### Other student pages

Use the same paper, forest, linework, and type. Apply navigation behavior according to the page modes above. Preserve each page’s task hierarchy and readable scrolling where its content needs more than one viewport.

### Kingdom building windows

Kingdom building windows are **in-world rooms and objects**, not generic application panels. Keep the town visible around the centered window. On desktop, use the approved near-full-screen footprint of about 82vw × 82vh, capped at 1540 × 900 px; on small screens, use nearly the full viewport and stack the feature without clipping controls.

The header is a narrow parchment sign or counter strip. It contains the building name and level, the close control, and only the building’s upgrade/effect controls. Put upgrade details behind a small, accessible information chip when the feature benefits from the space. Do not repeat upgrade copy in the feature scene.

Everything below the header must look like it belongs inside that building. Build the feature from illustrated environments and recognizable props: Library shelves with rows of visible books and a book that opens into a two-page story; Tower timber with pinned paper requests on the left and an offer-writing desk on the right; Garden night sky that fills the full lower scene, with constellations, occasional meteor showers, and a telescope on a small garden horizon; Workshop training paperwork, clipped member roster sheets, and a practice-yard illustration; Castle wardrobe mirrors, clothing, keepsake pins, color selections, and a live avatar view. Non-interactive scenery may decorate these spaces, but it must not look like disabled controls or compete with the working feature.

Avoid repeating the same rounded card treatment inside every building. Use paper notes, book pages, timber boards, stitched forms, shelves, ink annotations, clips, pins, and scene lighting as appropriate to the room. Preserve the shared forest-and-parchment palette, readable contrast, keyboard operation, visible focus, and reduced-motion behavior. The Garden telescope hand-off must cover the full viewport before switching to Summon, then reveal the destination without a blank flash; reduced-motion users receive a brief fade or immediate navigation.

For the Garden sky, reuse the Summon page's `SummonSky` canvas so star density, glimmer, meteor timing, and meteor direction stay consistent. Draw constellation paths with no fill and place distinct star points on the path; avoid distorted SVG aspect ratios. Keep Library book spines within a stable shelf height range and open the selected story as an overlay above the shelves. Keep Workshop paper and roster surfaces in parchment, sage, forest ink, and muted wood tones so the room belongs to the same palette.

---

## 6. Interface pieces

| Piece | Direction |
|---|---|
| Paper panel | Parchment fill, subtle fiber texture, ink outline, short hard shadow |
| Main action | Campfire-gold fill, dark text, clear pressed state |
| Secondary action | Parchment fill with dark outline |
| Input | Light paper fill, dark outline, visible gold focus ring |
| Camp buff | Illustrated SVG icon, name, level, and one short effect; keep these grouped closely |
| Buff illustrations | One consistent hand-drawn set: books, hammer, sprout, and lookout tower |
| Hero stats | Four separate pale color blocks with a clear value and short label |
| Talent | Give the talent icon, title, and explanation enough horizontal room to read |
| Hero picker | One-row roster on desktop, paper cards, distinct rarity edge, clear selected state |
| Error | Plainly explain what happened and what to try next |

Do not use platform emoji as final building artwork when a consistent illustrated icon is available.

---

## 7. Motion

- Let the campfire flicker gently and allow small ambient fireflies in the clearing.
- Keep hero animation calm and readable.
- Use short lift and press feedback for controls.
- Save large celebrations for genuine rewards and milestones.
- Respect reduced-motion preferences; stop ambient loops when reduced motion is requested.

---

## 8. Teacher experience

Teacher and admin pages keep their ordinary, visible navigation and task-focused layouts. They may use the same type family, ink, and restrained paper details, but should stay calm and efficient. Avoid full-screen game immersion, ambient animation, reward effects, and decorative forest art in data-heavy work.

---

## 9. Accessibility and tone

- Keep contrast strong on all paper and colored stat surfaces.
- Provide visible keyboard focus and keyboard access to every control.
- Give icons accessible names when they convey information; hide purely decorative icons from assistive technology.
- Keep buttons comfortably sized and explain disabled actions when practical.
- Honor reduced motion.
- Use short, active language: “Choose an adventurer,” “Host lobby,” and “Keep the campfire burning.”
- Never use guilt, fake urgency, or pressure to spend or continue playing.

---

## 10. Asset and implementation guidance

- Preserve the established hero sprite art and its proportions.
- Draw UI icons as a coherent SVG family with shared outline weight, palette, and scale.
- Keep the forest background and storybook-paper texture as lightweight local assets.
- Reuse the current campfire illustration and forest scene where possible; align characters and ground shadows to a shared visual floor.
- Update this book when the student World screen or shared visual tokens change. Apply the student experience to other student pages deliberately, while keeping teacher workflows calm and conventional.

---

## 11. UI lessons learned (28 Oct 2026)

- **Treat a palette as a page system.** Recolor the page background, navigation, cards, headings, controls, answer states, overlays, and disabled states together. Inspect every state for stale colors before calling a theme change complete.
- **Keep the palette rooted in the brand.** Green belongs to forest settings and forest-green page chrome; parchment, ink, and campfire gold carry reading and setup content. Avoid unrelated color experiments that make one page feel detached from the rest of QuizQuest.
- **Protect contrast in nested content.** Check headings, repeated question text, helper copy, badges, focus rings, and selected/correct/incorrect answers on their actual surface colors. Dark ink belongs on paper; pale text belongs on dark forest surfaces.
- **Use the established illustration assets.** Prefer the local `forest-clearing.svg` for forest scenes over abstract gradient bands or repeated vertical stripes. Layer lighting over the illustration without obscuring characters or making text hard to read.
- **Match the reference hierarchy and proportions.** Preserve the intended placement and relative size of the hero, controls, details, and selectors. Let the hero or scene own the space the reference gives it; remove or condense secondary copy when it causes crowding.
- **Make motion communicate the action.** In a battle, animate the acting character toward the other character, show impact and damage, and keep the feedback visible at desktop and mobile sizes. Reduced-motion settings may shorten active feedback but must not silently remove an essential action cue.
- **Check the whole view after edits.** Review the page at its intended viewport and at a narrow viewport, including loading, selected, correct, incorrect, disabled, and dialog states where relevant. Avoid piling late overrides on top of earlier palette experiments; keep scoped page styles understandable and remove stale rules when practical.
- **Keep controls purposeful.** Size buttons to their labels, align action groups, give inputs the available width, and use icons only when they are legible and meaningfully distinguish the control or content.
