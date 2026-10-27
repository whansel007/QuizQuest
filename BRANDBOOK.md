# QuizQuest Brand Book (v0.1, draft)

**One line:** a bright, chunky, cartoon "digital fantasy" world. Learning feels like a game. Everything looks like it was drawn with a thick marker and lit by candy-colored magic.

This book covers every screen: the student World/kingdom pages, the game HUD, login, and the teacher/admin side. It is written to be handed to a developer or an AI agent. Where a value matters, it is given as a token.

---

## 1. Personality

| We are | We are not |
|---|---|
| Playful, bright, encouraging | Childish, babyish, noisy |
| Chunky and readable | Thin, minimal, corporate |
| Fantasy-meets-digital (runes, crystals, glowing circuits) | Dark, grim, edgy |
| Rewarding | Pressuring (no fake timers, streak guilt, scarcity) |

**Pixel direction:** "pixel-flavored," NOT pixel art. The cat characters are smooth vector with thick outlines, so the UI keeps that smoothness and borrows pixel flavor from: pixel headline font, hard (unblurred) shadows, segmented progress bars, checker/dither background patterns, and tiny pixel sparkles. Do not pixelate images or use a pixel font for body text.

---

## 2. The characters set the style

Reference art: the cat-ball heroes (Sheriff, Guardian, Pilot, Pilot Mech). Everything in the UI should feel like it belongs next to them.

- **Thick black outline** (about 6 px at 1600 px art). The UI copies this: every button, card and badge has a near-black outline.
- **Pale body ring, dark face disc, glowing line face.** The face lines use the hero's own color.
- **Accessories carry the identity** (hat, helmet, badge). They are pre-colored.
- **Faces carry emotion.** Neutral (round eyes), happy/squint (`> <`), cheeky (fang). Reuse them in the UI: squint on button press or success toasts, cheeky on boss or ultimate moments, neutral for idle.
- **Hero color families (from the art):** Sheriff = butter yellow, Guardian = sky blue, Pilot = warm grey with red cap. Remaining heroes (suggested, change freely): Bombardier = charcoal with orange glow, Bubbles = pink and aqua, Electromancer = electric cyan.
- Suggestion: derive the game's `HERO_FX_COLORS` from these so UI, sprite and bullets match. Pilot's grey is dull for projectiles, so use its red as the FX accent.

---

## 3. Color

### Foundation (the "night kingdom")
Dark indigo backgrounds make bright colors pop.

| Token | Hex | Use |
|---|---|---|
| `--bg-night` | `#14123A` | Page background |
| `--bg-panel` | `#1E1B4B` | Cards, panels |
| `--bg-raised` | `#2B2766` | Raised or hovered surfaces, inputs |
| `--ink` | `#101018` | Outlines and shadows, text on bright fills |
| `--cream` | `#FFF8E7` | Main text on dark |
| `--muted` | `#B9B5E8` | Secondary text |

### Brights (candy fantasy)
| Token | Hex | Use |
|---|---|---|
| `--sun` | `#FFD93D` | Primary action (the "press me" color) |
| `--sky` | `#3FA9F5` | Secondary action, physical type |
| `--grape` | `#8B5CF6` | Magic type, special |
| `--mint` | `#3DDC97` | Success, healing |
| `--coral` | `#FF6B6B` | Danger, destructive |
| `--orange` | `#FF9F1C` | Warnings, fire, highlight |
| `--pink` | `#FF7EB6` | Fun accents, Bubbles |

### Game-meaning colors (must stay consistent with the HUD)
| Meaning | Color |
|---|---|
| Physical type (buttons) | Blue family: `#2F96D4` / `#1E78C8` / `#2F3AB8` (light to dark) |
| Magic type (buttons) | Purple family: `#9B7BE8` / `#7B4FD8` / `#4B2AA8` |
| Highlight / key mechanic | Amber: `#D99A00` / `#C48400` / `#A86E00` |
| Heal ring | Stroke `#B8FFE0`, fill `#3CFF8A` |
| Player area effects | `#FFC93C` |
| Enemy danger zones | `#FF3B3B` |
| Rarity | 3★ white, 4★ `#4DA3FF`, 5★ `#FFC93C` |

### Text-on-color rule
- **Bright fill (sun, sky, mint, orange, pink): use `--ink` text.**
- **Deep fill (grape, dark blue, panels): use `--cream` text.**
- Minimum contrast: 4.5:1 for body text, 3:1 for large text and icons. White ability icons on the HUD buttons use the 3:1 rule.
- Never put cream text on `--sun` or on light blue. It fails contrast.

---

## 4. Typography

| Role | Font (Google Fonts, free) | Notes |
|---|---|---|
| Display / headings | **Pixelify Sans** (fallback: Silkscreen) | Titles, buttons, big numbers, banners only |
| Body / UI text | **Nunito** (700 for emphasis) | Rounded and friendly, readable at small sizes |
| Numbers in HUD | Pixelify Sans | Keeps game numbers on-brand |

Sizes (px): 12 caption, 14 small, 16 body, 20 subhead, 28 H2, 40 H1, 64 hero banner.
Rules: headings are Title Case. Never set body paragraphs in the pixel font. Always include real fallback stacks (`system-ui, sans-serif`).

---

## 5. Shape, outline, shadow, space

- **Outline:** 4 px `--ink` on buttons, cards, tiles and badges (3 px on small chips).
- **Radius:** 12 px cards and buttons, 999 px pills and round buttons. Optional "notched pixel corner" panels for banners only (clip-path with 2-step corners).
- **Hard shadow, no blur:** `0 4px 0 <darker shade of the fill>`. Large cards use `0 6px 0 var(--ink)`.
- **Press state:** the element moves down 3 px and the shadow shrinks to 1 px (80 ms).
- **Spacing scale (8 px grid):** 4, 8, 12, 16, 24, 32, 48.
- **Pixel flavor details:** segmented progress bars (blocks, not smooth fills), a 2 px checker dither on large dark panels at 4% opacity, pixel star sparkles (3 to 5 px) on rewards only.
- **No glow via `box-shadow` blur or `filter` on frequently animated things** (performance). Use hard offsets and flat shapes.

---

## 6. Design tokens (copy into `tokens.css`)

```css
:root {
  /* foundation */
  --bg-night: #14123A; --bg-panel: #1E1B4B; --bg-raised: #2B2766;
  --ink: #101018; --cream: #FFF8E7; --muted: #B9B5E8;
  /* brights */
  --sun: #FFD93D; --sky: #3FA9F5; --grape: #8B5CF6; --mint: #3DDC97;
  --coral: #FF6B6B; --orange: #FF9F1C; --pink: #FF7EB6;
  /* shadows (darker shade of each fill) */
  --sun-shade: #C98F00; --sky-shade: #1E78C8; --grape-shade: #5B35B8;
  --mint-shade: #1E9A66; --coral-shade: #C23A3A;
  /* shape */
  --outline: 4px solid var(--ink); --radius: 12px; --radius-pill: 999px;
  --shadow-btn: 0 4px 0; --press-shift: 3px;
  /* type */
  --font-display: "Pixelify Sans", "Silkscreen", system-ui, sans-serif;
  --font-body: "Nunito", system-ui, sans-serif;
  /* space */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px; --s7: 48px;
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

---

## 7. Components

| Component | Spec |
|---|---|
| **Primary button** | `--sun` fill, `--ink` text (Pixelify Sans), 4 px ink outline, `0 4px 0 var(--sun-shade)`, min height 44 px, press sinks 3 px. One per screen area. |
| **Secondary button** | `--sky` fill, ink text, same shape. |
| **Magic / special button** | `--grape` fill, cream text. |
| **Danger button** | `--coral` fill, ink text. Used for leave, delete, reset. Never the primary color. |
| **Ghost button** | Transparent, cream text, 3 px cream outline. Hover fills `--bg-raised`. |
| **Disabled** | 50% opacity, no shadow, no press. Never hide the reason (tooltip). |
| **Card / panel** | `--bg-panel`, 4 px ink outline, 12 px radius, `0 6px 0 var(--ink)`. Title in Pixelify Sans. |
| **Kingdom tile** | Card with big emoji (later art), name, "Lv 2/3", one short effect line. Highlighted state = amber border plus small bounce. |
| **Hero card (selector)** | Small card with hero art, name, type icon (✦ physical, 🌀 magic), "Owned" or lock. Selected = sun outline. |
| **Tabs** | Pill row. Selected = sun fill with ink text. Others = `--bg-raised`. |
| **Progress bar** | Segmented blocks (10 to 20), ink outline, filled blocks use the meaning color. |
| **Badge / chip** | Pill, 3 px outline, 12 px text. Rarity chips use the rarity colors. |
| **Input** | `--bg-raised` fill, 3 px ink outline, cream text, sun outline on focus. Error = coral outline plus message below. |
| **Modal** | Centered card on a 60% ink scrim. Title, one primary and at most one secondary action. Esc closes. |
| **Toast** | Small card top center, 3 s, squint-face icon for success. Never stack more than 2. |
| **Tooltip** | `--ink` fill, cream text, 3 px cream outline, 8 px radius. |
| **Table (teacher)** | See Calm mode below. |
| **Ability buttons (HUD)** | Defined in the HUD spec: sizes 56/70/88, physical blue, magic purple, highlight amber, white icons, key label under each. Do not restyle them here. |

---

## 8. Motion and sound

- **Press:** 80 ms sink. **Hover:** 2 px lift, 100 ms. **Panel appear:** 150 ms fade plus 8 px rise.
- **Reward moments only** get sparkles, confetti and bounces (pull reveal, boss defeat, level up). Never on ordinary navigation.
- **Mascot idle:** the cat blinks every 2 to 5 s (random offset per cat) on the login and hero screens.
- **Reduced motion:** respect `prefers-reduced-motion`, and keep the in-app effects toggles.
- **UI sounds:** one soft click, one confirm "ding," one back. Reuse the game's audio system and its master volume.

---

## 9. Page guidance

### Student side (playful mode: full brand)
- **World page:** two-column layout from the existing spec: lobby and kingdom tiles on the left, hero preview and two-row selector on the right. Big hero art, bright tiles.
- **Kingdom:** tiles are the stars. Show level-up with a small sparkle.
- **Summon (gacha) screen:** the most celebratory screen. Rarity colors, reveal juice, skippable. Keep odds and pity info visible and calm.
- **Rewards / end of run:** clear numbers, the "Your upgrades dealt X extra damage" line, big RUN AGAIN button.

### Login (a welcome moment)
Night background with a large blinking Sheriff or random hero cat, the game logo in Pixelify Sans, one primary "Play" button, small ghost "Teacher login." No clutter, no animation beyond the blink.

### Teacher / admin side (calm mode: same tokens, less noise)
Teachers need clarity, not sparkle.
- Same colors, fonts, outlines and buttons, but: **no sparkles, no bouncing, no confetti.**
- Bright colors only for status (mint = done, coral = needs attention, sun = primary action).
- Denser layouts allowed: 14 px body text, tables with cream text on `--bg-panel`, zebra rows `--bg-raised`, 3 px outlines instead of 4 px.
- Cat characters appear only in empty states and the header logo.
- Charts use the brand brights with labels, never color alone.

---

## 10. Voice and tone

- Friendly, short, active. "Pick your hero," not "Please select a character."
- Celebrate effort, not just wins. "Nice run! You reached wave 8."
- Errors say what happened and what to do. "Room not found. Check the code and try again."
- Never guilt or pressure: no "you'll lose your streak," no fake countdowns, no "only 2 left."
- Teacher side: plain and professional, with a light touch of the brand voice only in empty states.

---

## 11. Accessibility and safety

- Contrast rules in section 3. Test brights with ink text, not cream.
- Never use color alone to carry meaning: pair it with an icon, label or shape.
- All interactive elements are at least 44 px tall, with a visible focus outline (sun, 3 px).
- Keyboard: everything reachable by Tab, modals closable with Esc.
- Honor `prefers-reduced-motion`. Provide the effects toggles that already exist in Settings.
- Student-facing screens must stay free of dark patterns: no loss-framing, no urgency timers, no pressure to spend or keep playing.

---

## 12. Do and don't

| Do | Don't |
|---|---|
| Thick ink outlines on every surface | Thin 1 px borders or soft shadows |
| Pixel font for headings only | Pixel font for paragraphs |
| Ink text on bright fills | Cream or white text on yellow or light blue |
| One primary button per area | Several yellow buttons competing |
| Hard offset shadows | Blur glows on everything |
| Keep rewards special | Sparkle on every click |
| Smooth cat art | Pixelating the characters |

---

## 13. Asset list

- Cat sprites per hero: neutral, happy (squint), cheeky, hit, downed. Pre-colored accessories. The base cat is shared.
- Logo: "QuizQuest" in Pixelify Sans with a cat ear silhouette, plus a one-color version.
- Icons: game-icons.net (CC BY 3.0, credit authors in Settings), drawn white on button fills.
- Background patterns: dithered checker tile, star-field tile, both seamless and under 20 KB.
- Emoji stay as placeholders only. Route all of them through the shared icon helper so art swaps in later.

---

## 14. Handoff and rollout plan

1. Add `tokens.css` and load the two fonts once, app-wide.
2. Build the shared components (button, card, tile, tabs, input, modal, toast, progress bar, badge) in one library folder.
3. **Pilot:** re-skin the student World page. Review it against this book, then update the book.
4. Re-skin remaining student pages (kingdom, summon, results).
5. **Second developer:** login, teacher and admin pages using the same tokens and components, in calm mode.
6. Final pass: contrast check, keyboard check, 1280x720 and 900 px layouts, performance check (no blur filters).

**Ownership rule:** one person per file or page. Shared changes (tokens, components) go through one owner so they never diverge.

**Review checklist for any new screen:** outline on every surface? one primary button? ink text on bright fills? heading font only on headings? no blur shadows? focus outlines visible? reduced-motion safe? No pressure language?

---

## 15. Open questions for the team

1. Are the logo name and mascot final? Which cat is the face of the brand: Sheriff, or a rotating hero?
2. Final names for rarities (the UI shows "rare" and "epic" while design talks 4★ and 5★)?
3. Does the teacher side need a light theme for classroom projectors?
4. Are the three remaining hero cats (Bombardier, Bubbles, Electromancer) drawn yet? Their color families above are suggestions only.