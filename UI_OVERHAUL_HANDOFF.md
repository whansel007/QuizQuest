# QuizQuest Student, Teacher, and Login UI Overhaul Handoff

Handoff brief for the next designer/AI agent. Treat [BRANDBOOK.md](BRANDBOOK.md) as the visual source of truth.

## Goal

Rework the student experience so its Kingdom, My Progress, Practice, login, Summon, and in-run World screens feel deliberately designed and belong to QuizQuest’s cartoon storybook world. Also give the teacher experience a distinct, data-focused layout and navigation system. Fix the Kingdom map and replace its rough, randomly placed shapes with recognizable buildings. Give data-heavy and action-heavy screens stronger hierarchy and more visual interest without losing clarity. Keep existing workflows and data intact; distinguish requested interaction work from future systems that only need a visual placeholder in this phase.

## Execution contract for the implementing agent

1. Read [BRANDBOOK.md](BRANDBOOK.md) and this handoff before editing. If a local instruction conflicts with this handoff, follow the more specific screen requirement here and preserve the rest of the Brandbook.
2. Inspect the current components, game state, assets, and running UI before changing a screen. Reuse working mechanics and existing hero/forest assets where possible; do not replace features with static mockups.
3. Implement every requested screen in this handoff. Do not stop after the Kingdom screen or return only a plan. For the teacher side, implement the layout and optional review-mode entry while preserving the current workflows. Keep future systems explicitly out of scope unless separately requested.
4. Preserve existing data, economy, rewards, summon odds/pity/refunds, movement, combat rules, multiplayer/network behavior, and working controls. Only change game logic where the handoff explicitly asks, such as moving the respawn point away from the campfire or adding the specified screen transition.
5. Keep visual changes cohesive across each whole screen, including page background, navigation, cards, controls, selected/disabled/error/success states, overlays, and mobile layout. Never recolor just one panel and leave neighboring UI on the old palette.
6. Do not invent missing data. A stat, achievement star, reward, or party member must come from existing game state. If a requested visual depends on unavailable data, preserve the layout and show a clear neutral state rather than fabricated values.
7. Verify each screen in the running app at a wide desktop size and a narrow mobile size. Check the relevant states listed below, not only the initial view. Fix clipping, overlap, unreadable contrast, broken paths, misplaced sprites, and stale colors before handing it back.
8. Finish with a concise report of screens changed, mechanics deliberately preserved, and any item blocked by unavailable assets or data.

### Priority order

1. Fix broken Kingdom scene geometry, building identity, cardinal placement, and connected roads; add the first-entry Kingdom introduction and make the hub feel alive.
2. Redesign the in-run World battlefield and HUD so gameplay stays readable and respawns do not cover the campfire.
3. Redesign the teacher shell and data-heavy screens, including an optional question-vetting card mode.
4. Redesign the run completion/defeat cards and the Practice-to-battle entrance transition.
5. Redesign the first-entry login page and the My Progress dashboard.
6. Replace the egg/crank Summon presentation with the specified starfall/card reveal while preserving summon mechanics.

Work through the complete list; the priority order is for implementation sequencing, not permission to omit lower items.

### Scope boundary

- The visual overhaul includes working navigation and interaction for the controls explicitly requested here: opening the Buildings panel, entering the existing Summon/quiz/run flows, first-visit onboarding, E-to-greet, the Z emote wheel, and the optional question-vetting card mode.
- Reuse existing persistence, game state, APIs, permissions, and multiplayer events for those interactions. Small integration work needed to connect the new UI to existing flows is in scope; changing the actual rules or creating a parallel system is not.
- For future systems such as class barter, a castle clothing shop, hero trials, or a full lore gallery, build a clearly labeled visual preview only. Do not invent transaction logic, prices, inventory, content, or unsupported actions. Keep such areas visually ready for later work and list remaining dependencies in the completion report.
- If an explicitly requested interaction cannot be implemented with current architecture, make the rest of the UI complete, preserve a truthful nonfunctional/disabled state, and report the exact blocker. Do not silently omit it or present it as working.

## Kingdom map layout

Use the central castle as the hub and place one distinct building at each cardinal point:

| Position | Building | Identity |
|---|---|---|
| North | Garden | Celestial garden, fountain, and telescope |
| South | Tower | Broadcast/communication tower and class request board |
| West | Library | Magical library |
| East | Workshop | Physical-hero training gym/workshop |
| Center | Castle | Player’s kingdom and future avatar-customization hub |

These are the final positions. Earlier in the discussion, Library and Tower were described at different sides; use the table above.

### Map and composition requirements

- Make the castle the clear center of the walkable hub.
- Connect every building entrance to the castle with roads that meet cleanly. Roads must not stop short, overlap buildings, or leave confusing gaps.
- Arrange houses and other town details in intentional groups with consistent scale, orientation, and spacing. Avoid scattered placeholder shapes.
- Give every building a complete architectural read: clear footprint, walls, roof, entrance, and a small number of role-specific details. Do not use loose collections of unrelated polygons as a substitute for buildings.
- Keep the town legible at normal play zoom. Use silhouette, roof, material, and a small number of details to identify each building before the player reads its label.
- Leave clear walking space between paths, houses, buildings, and props. Preserve the established movement and collision behavior while revising the scene.
- Keep the complete home Kingdom visible within one game screen at the normal play scale. A separate northern route may pan into a new area, but the town itself should remain a readable, compact hub rather than forcing routine navigation through a large empty map.
- Frame the town with a believable forest edge. Leave a clear central opening at the north edge for the route to the battle area; keep rocks and other blocking props toward the far corners rather than scattering them through the main walking lanes.
- Make the northbound route legible as an exit/continuation of the world. A sign, trail marker, or environmental cue may indicate that battles lie north, but do not cover the town or make the route look like another building.

### First-visit Kingdom introduction

- After a student's first successful login, make the Kingdom the first landing destination when the current role/navigation flow allows it. Do not route teachers to the student Kingdom.
- On a student's first-ever entry, introduce the Kingdom as their home hub with a short, skippable orientation overlay. Explain the castle/home, the four buildings, and the northern battle route in plain language tied to the visible scene.
- Provide a clear **Skip** action and a clear continue/next action. Do not trap the player in the tutorial or replay it on every visit; use the existing first-visit/session state if available. If persistence is unavailable, make that limitation explicit rather than silently showing it every time.
- Keep the introduction anchored to the real map and controls. It must not obscure the entire town at once, conflict with the building panels, or prevent keyboard/controller access to Skip.

### Northbound battle area and mode choice

- When the hero walks north through the town opening, transition the camera smoothly beyond the town into a distinct forest clearing/approach. The Kingdom should remain behind the player; do not teleport with a blank-screen flash.
- Present two clearly distinct destinations in the northern area: **Duel** (the individual quiz battle) and **Campfire Run** (the wave-based team defense). Use the backpack/travel-pack motif for Duel and a lit campfire motif for Campfire Run, or equally clear storybook visuals.
- Explain the modes briefly in-world: Duel is a quiz battle against an opponent; Campfire Run is defending a campfire from waves of monsters. Keep the choice understandable before the player enters either mode.
- This route is a world/navigation affordance. Reuse the existing quiz and run flows, rules, matchmaking, and lobby state. Do not create a parallel battle system or change what the modes do.
- If a moving camera or destination trigger is not supported by the current Kingdom implementation, inspect the movement/scene architecture first and implement the closest continuous transition possible; report any hard limitation rather than replacing it with a static mockup without explanation.

### Kingdom header and building shortcut

- Keep the existing top-left Kingdom identity/header and rename its main label to **Your Kingdom · Storybook Town** (wording may be compacted responsively while retaining both ideas).
- The visible **Buildings** shortcut should open the building information/upgrade interface without requiring the player to walk to each structure. Do not add an unrelated second menu button; the user clarified that a separate extra menu button is not needed.
- The building guide must be actionable as an information panel, not only a glossary. Selecting a building opens a panel with its name, current level, existing purpose/effect, and a building-specific content area. Put the building title on one side of the panel header and its existing **Upgrade** action on the opposite side where space permits.
- Theme each panel’s content area to its building's role (celestial garden, broadcast/request tower, magical library, physical training workshop, castle). For this UI phase, show a designed preview of the intended function; do not fabricate inventory, requests, hero lore, customization choices, or functionality that the app does not already support.
- The existing upgrade button/action remains the real upgrade action. Preserve its cost, eligibility, level progression, and feedback. If the panel is preview-only for a future role, label it as such and keep nonfunctional controls disabled or explanatory rather than pretending they work.
- Keep the panel dismissible, keyboard accessible, and usable at mobile widths. It must not hide the selected building's current level/effect or leave the player unable to return to the map.

### Shared three-stage progression language

Use this as the baseline for every building, then adapt the details to its role:

| Stage | Visual read |
|---|---|
| 1 | A complete, recognizable small building with its signature feature already present |
| 2 | A visibly expanded structure with a changed silhouette and one clear added feature |
| 3 | A more substantial landmark version with a further changed silhouette and richer role-specific detail |

At each level, preserve the building’s recognizable identity. Do not make progression depend only on a badge, level number, tint, or particle effect. Keep the three art states aligned to the actual building level and do not change the existing level/effect rules.

## Building art and upgrade stages

Each of the four cardinal buildings needs three visibly different stages. An upgrade should change the building’s silhouette and structural details, not only its color or size. Keep stage changes consistent with the building’s role and make the order of progression obvious.

### North — Celestial Garden

- Make it feel like a garden or small observatory park, with planted areas, a central fountain, and a telescope aimed at the sky.
- This is the place players visit to summon heroes from the stars.
- Make room for an upgrade action and a summon action.
- Keep any currently implemented Garden upgrade effect intact. The telescope should provide a thematic entry to the existing summon flow; no additional Garden gameplay system is requested in this phase.
- Across three stages, grow the garden’s planted areas and celestial/observatory details while retaining the fountain and telescope as anchors.

### South — Broadcast Tower

- Make it read as a real communications tower: a tall, recognizable silhouette with antennae or dishes. Each of the three stages should make it taller and add clear broadcast equipment.
- Its current game effect is to strengthen the buffs offered during a run. Preserve that behavior and communicate the buff increase in the building UI.
- The future class barter feature should be represented by a notice/request board beside a vintage radio. The board is where class members will browse requests or post what they offer and want in return; the radio is the in-world explanation for broadcasting requests.
- Barter mechanics are future work unless separately requested. Do not let mock UI imply a completed exchange feature.

### West — Magical Library

- Replace the current rough shape with an inviting, magical library: recognizable shelves, books, scrolls, and restrained magical light or glyph details.
- Its current game effect is to increase magical-hero attack. Keep that effect visible and consistent with the existing game values.
- The future library can hold hero biographies, character lore, and world-building. For now, signal the gallery/archive role visually without inventing large amounts of new content.
- Each of the three stages should visibly expand the library’s structure and magical collection.

### East — Physical-Hero Training Workshop

- Lean toward a training gym for physical heroes, with a workshop edge for the mech pilot: training space, punching bag or target, shield/weapon practice, and a few clear metal or gear details.
- It serves Guardian, Sheriff, Pilot, and other physical heroes. Avoid making it look like a generic house or a conventional factory.
- Its current game effect is to increase physical-hero attack. Preserve that effect and show the current level and benefit.
- The future workshop may let players preview or try heroes and their skills. This training flow is not required for the UI phase.
- Each of the three stages should add useful training equipment and structural detail, not visual clutter.

### Center — Castle

- Keep the castle as the visual anchor of the town and make its scale and detailing reflect kingdom progression.
- The future castle interaction is avatar customization: hats, accessories, and color choices. For now, leave room for that affordance without inventing an unfinished customization flow.

## Kingdom character life and interaction

The home hub should feel inhabited. Use the existing hero art and animation systems; do not replace the sprites with emoji or unrelated characters.

- Populate the Kingdom with the owned/available hero characters supported by current game data. Give them simple idle and wandering behavior that does not block roads, building entrances, or the player.
- When a hero wanders, occasionally show a short in-character speech bubble. Keep frequency low, lines brief, and bubble placement readable; avoid simultaneous bubbles covering the HUD or other characters.
- When the player approaches a character, show an **E · Greet** prompt. Pressing E opens a short greeting/character line, then returns control to movement. Keep the prompt tied to proximity and avoid opening dialogue just by passing far away.
- Give each hero a small, coherent voice based on its established identity: Guardian is a shield-bearing knight; Sheriff is a sheriff; Pilot is a mech pilot who can transform into a robot; Bombardier is a pirate; Bubbles is a playful childlike character; Electromancer is a purple electric mage. Treat all heroes as gender-neutral anthropomorphic cat-ball creatures; do not assign gendered pronouns. Keep dialogue family-friendly and brief.
- Use lines in this spirit: Guardian offers to keep watch; Sheriff says the trail is safe; Pilot mentions a robot check or flight test; Bombardier talks like a friendly pirate about treasure; Bubbles invites someone to play; Electromancer comments on a tiny spark or storm. These are tone examples, not required literal copy. Avoid repeating the same generic greeting for every hero.
- Add a lightweight emote wheel opened by **Z**. It should appear around/near the player's hero, offer a small set of clear emotes (at minimum thumbs-up and thumbs-down), and close after selection or cancel. Also provide a visible control hint so the shortcut is discoverable.
- On selection, display the chosen emote as a short-lived speech/emote bubble above the player's hero. In multiplayer, broadcast the emote through the existing room/network event path so other players see it. Do not invent a new networking stack. If synchronization cannot be supported by current architecture, keep the local interaction working and report the exact multiplayer limitation.
- Add soft, playful movement/interaction sounds where the app has an audio system: a quiet bounce/boing for the local hero's movement and restrained UI/interaction cues. Keep volume low, avoid continuous rapid sounds on every animation frame, respect mute settings, and do not autoplay disruptive music. If there is no audio system or licensed assets, do not add external audio dependencies; use a clearly documented asset/task follow-up instead.
- Fix character collision so heroes do not perpetually shove or trap one another. Keep collisions/hitboxes close to the visible sprite's ground footprint, allow them to pass or gently separate when crowded, and keep decorative flowers hitboxless. Put blocking rocks/props in far corners, not in central paths or common spawn/wander routes.

## Summon experience redesign

Replace the egg and hand-cranked gacha machine with a starfall summon that fits the storybook/celestial Garden. Keep the exciting individual result reveal and collectible-card presentation.

- The Garden telescope should navigate into the existing Summon page in this UI phase. Use a telescope-style zoom or lens frame as the transition; this changes presentation, not summon rules or rewards.
- Remove the egg as the summon object and remove the crank machine animation.
- For one pull, show one shooting star falling from the sky and transforming into the hero/resource reveal card.
- For ten pulls, show ten shooting stars, revealing results one at a time. Keep the same starry scene between reveals; show the complete revealed-results summary only after the last result.
- Keep the dimensional/card reveal treatment that the user liked, but give the cards storybook/constellation detailing so they belong to this world.
- Use rarity to change the starfall: an especially prominent purple star for a four-star result and a prominent gold star for a five-star result. Common results should remain visually distinct without competing with rare reveals.
- Preserve current pull costs, pity, duplicate refunds, inventory updates, history, and result data. This phase changes presentation, not summon odds or rewards.

## My Progress page redesign

Rebuild My Progress as a focused learning dashboard. It is a data-heavy page, so clarity and scanning matter, but it should not be a wall of identical beige cards.

- Keep the storybook material and typography from the Brandbook, but use forest-green structure and restrained nature accents to break up parchment surfaces.
- Create a clear hierarchy: overall progress first, topic-level strengths and next steps next, then recent sessions and question reports.
- Use varied but cohesive presentation for important metrics: a prominent overall score, clear topic cards, readable progress meters, and well-spaced session/report tables. Avoid turning every number into a large decorative element.
- Use a limited set of purposeful colors for metric and status differences; keep text contrast strong and use labels/icons as well as color.
- Make the Cyber hygiene and other topic cards easy to compare at a glance and use the available page width sensibly. Avoid leaving the topic cards crowded in one corner with a large unused expanse beside them.
- Keep the key content visible in a predictable reading order: overall counted score and accuracy; recommended topics; topic cards with status, accuracy, sample count, meter, and available-question count; recent sessions; then report status and report details.
- Create visual grouping with forest-green headings/summary accents, leaf-tinted data surfaces, parchment cards, and campfire-gold emphasis for the most important metric or action. Beige may remain the paper material, but it must not be the only visual treatment across the whole page.
- Keep tables compact and scannable with clear column labels and row separation. Do not replace real progress data with decorative charts or add graphs that the current data cannot support.
- Keep the visible student navigation behavior used by Practice and My Progress. Do not apply the hidden navigation behavior used by immersive game tabs to these reading views.

## Practice-to-battle encounter transition

Starting or resuming Practice should feel like entering a battle, not like the setup page disappears and another page abruptly pops in.

- Keep the current Practice view present until an encounter transition covers it. Use a Pokémon-style screen wipe across the window to reveal the battle view beneath it.
- Sequence the transition as: player activates Start/Resume; an encounter emblem or wipe sweeps across and fully covers the Practice view; the battle view is mounted/revealed underneath; the wipe clears to the battle. The player must never see an empty frame between these views.
- A simple emblem, icon, or temporary emoji can lead the wipe in the first version. The wipe should read as an intentional encounter transition, not a generic fade or a loading spinner.
- Maintain visual continuity between setup and battle. Do not briefly show an empty page, flash to a blank background, or unmount the setup before the wipe has covered the screen.
- After the wipe, show the battle UI and preserve the existing answer, attack, and result behavior.
- Respect reduced-motion settings with a shorter, simpler wipe while retaining a clear transition cue.

## Full-screen login page

Replace the centered login box and surrounding backdrop with a full-page composition. This is the first experience for all users; use the illustrated preview to introduce the student game world immediately.

- Use a roughly 75/25 split, allowing the illustrated side to grow if the layout needs it. Keep the login form, QuizQuest title, supporting text, and wrench/debug information control on the larger left side.
- Keep the left side as the working sign-in area: title/brand, account or user choice, sign-in fields, primary action, status/error text, and the existing wrench/debug control with its information card. Do not hide essential controls in the illustration or remove the debug affordance.
- Use the right side as a living preview of the forest/kingdom. Show several existing heroes wandering through it with calm idle/walk movement so students can see what the game feels like before signing in.
- Shape the boundary between the two sides as a broad inward semicircle or soft curved cut into the left panel. Feather the edge lightly; avoid a hard rectangular split or a centered floating card.
- Fill the viewport edge-to-edge; do not retain a centered login box, framed inset panel, or blank page margin. Keep the curved division behind the content, not across the text or inputs.
- Keep all sign-in fields, account controls, errors, and debug information within the left area and readable at common screen sizes. Keep the moving scene decorative and do not let it block login interactions.
- On narrow screens, stack or simplify the preview intentionally so the login form remains the priority and no content overlaps.

## In-run World game redesign

The current game arena uses a checkerboard floor, a central circle, and emoji-like props. Redesign the battlefield as a clear forest-side clearing while keeping gameplay readable when many enemies are active.

- Replace the checkerboard with a neutral grassy/woodland floor treatment. Use light texture, grass variation, and restrained scene details; avoid dense scenery or high-contrast patterns that hide enemies, projectiles, hit areas, or the campfire.
- Rework the campfire zone, paths, targets/props, and arena backdrop so the scene reads as a place in the woods rather than a blank board with a ring.
- Design the in-run HUD with this hierarchy: player list at upper left; room code at upper right; one combined objective panel with enemy count in a compact left segment (about 25%) and wave number below it, plus campfire health in the remaining right segment; abilities at lower right; information/help control at lower left. In the lobby phase, use the same panel for the lobby/start state and campfire health rather than scattering separate status boxes.
- Show each player’s display/user name as the primary label and their selected hero as a secondary icon/label. Do not use the hero name as a substitute for the player’s name.
- If team-buff choices/cards appear, give each its own side-by-side card with its icon first, followed by name and short effect. Use the darker forest-green card treatment with readable light text. Keep player ability controls visually distinct; do not force the buff-card palette onto ability buttons.
- Redesign the HUD using the Brandbook’s storybook framing and legible forest colors. Keep the enemy count, wave number, campfire safety/health, room code, player list, resources, and abilities easy to distinguish.
- Fix low-contrast labels, button/icon combinations, and any icons that do not render or do not communicate their action. Preserve keyboard labels and gameplay affordances.
- Keep the enemy count stable when the underlying enemy state has not changed; it must not flicker between nearby values.
- Remove misplaced or duplicate HP numbers below the player list. Player health belongs with the corresponding player entry, not as a stray second readout.
- When a hero respawns, place the respawn point away from the campfire so the faint revival sprite does not overlap the fire or obscure the protected objective.
- Keep collision and aiming areas readable against the new ground. Do not let decorative grass or scenery create ambiguous hitboxes.

## Run end cards

Redesign both campfire-extinguished and wave/run-complete screens as intentional illustrated summaries.

- Give the result screen a strong left/right composition: a large summary card or panel on the left, with the selected hero and party display on the right. Use the available screen area rather than a small centered box.
- Show the hero used for the run and the heroes used by friends in multiplayer. Highlight the whole party appropriately, not only the local player. Existing idle/smiling animations are acceptable until additional expressions exist.
- Use a large left-side results surface that owns most of the information area and a clear right-side party area for the player plus friends. Do not shrink the result into a small centered dialog with the background doing most of the work.
- Present wave reached, kills, damage, rewards, personal best, and relevant building/run bonuses in clear, distinct stat blocks. Use color purposefully and retain labels so the meaning is not color-only. Show earned stars or achievement marks only when backed by actual run data; do not invent a score.
- Distinguish victory/completion from campfire defeat through heading, emblem, and accent treatment while keeping both in the same visual family.
- Keep next actions easy to find and ensure buttons are centered within their own controls, not stretched across unnecessary space.
- At narrow sizes, stack the summary and party sections without clipping the statistics or actions.

## Teacher experience redesign

Treat this as a distinct teacher-side workstream. Student screens should keep their immersive forest/storybook feel; teacher tools are information-dense workspaces and may use the calmer blue aesthetic already associated with teacher-facing UI. Carry across the Brandbook's typography, clear hierarchy, friendly illustration/icon style, and deliberate color system, but do not force the student forest-green palette onto teacher analytics.

### Teacher navigation shell

- Remove the visible **PROTOTYPE** label from the shared brand/navigation area; the product's prototype status does not need a permanent navigation slot.
- Replace the teacher's full-width top navigation with a collapsible/minimizable left sidebar. The preferred compact state retains a narrow rail with the QuizQuest mark and recognizable navigation icons; it should not disappear so completely that the teacher loses their place or a way to reopen it.
- Keep the QuizQuest logo/mark at the top of the sidebar. Make expanded and compact states obvious and provide an accessible collapse/expand control with a tooltip/label.
- The current shield/Q mark may be reviewed for fit with the refreshed identity. Treat a logo change as a small brand refinement: preserve QuizQuest recognition, avoid delaying the navigation/data work, and do not invent a replacement mark without checking it against the Brandbook.
- Keep teacher navigation separate from student navigation behavior. Do not hide teacher navigation on cursor hover; teachers need stable access while reading and scrolling through long pages.
- Let the content area use the full remaining viewport width and height. Account for a sticky/compact sidebar without causing horizontal page overflow. On narrow screens, turn the sidebar into a deliberate drawer/overlay with a visible menu button and close behavior.
- Preserve current routes, permissions, class context, account controls, and sign-out behavior. This is a shell/layout change, not a role or access-control change.

### Shared teacher page layout rules

- Stop constraining every teacher screen to a narrow centered column. Use the viewport width available beside the sidebar, with a reasonable readable max-width only for text-heavy details that truly need it.
- Divide dense pages into named, visually distinct sections. Use clear section headings, spacing, subtle separators or surfaces, and a consistent grid. A heading should make it obvious whether the teacher is viewing an overview, trend, topic breakdown, question list, or quality metric.
- Give related blocks room to breathe and use two-column/uneven-column layouts when they improve comparison. Do not fill space with decoration; use it to make data easier to scan.
- Keep content responsive: charts and tables may use the full desktop canvas, but must become readable stacked panels or deliberate horizontal scroll on small screens. Do not squeeze data into unreadable narrow columns.
- Use the teacher blue palette consistently across page background, navigation, cards, forms, tables, graphs, filters, selected states, empty states, and dialogs. Avoid isolated blue buttons against unrelated green/beige surfaces. Maintain accessible contrast, visible focus, and labels/icons in addition to color.
- Preserve all current teacher functions, data, filters, and actions. Do not remove or silently rename an existing workflow as part of the redesign.

### Teacher analytics

Rebuild Analytics as a full-width dashboard with clear section boundaries and a useful composition, instead of stacking every item in one centered column.

- Place class selection and date/time controls in a compact, persistent page toolbar near the title. Make the selected class visible without consuming a large card. Keep the selector accessible and usable on mobile.
- Start with an **Overview** section containing the highest-value summary metrics. Give it a clear heading and a visually distinct summary band/cards; do not mix it visually with weekly topics or question-level detail.
- Create separate, labeled sections for **Weekly topics**, **Trends**, **Topics and questions**, **Commonly answered questions**, and **Activation quality** (use the product's current exact names where they differ). The page should make these separate areas recognizable before reading individual chart labels.
- Use an asymmetric desktop grid where appropriate: for example, topic performance or a weekly breakdown on the left and a larger trend visualization on the right. Let the important trend graph take meaningful width/height; avoid shrinking it into a tiny card while leaving unused margins.
- Keep axes, date ranges, legend, units, and empty/loading/error states explicit. Do not invent data, trends, comparison periods, or quality scores. If the data is absent, show a calm empty state that says what is missing and what action can provide it.
- Make topic/question rows scannable with clear labels and useful grouping. Put detailed question-level content after the overview/trend information so the page supports both quick scanning and deeper review.
- Let teachers identify what each metric means. Preserve existing definitions and filters; where current data has no clear definition, do not make up a formula—retain the existing label and flag the ambiguity in the implementation report.

### Other teacher areas

- **Classes and roster:** The user considers this area generally good. Preserve its current structure and functionality. Only adapt it to the new sidebar, full available content width, and cohesive teacher palette; avoid an unnecessary full redesign.
- **Question bank:** Use the available width for search/filter controls and a clear question list/detail workspace. Separate filters from results and make question status/actions easy to scan. Preserve current edit/review/regenerate/mark actions and their semantics.
- **Source material:** Stop centering all content in a narrow column. Separate source upload/selection, source list/status, and related question-generation/review areas into clear regions. Preserve existing file/source handling and status information; do not imply that a source has been processed when it has not.
- **Other teacher pages:** Apply the same sidebar shell, page toolbar, full-width layout, consistent spacing, and blue teacher theme. Inspect each page before changing it; preserve workflows that are already effective and focus redesign effort on the cramped/center-stacked layout problem.

### Optional Tinder-style question vetting mode

Add this as an alternate entry mode for vetting AI-generated questions. It supplements the current question review/list workflow; it must not replace, hide, or change the semantics of the existing review flow.

- Add a clearly named entry action at the top of the relevant Question Bank/AI-question review area, such as **Review as cards**. Keep the conventional list/review mode available and make switching between the two modes straightforward.
- In card mode, present one pending question as a large flashcard that uses most of the available workspace. Show the question, answer choices or expected answer as appropriate, topic/source/status, and the relevant supporting details needed for a teacher to make a decision. Do not omit necessary review context just to make the card minimal.
- A left swipe or **Left Arrow** means **Deny**. A right swipe or **Right Arrow** means **Approve**. Show a clear decision label/visual direction before the card leaves so direction is not the only cue. Confirm the action through the existing question vetting state/API and preserve the app's existing permission, status, and error behavior.
- Support mouse drag and touch swipe where practical. Also provide explicit **Deny** and **Approve** buttons so the interaction is usable without a mouse gesture and remains accessible. Do not require swiping to use the feature.
- Keep the existing secondary question actions—such as **Review**, **Regenerate**, **Mark**, or whatever actions currently exist—in a stable control row centered beneath the card. Inspect the real current actions and preserve their labels, behavior, and eligibility; do not invent replacements or apply them to questions where they are not allowed.
- Prevent arrow-key decisions while focus is in an input, textarea, select, or other control where arrow keys should edit/navigate its value. Provide visible focus and keyboard instructions. Keep card actions operable by keyboard and screen reader.
- After a decision, advance to the next eligible question without flashing an empty workspace. Show clear progress (for example, reviewed count/remaining count) based on real queue data. When no questions remain, show an honest completed/empty state and a route back to the standard bank.
- Handle failed saves without losing the current card or falsely marking it accepted/denied. Keep the decision pending or retryable and explain the error.
- If there are zero eligible AI-generated questions, show a useful empty state and leave the standard question bank available. Do not fabricate a sample question.
- On mobile, make the card fit the viewport, keep decision buttons reachable, and ensure swipe does not interfere with page scrolling when the gesture is vertical.

## Visual direction and shared UI rules

- Follow [BRANDBOOK.md](BRANDBOOK.md): cartoon storybook art, forest scenes, parchment surfaces, dark ink, campfire-gold actions, clear serif story headings, and readable body text.
- Do not make every surface parchment/beige. Use forest greens, scene art, metric accents, and restrained story colors to create structure while keeping the overall visual identity cohesive.
- Use the existing local forest artwork and established hero sprites where appropriate. Prefer purpose-drawn SVG building art over emoji or unrelated stock icons.
- Keep the palette consistent across the whole page: background, navigation, buildings, cards, controls, selected/disabled states, and overlays. Do not recolor only one component.
- Treat student and teacher surfaces as related but distinct product spaces: students use the forest/campfire storybook palette; teacher data tools may use a coherent blue palette. Share brand typography, icon quality, spacing, and accessibility standards instead of forcing both roles into identical colors/layouts.
- Keep the storybook style lively and current, not sepia/antique. Do not make every surface an old wooden sign, plank, or parchment sheet; use forest illustration, clean paper, leaves, warm light, and purposeful color as a balanced system.
- Prioritize the map and its characters. Remove redundant copy or decoration if it competes with the buildings or blocks walking space.
- Ensure labels and controls remain readable over both forest and parchment surfaces. Keep visible keyboard focus and meaningful accessible names for icon-only controls.
- Preserve reference proportions and verify that structures, paths, and characters do not overlap at desktop and narrow/mobile sizes.

## Suggested project areas to inspect

- `BRANDBOOK.md`
- `web/src/student/KingdomView.vue`
- `web/src/student/KingdomTown.vue`
- `web/src/student/kingdom/IsoKingdom.vue`
- `web/src/student/BuildingIcon.vue`
- `web/src/student/PetsView.vue`
- `web/src/student/ProgressView.vue`
- `web/src/student/PracticeView.vue`
- `web/src/student/QuizRunner.vue`
- `web/src/LoginView.vue`
- `public/hero-lab/world.html`
- `public/hero-lab/world.js`
- `public/hero-lab/hud.css`
- `src/hero-lab/room.js`
- `web/src/student/gacha/GachaMachine.vue`
- `web/src/student/gacha/PrizeReveal.vue`
- `web/src/student/SummonSky.vue`
- `web/src/teacher/AnalyticsView.vue`
- `web/src/teacher/dashboard/TopicsOverview.vue`
- `web/src/teacher/dashboard/WhenPanel.vue`
- `web/src/teacher/dashboard/ComparePanel.vue`
- `web/src/teacher/dashboard/ContextsPanel.vue`
- `web/src/teacher/dashboard/QualityPanel.vue`
- `web/src/teacher/ReviewView.vue`
- `web/src/teacher/QuestionCard.vue`
- `web/src/teacher/ContentView.vue`
- `web/src/teacher/ImportMaterials.vue`
- `web/src/App.vue` (role routing and shared navigation shell)
- `web/src/app.css`
- `public/hero-lab/assets/forest-clearing.svg`

## UI-phase acceptance checklist

- [ ] The Kingdom map uses the final north/south/east/west building positions above.
- [ ] Castle, Garden, Tower, Library, Workshop, roads, and houses are recognizable and intentionally aligned.
- [ ] Every building has three distinct, role-appropriate visual upgrade stages.
- [ ] First-time students receive a short, skippable Kingdom orientation that is not repeated on every visit.
- [ ] Walking north out of the Kingdom leads through a continuous camera transition to clear Duel and Campfire Run choices that reuse the existing game modes.
- [ ] The Kingdom header reads as the player's storybook town and includes a Buildings shortcut to usable building information/upgrade panels.
- [ ] Building panels explain the current building purpose/effect, show current level, keep the real upgrade action available, and use role-specific content previews without pretending future features are live.
- [ ] Kingdom NPCs wander without blocking paths, greet the player with E, and can show brief, character-appropriate dialogue.
- [ ] Z opens a usable emote wheel with visible emotes; selected emotes appear above the hero and synchronize to other players through the existing multiplayer path where supported.
- [ ] Kingdom character collisions do not trap or continuously shove heroes; rocks are kept out of central walking routes and flowers remain hitboxless.
- [ ] Optional local movement/interaction sounds are quiet, non-disruptive, respect mute settings, and do not require unlicensed external assets.
- [ ] Roads form continuous, usable routes between the castle and each building entrance.
- [ ] Existing upgrade levels and buff effects still display correctly.
- [ ] The Tower’s board/radio foreshadow future barter without pretending trading is functional; the Garden telescope opens the existing Summon page with a thematic transition.
- [ ] The Summon presentation uses starfalls instead of eggs/crank animation and retains individual card reveals plus a final ten-result summary.
- [ ] Four-star and five-star reveals use the specified purple and gold star treatments.
- [ ] My Progress has a clear dashboard hierarchy and uses green/storybook accents so it is not beige everywhere.
- [ ] Starting Practice uses an encounter wipe that visually covers the transition from setup to battle.
- [ ] Login fills the viewport with the form on the left and a softly curved, animated world preview on the right.
- [ ] The in-run World uses a readable forest/grass floor instead of a checkerboard and keeps gameplay elements clear.
- [ ] HUD values and player health are legible, correctly placed, and stable when game state is unchanged.
- [ ] Respawn sprites appear away from the campfire.
- [ ] Victory and defeat screens show a readable left-side summary and the full party on the right.
- [ ] Teacher navigation is a collapsible sidebar with a persistent logo/compact rail; the visible PROTOTYPE label is removed.
- [ ] Teacher pages use the available viewport instead of a narrow centered column, while preserving existing routes, permissions, data, and workflows.
- [ ] Teacher Analytics has distinct Overview, Weekly topics, Trends, Topics/questions, Commonly answered questions, and Activation quality sections with meaningful space for its charts.
- [ ] Classes and roster retains its effective current structure while adapting to the teacher shell; Question bank and Source material are reorganized into clearer, full-width regions.
- [ ] Question bank offers an optional card-vetting mode with left/deny and right/approve gestures, arrow keys, visible buttons, preserved secondary actions, save-error handling, and a route back to conventional review.
- [ ] Teacher screens use a cohesive, legible blue aesthetic without forcing the student forest-green treatment onto data-heavy tools.
- [ ] The whole interface follows the current Brandbook palette and remains legible at desktop and mobile sizes.

## Required visual QA scenarios

Before calling the overhaul complete, run the application and inspect the actual rendered screens. A build passing is not enough: confirm the layout, visual hierarchy, and interaction states below. Use representative desktop sizes (1920×1080 and 1366×768) and a narrow mobile size (390×844). If the app has a different supported minimum width, include that too. Fix clipping, overlap, awkward empty space, illegible text, and controls that cannot be reached before handoff.

### Kingdom

- Inspect the full map at desktop and mobile widths. Confirm North=Garden, South=Tower, West=Library, East=Workshop, Center=Castle; do not infer positions from the current broken layout.
- Inspect each building at levels 1, 2, and 3. Its silhouette must visibly change at each level and remain recognizable as its assigned building. Verify that level labels and existing upgrade effects still match game state.
- Trace the roads from the castle to each building entrance. Every route must connect without a gap, terminate at the entrance, and avoid crossing through buildings or blocking walking paths.
- Confirm the Garden telescope opens the existing Summon view and returns through the app’s normal navigation. Confirm this visual navigation does not trigger a pull or spend currency.
- Check the map with characters present: heroes must not cover entrances, labels, or essential controls.
- Simulate first-ever entry and a later visit. The intro must offer Skip/Continue on first entry and must not block the map or replay every time.
- Walk north through the exit. The camera must transition continuously and expose distinct Duel and Campfire Run choices. Verify both choices enter their existing flows without changing their rules.
- Open each building through the Buildings shortcut and by interacting with the map. Confirm the role-specific panel, title/level/effect, real Upgrade action, and correct disabled/preview states.
- Wait for NPC dialogue and interact with E at different distances. Verify bubbles remain brief, readable, and do not cover controls; verify no dialogue opens when outside the intended interaction range.
- Open the emote wheel with Z, cancel it, then select thumbs-up/down. In multiplayer, verify another player sees the emote; if network support blocks it, record that limitation.
- Walk through busy areas and corners with several heroes. Confirm they do not trap each other, rocks do not obstruct central routes, and flowers do not block movement.

### My Progress

- Inspect a student with progress data and one with sparse or empty progress data. The layout must remain intentional in both cases and must not fabricate a score, trend, recommendation, or chart.
- Confirm overall accuracy/counts, topic accuracy and sample counts, recommendation, recent sessions, and report status can be found in the specified reading order.
- Resize to mobile and confirm cards/tables reflow or scroll deliberately without hiding headings, values, filters, or actions.
- Check body text, meters, status labels, focus outlines, and primary actions against every surface; color alone must not communicate correctness or status.

### Practice and battle transition

- Start a new practice session and resume an unfinished one. In both cases, verify the encounter wipe covers the existing Practice view before the battle view replaces it; no blank or flashed frame may appear between them.
- Confirm the battle starts after the wipe and the existing question/answer, player attack on a correct answer, and enemy attack on an incorrect answer still work.
- Enable reduced motion and repeat the transition. It may be shorter/simpler, but it must remain perceptible and must not skip or break the transition state.
- Check the question text, answers, details, player sprite, enemy sprite, health, and feedback for contrast and clipping at desktop and mobile widths.

### Login

- Inspect the initial unauthenticated view. The form, brand, account/user controls, debug/wrench affordance, and any information panel must remain on the left; the forest/kingdom preview occupies the right side with the broad curved boundary.
- Confirm the preview uses existing hero sprites and visible walk/idle motion, remains decorative/non-interactive, and never intercepts clicks or keyboard focus intended for login.
- Exercise empty/invalid input, validation or sign-in errors, keyboard navigation, and the debug information control. Messages must stay inside the form area and remain readable.
- At 390×844, confirm the composition intentionally stacks/simplifies, gives the form priority, and has no off-screen essential control or overlap.

### In-run World and HUD

- Inspect Lobby, active combat, wave transition/buff vote, player death/respawn, and run completion. Confirm each phase uses the intended single objective/status panel rather than duplicate status boxes.
- In Lobby, verify the panel communicates lobby/start state and campfire health. In combat, verify enemy count occupies roughly the left quarter with wave beneath it and campfire health fills the remaining area.
- Hold the game state still and watch the enemy count. It must remain stable; it changes only when the underlying enemy state changes, not because of render/timer churn.
- Confirm each player’s user/display name is primary and selected hero is secondary. Verify player health appears with that player exactly once and no stray HP line sits below the list.
- Confirm team buffs appear in their own side-by-side, icon-first cards, with readable labels and dark forest treatment. Confirm ability buttons retain their separate visual treatment and working key labels.
- Cause or observe a respawn and verify the hero appears away from the campfire. Confirm the revival sprite and effects do not obscure the fire, player list, or objective health.
- Check aiming rings, hit areas, enemies, projectiles, and fire against the ground at normal gameplay scale. Grass detail must not look like collision geometry or reduce combat clarity.
- Inspect solo and multiplayer states at both desktop and mobile widths. Ensure room code, objective, controls, buff choices, and player labels remain on-screen and do not overlap.

### Run result cards

- Inspect both campfire defeat and successful wave/run completion, in solo and multiplayer where available. Verify the result heading and accent clearly distinguish the outcome.
- Confirm the summary occupies the left information area and the local hero plus every participating friend appear on the right. Check that the correct selected heroes are shown.
- Compare every displayed statistic/reward/bonus with the actual run data. Do not display placeholder coins, stars, personal bests, or bonuses as if earned.
- At mobile width, verify summary, party, and actions stack in a usable order with no clipped values or buttons.

### Summon

- Inspect one pull and ten pulls, including common results and available four-star/five-star results. Confirm one star per result, sequential reveals, a continuous starry/purple interstitial between results, and the final complete summary only after the last reveal.
- Confirm four-star and five-star emphasis uses purple and gold respectively; the special reveal must not recolor unrelated controls or result labels.
- Check that dismiss/continue/click-anywhere behavior matches the existing flow and remains keyboard accessible where it already is. Verify history/details still work.
- Before and after a pull, compare currency, pity, duplicates/refunds, inventory, and history against existing rules. This visual task must not change the economy or summon result logic.

### Teacher shell and pages

- Visit every teacher route: Analytics, Classes & Roster, Question bank, Source material, AI drafting, Evaluation, and Settings. Confirm the persistent sidebar works in expanded and compact states, the compact state retains the logo and navigation affordances, and no route or permission changed.
- Confirm **PROTOTYPE** is removed from navigation while QuizQuest branding remains visible. Scroll long pages with both sidebar states; the sidebar should remain usable and must not cover content.
- On Analytics, verify the class/date controls remain findable and the Overview, Weekly topics, Trends, Topics/questions, Commonly answered questions, and Activation quality sections are visually separated. Confirm graphs use available space and real axes/legends; verify empty/loading/error states.
- On Classes & Roster, compare the result with the current workflow and confirm existing operations still work. Inspect Question bank and Source material at wide and narrow widths; check that controls/results occupy the available canvas without overlapping.
- Enter the optional question-card mode and return to standard review. Test left and right swipe, Left/Right Arrow, visible Approve/Deny actions, and all existing secondary actions. Confirm arrow keys do not decide a card while focus is in an editable/selectable control.
- Simulate a failed decision save and an empty queue. The card must not falsely advance as approved/denied, and no fake sample question may appear.
- Check keyboard focus, screen-reader labels, text/graph contrast, responsive overflow, and compact-sidebar tooltips at desktop and mobile sizes.

## Handoff completion report

When the work is handed back, include a concise report with:

1. Screens and components changed, grouped by Kingdom, Progress, Practice/Battle, Login, World/HUD, Results, Summon, and teacher shell/pages.
2. Any requested behavior that could not be completed, with the concrete reason and affected screen/state.
3. Viewports and scenarios visually inspected, plus any build or interaction checks actually run. Do not claim a check that was not performed.
4. Confirmation that the existing game rules, reward/economy data, and unrevised flows were preserved, or a precise list of intentional functional changes.

## Future feature work (separate from the visual overhaul)

- Class barter board and radio: post offers/requests, browse class requests, accept a trade, and exchange resources.
- Workshop: try or preview heroes and skills.
- Library: browse hero biographies, lore, and world-building.
- Castle: avatar customization with hats, accessories, and colors.
- Castle shop: purchasing/unlocking clothing and accessories, once the customization/economy flow is specified. In this UI phase, show only a clearly labeled preview area if needed; do not invent prices, ownership, or purchase behavior.

