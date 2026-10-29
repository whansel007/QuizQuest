# Kingdom Building Features: UI and Systems Wiring Plan

**Status:** Implementation tracker; see [section 11](#11-implementation-status-and-remaining-release-work) for delivered scope and remaining release work.  
**Scope:** Student Kingdom buildings, their building-specific features, and the transitions from those features to existing student systems.  
**Visual source of truth:** [BRANDBOOK.md](BRANDBOOK.md), especially its forest-and-parchment palette, storybook illustrations, contrast, full-screen student game surfaces, reduced-motion guidance, and page-wide palette consistency.  
**Related handoff:** [UI_OVERHAUL_HANDOFF.md](UI_OVERHAUL_HANDOFF.md).

## 1. Outcome

Turn each building into a useful, diegetic feature entry point instead of a small panel that mixes upgrade copy and feature content. The Kingdom remains the student hub. Building upgrades continue to use the current resource costs and server-side effects; opening a feature must not accidentally buy, summon, trade, or start a run.

The four buildings are:

| Kingdom position | Building | Feature opened from it | Existing upgrade effect to preserve |
|---|---|---|---|
| North | Garden | Telescope and transition to Hero Summon | Campfire health |
| West | Library | Hero storybook and lore archive | Magic hero attack |
| East | Workshop | Hero preview and no-reward training trial | Physical hero attack |
| South | Tower | Class resource exchange board and radio | Campfire-run team buffs |
| Center | Castle | Royal wardrobe and player avatar customization | Castle level tracks the least-upgraded building |

Building effects are not the buildings' only purpose. Show the effect and the upgrade action compactly in the building header; dedicate the remaining space to that building's feature.

## 2. Implementation guardrails

1. **Keep the established rules.** `src/quiz/economy.js` owns resource names (`wood`, `crystal`, `herb`), building costs and levels, existing effect values, trade escrow, trade limits, and daily resource limits. “Leaf” in UI copy should map to the existing `herb` resource unless a separate resource is deliberately designed later.
2. **Keep economic decisions server-authoritative.** The browser may preview a cosmetic or trade selection, but must never decide price, ownership, available balance, building level, accepted trade state, or reward outcome.
3. **Reuse existing systems.** Reuse the existing Kingdom/build endpoints, class trading endpoints, hero catalog, summon route, combat engine, hero animations, and avatar-color behavior. Avoid a parallel trade/summon/economy implementation.
4. **Make every mutation atomic and retry-safe.** A double click, network retry, or refresh must not double-spend resources, duplicate ownership, accept a trade twice, or apply an upgrade twice.
5. **Do not let two persistence paths write the same rows.** `src/db/supabase-store.js` currently loads/diffs an in-memory snapshot and is documented as single-server-instance behavior. A new SQL/RPC write to a row that the snapshot store later upserts can be overwritten by stale state. Before shipping transactional writes, establish one writer for each affected entity: either route all reads and writes for that entity through a repository, or keep the existing single-process store as the sole writer until the entity is migrated. Do not combine direct RPC mutations and snapshot-store upserts for the same inventory, kingdom, trade, or ledger rows.
6. **Preserve RLS and server secrets.** Keep Supabase service credentials on the server. The browser uses authenticated application APIs, never direct access to protected tables.
7. **Use reduced motion and sound preferences.** Do not make ambience, animation, or audio necessary to understand or use a feature.
8. **No whole-Kingdom yellow outline.** Remove the unexplained outer yellow border from the Kingdom view; reserve accent outlines for selected items, focus, or meaningful rarity/status.
9. **Match the supplied window proportions.** Every building window should occupy roughly 80–82% of the viewport width and height on desktop, leaving a visible band of the town around it. The screenshot with the red perimeter is the sizing reference. Do not interpret “large” as a conventional centered dialog or a small card. At 1870×1035, target approximately 1500×840 CSS pixels; cap dimensions for very large monitors and use nearly all available space on smaller screens.

## 3. Current architecture to build on

| Area | Current implementation | Plan for extension |
|---|---|---|
| Kingdom UI | `web/src/student/KingdomView.vue`; fetches `/api/student/kingdom`, opens building panels and handles telescope transition | Retain routing and state ownership; replace compact mixed-content panel with larger feature-oriented panels |
| Kingdom town | `web/src/student/KingdomTown.vue`; canvas world, player/other hero visuals and interactions | Keep the town scene as hub; add clear building affordances and preserve existing interaction/navigation behavior |
| Building effects | `web/src/student/kingdom/building-effects.js` | Continue deriving display effects from canonical building level/effect data; do not hard-code a second buff table in Vue |
| Avatar rendering | `web/src/student/avatar.js`, `AvatarPreview.vue`, Kingdom and game renderers | Add one validated avatar-appearance projection and use it in every relevant renderer |
| Economy | `src/quiz/economy.js`; resources, three-level upgrades, class-scoped trades and escrow | Reuse current functions/rules; add transactional storage/repository semantics before production multi-instance writes |
| API | `src/quiz/api.js`; student auth, enrollment checks, Kingdom/build/color/trade/summon routes | Add narrow feature endpoints using existing authentication and class-membership helpers |
| Persistence | `supabase/migrations/20261007000000_quizquest_init.sql`, `src/db/schema.js`, `src/db/supabase-store.js` | Add migrations only for new persistent cosmetic ownership/loadout and idempotency needs; reuse `kingdoms`, `inventories`, `trades`, `resource_log`, `ledger` where appropriate |
| Hero Summon | `POST /api/student/hero-summon`, history endpoint, existing gacha and pity rules | Garden navigates to the existing Summon page; do not create a second summon path or charge for merely looking through the telescope |
| Hero Lab / combat | `web/src/student/HeroLabView.vue`, `public/hero-lab/world.js`, `src/hero-lab/room.js`, `rooms.js` | Add a private, no-reward workshop training mode that reuses combat behavior and enforces server-side session permissions |

### Existing API contracts to preserve

- `GET /api/student/kingdom` returns the current student's building levels, castle level, resources, earning cap data, and building/resource information.
- `POST /api/student/kingdom/build` accepts a building and retry/request ID; server-side economy logic validates the building, next level, and cost.
- `POST /api/student/avatar/color` persists the current avatar color. Existing color behavior must remain available for current users.
- Class trades are already exposed through `GET` and `POST /api/student/classes/:classId/trades`, plus `POST /api/student/trades/:tid/accept` and `/cancel`. `src/quiz/economy.js` enforces class trading settings, resource bundles, escrow/refunds, and limits.
- `POST /api/student/hero-summon` owns pull cost, result generation, pity, duplicates/refunds, inventory changes, and idempotency. Garden should route into that flow, not reimplement it.

## 4. Proposed persistent data model

The normalized tables below are the future multi-instance target. For the current application, wardrobe ownership, equipped slots, and request receipts live in the existing `inventories.extra` JSONB on the same inventory row as wood/crystal/herb. This uses the existing Supabase snapshot store as the sole writer and needs no new migration. Paid first-release cosmetics use those resources so the debit and ownership update share one persisted row; `resource_log` records the request for audit and recovery. Do not add direct SQL writes to these rows alongside the snapshot store.

### 4.1 Cosmetic catalog

`cosmetics_catalog` is server-managed inventory metadata, seeded by migrations or controlled admin tooling.

| Column | Type / constraint | Purpose |
|---|---|---|
| `id` | text primary key | Stable cosmetic identifier, such as `hat_cowboy` |
| `slot` | text check: `hat`, `accessory`, `color` | Which loadout slot it can occupy |
| `name` | text not null | Display name |
| `description` | text | Short flavor/appearance description |
| `render_value` | text not null | Allowlisted asset key, palette key/hex, or allowed emoji; never arbitrary HTML/image URL |
| `currency` | nullable text check: `coin`, `wood`, `crystal`, `herb` | Purchase currency; null for free/default items |
| `cost` | nonnegative integer | Server-defined purchase amount |
| `active` | boolean not null default true | Allows retiring an item without deleting historical ownership |
| `sort_order` | integer not null | Stable UI order |
| `metadata` | jsonb not null default `{}` | Safe cosmetic options such as preview offset or rarity label |
| `created_at` | timestamptz | Audit timestamp |

Catalog asset values must reference local, known assets or approved tokens. For first release, emoji accessories should come from a fixed allowlist with safe position/scale metadata. Do not accept user-supplied HTML, SVG, image URLs, or arbitrary emoji sequences from purchase/loadout requests.

### 4.2 Student cosmetic ownership

`student_cosmetics` records each owned catalog item. Use `(student_id, cosmetic_id)` as the primary key so repeated purchases cannot create duplicate ownership. Include `acquired_at`, `source` (`starter`, `purchase`, `grant`), and nullable `purchase_ref` for audit/idempotency. Foreign-key the user and catalog item. Add an index on `(student_id, slot)` through the catalog join only if query plans need it; a denormalized slot is not necessary initially.

### 4.3 Equipped avatar loadout

`student_avatar_loadouts` has one row per student:

- `student_id` primary key / foreign key;
- nullable `hat_id`, `accessory_id`, and `color_id` foreign keys to catalog items;
- `updated_at`.

Validate that each referenced item is owned by that same student and belongs to the expected slot before update. An empty slot is valid. The default/original avatar color remains valid even if it is not a purchasable catalog item.

### 4.4 Purchase idempotency

Use a request record keyed by `(student_id, request_id)` for cosmetic purchase results, or an existing shared idempotency abstraction if one is introduced. Persist the item ID and outcome. The same request ID returns the original result; a new request for an already-owned item returns an `already_owned` result without charging again.

### 4.5 What should not be added

- Do not duplicate trades in a new “tower offers” table. Continue to use `trades` and `resource_log`.
- Do not duplicate the Kingdom building levels or effects in a new client-owned table. Continue to use `kingdoms` and canonical economy definitions.
- Do not persist training enemies or grant training rewards. Training sessions should be short-lived server sessions only.
- Keep hero lore in versioned application data (for example, `src/quiz/hero-lore.js`) for this version. A lore table is unnecessary until teacher/admin editing is a real requirement.
- Do not treat existing pet-shop `equipped_item` as the avatar's hat/accessory slot without confirming its rendering/ownership semantics. The player avatar loadout and the currently equipped pet item are separate concepts.

### 4.6 Migration/backfill and indexes

1. Create and seed the cosmetic catalog with a free original/default look and a small first set of hats, colors, and emoji accessories.
2. Preserve each existing `users.extra.avatarColor` value. Backfill it to a matching color catalog entry/loadout only when the exact value is recognized; otherwise retain it as a legacy color projection and make it free/owned. Never charge a current student to keep their existing color.
3. Add foreign keys, ownership unique constraints, slot checks, and indexes for `student_id`, active catalog filtering, and request idempotency.
4. Enable RLS on new student tables with no direct browser policies unless the established security model explicitly changes. Server endpoints remain the access path.
5. Migration rollback must not delete student ownership or loadouts. Deactivate catalog entries rather than deleting entries already referenced by students.

## 5. API and service contracts

All handlers must use the existing authenticated student identity. Never trust a `studentId` from the JSON body. Validate request sizes and return stable error codes suitable for UI handling.

### 5.1 Wardrobe

**Read:** `GET /api/student/castle/wardrobe`

Return only the caller's data:

```json
{
  "catalog": [{"id":"hat_cowboy","slot":"hat","name":"Trailblazer hat","renderValue":"🤠","currency":"herb","cost":6,"active":true}],
  "ownedIds": ["color_f2ba55"],
  "equipped": {"hatId":null,"accessoryId":null,"colorId":"color_f2ba55"},
  "resources": {"wood":8,"crystal":3,"herb":2},
  "avatarVisual": {"color":"#F2BA55","hat":null,"accessory":null}
}
```

Catalog can be public to authenticated students, but ownership, balances, and equipped state must always be derived for the authenticated caller.

**Purchase:** `POST /api/student/castle/wardrobe/purchase`

Body: `{ "cosmeticId": "hat_cowboy", "requestId": "client-generated-uuid" }`.

The current single-writer route loads the active catalog item and server price, validates the existing inventory resource balance, then writes the resource debit, owned ID, loadout, and retry receipt through the same inventory object. It writes an audit row to `resource_log` with a unique request ref. An already-owned item returns success without a debit. The client never sends a price or amount. If this feature is moved to multi-instance persistence, replace this with one database transaction before enabling concurrent writers.

**Equip/save:** `PUT /api/student/castle/wardrobe/loadout`

Body: `{ "hatId": "hat_cowboy", "accessoryId": "accessory_star", "colorId": "color_moss" }`; null is allowed per slot. Validate each catalog row's active policy and slot, ownership, allowed color/asset values, and that all IDs belong to the caller. Save in `inventories.extra` and return the canonical `avatarVisual` projection.

**Avatar projection:** Include `avatarVisual` in the existing authenticated self/profile response and in the server-authoritative room/player join payload used by Kingdom, duel, and run. It should contain only stable render keys (color, hat, accessory), never catalog prices or other students' balances. Other players' visuals may be shared to room members as public cosmetic state; ownership and wallet data must not be shared.

### 5.2 Kingdom/building information

Continue `GET /api/student/kingdom` and `POST /api/student/kingdom/build`. Keep existing API compatibility. Add only safe display fields needed by the new panels, such as `currentEffect`, `nextEffect`, `nextCost`, `maxLevel`, and `castleLevel`. Treat every returned cost as informational; `build()` remains the authority.

The UI should submit a stable request ID for each upgrade attempt. The backend must ensure one successful level increment and one corresponding spend/log entry. If current generic persistence cannot guarantee a transaction across resource decrement, level increment, and resource log insert, move the operation behind a database transaction/repository before enabling concurrent production writes.

### 5.3 Tower trade board

Reuse the existing class trade endpoints. The Tower UI needs the student's active class ID from the existing class context. Read and create requests through `/api/student/classes/:classId/trades`; accept/cancel through the existing trade ID routes.

Add/confirm server-side checks before opening or mutating the class board:

1. Student is enrolled in the requested class (reuse the existing class-member helper).
2. The class has `settings.tradingEnabled === true`.
3. The student's own Kingdom has reached the agreed Tower unlock level (recommended first release: level 1). Check on list, create, accept, and cancel routes; do not rely on hiding a button.
4. Preserve current bundle validation, open-offer limit, daily completion cap, escrow, refunds, and class scoping in `src/quiz/economy.js`.
5. Reject accepting one's own trade and reject stale/non-open offers. Check both parties' membership and balances at commit time.
6. Accept must be atomic: lock trade, then lock both inventory rows in sorted student-ID order; verify open status, class setting, membership, limits, and requested resources; exchange resources; write both resource logs; transition the trade to accepted. A retry of the same request returns the accepted result, while a different request against an accepted trade returns a conflict.
7. Cancel must be restricted to the offer creator (and any existing authorized staff behavior, if present), refund escrow once, and close the trade atomically.

Do not change current trade caps or add a fee as part of this UI work. The board is a visual/interaction layer on the existing feature.

### 5.4 Workshop trial

Add a server-authorized session creation endpoint (for example `POST /api/student/workshop/trial`) that accepts a valid owned hero or a hero explicitly allowed by the final trial policy and returns a short-lived session identifier/ticket plus the trial URL. The user asked to try different heroes; recommended first release is to allow the full hero roster in this isolated zero-reward mode, while leaving ownership rules unchanged in normal play.

The trial session must be marked `mode: "workshop_trial"`, bound to the initiating student, expire automatically, and be rejected by all reward/coin/resource/quest/session-completion handlers. WebSocket commands must verify the signed ticket and session mode. Spawn commands accept only server allowlisted enemy IDs and rate/count caps. Do not accept arbitrary client entity JSON or damage values.

### 5.5 Garden/summon navigation

No new summon endpoint. Keep `lookThroughTelescope()` (or its replacement) as a presentation/navigation action into the existing Summon tab. The transition must finish before activating the new page; it must not call `/api/student/hero-summon` until the student chooses a pull. Preserve summon costs, history, pity, results, and request idempotency.

## 6. Building-by-building UI and behavior

### 6.1 Shared building panel pattern

- Use a near-full-screen, responsive feature window matching the supplied screenshot's red outline: approximately `80–82vw` by `80–82vh` on desktop, with a visible town margin on all sides (target about 1500×840 px at 1870×1035). Keep it centered over the town. A practical CSS starting point is `width: min(82vw, 1540px)` and `height: min(82vh, 900px)`, adjusted for viewport padding, with internal scrolling for overflow. This must read as a large immersive building workspace, not a standard small modal. On smaller screens, use nearly the full available viewport, stack sections, and keep actions reachable while content scrolls. Respect the brand book's forest scene, parchment surfaces, ink outlines, paper texture at low contrast, story typography, and bright readable controls.
- Header: building name and level; a small information chip opens a separate level/effect explainer. Put the current effect and next-level effect/cost in a compact strip beside the Upgrade button. Keep level/cost copy out of the feature's main content area.
- Feature body: scene/art plus a usable feature, with building-specific hierarchy below. Do not put every feature into one generic box.
- Keep the entire Kingdom canvas free of the unexplained yellow outer border. Selected/keyboard-focused items may still use a meaningful accent outline.
- Upgrade disabled states must explain whether the building is maxed or which resources are missing. After a successful upgrade, refresh canonical Kingdom data and update the relevant scene/building level appearance without optimistic permanent state.

### 6.2 Castle — Royal Wardrobe

**Layout:** Large panel with a 75/25 split on wide screens. Left 75% is the wardrobe catalog and controls; right 25% is a persistent live avatar preview. On mobile, catalog and preview stack, with the preview remaining visible or easy to reopen.

**Left side:** Tabs/filters for Hats, Colors, and Accessories. Show each item as an illustrated catalog card with name, owned/equipped/locked state, cost and currency, and an Equip/Buy action. Use coins, wood, crystal, or herb only when the catalog specifies that currency. Preserve the original avatar color as an available option for existing users. Previewing an item is local and free; purchasing and equipping are distinct actions. Do not auto-purchase on selection.

**Right side:** Show the player's cat-ball in a castle room/wardrobe scene: wardrobe or castle wall/window, blue sky and greenery outside, warm storybook lighting. Apply the selected preview color and accessory without saving until Equip/Save. The preview should remain recognizable and correctly grounded/aligned.

**Accessories:** First release may use an allowlisted emoji overlay at a catalog-defined anchor. Establish safe anchors relative to sprite bounds (for example hat/top, badge/lower-right, glasses/face) and verify on each hero/body shape. Mirror overlays with the avatar's facing direction only when the asset should mirror; keep directional asymmetry consistent with the base sprite. A shared visual descriptor should be consumed by Kingdom, duel, multiplayer, and any hero preview. If combat surfaces cannot render overlays faithfully, define a single shared avatar renderer/overlay layer before enabling purchase.

**Persistence:** Use the current inventory-row ownership/loadout model above. Existing color is grandfathered. The current hero choice remains a separate gameplay selection; wardrobe changes the player's avatar appearance, not the chosen combat hero unless product requirements explicitly merge them.

### 6.3 Library — Hero Story Archive

**Scene:** A large magical library with illustrated shelves. Books are visible objects, not generic feature tiles. Clicking or keyboard-activating a book opens a two-page story spread. Use a clearly operable close/back control and an accessible dialog label.

**Book spread:** Left page contains hero name, lore, personality/quirk, and optionally a short “field note”; right page contains a large hero portrait/animation. Include all heroes in the current hero catalog, not only magic heroes. A “Magic” collection label can explain the upgrade's affinity without implying other heroes are unavailable.

**Header:** Library level/effect/next cost and Upgrade remain compact and adjacent. The lower/majority panel space belongs to shelves and open book. Keep `library` attack bonus semantics from `building-effects.js`/server canonical config.

**Versioned lore draft** (write in inclusive, light, storybook voice; all characters are nonbinary, use they/them):

- **Sheriff:** They folded a paper star into a badge, bought a cowboy hat, and pinned the star on. Everyone started calling them Sheriff. No one asks why a paper badge comes with a real gun; Sheriff means well, solves problems, and takes the job seriously.
- **Bombardier:** A cheerful pirate with a dramatic eyepatch display. The eye underneath still works perfectly; they changed the screen icon because it looked more pirate-like. Their crew has learned not to ask whether the eye patch needs polishing.
- **Guardian:** The town's shield-bearing protector and the sole inventor and practitioner of Rollate: a martial art based on rolling across grass. Guardian is, by a technicality, the world's best Rollate master. Asked why they do not carry a sword, they point to the shield and begin a demonstration.
- **Pilot:** Their mech has a mind of its own and must recharge between outings. When Pilot gets into the action, the mech's onboard intelligence gets so excited that it recharges faster and clambers back into the fray. Pilot insists this is a documented engineering feature.
- **Bubbles:** A young library visitor who gained magic simply by spending time near the library's enchanted books. They mostly read the children's shelf. Bubbles joined the town's defenders, provided nobody schedules them for the night shift; bedtime is bedtime.
- **Electromancer:** An electrician who borrowed the wrong book from the library. The book was full of lightning magic. They returned it late, learned to channel the sparks, and still label every wire carefully.

Store lore in application data keyed by stable hero ID. Use existing hero names, talent names, stats, and portrait assets from the canonical hero catalog rather than copying those into lore records.

### 6.4 Tower — Class Exchange Board

**Scene:** A large, diegetic communications tower interior with a physical request board covered in post-it/quest notes and an old radio. The board is the feature surface; the radio provides flavor/status and can explain when classmates are offline. Do not imply that a request is globally visible: each list is scoped to the student's selected class.

**Browse:** Show one offer per note/card with creator display name, “give” bundle, “want” bundle, and status. Include paging/next controls and filters for open/own offers. Do not expose balances or offers from classes the student is not enrolled in.

**Accept interaction:** Selecting a note opens an enlarged preview/confirmation view. Show the exact before/after exchange and current affordability. An X/Cancel closes the preview without a mutation; a separate Yes/Accept button submits the existing accept route. Revalidate on the server because balances/status may change between preview and click. Disable repeated submission and show a clear stale/insufficient-resource result with a refresh action.

**Create request:** Use existing create trade route. Provide “I offer” and “I am looking for” resource controls, validate client-side for convenience, and show the server's current limits. Confirmation summary must state that offered resources are held in escrow until accepted or cancelled. Do not say that class members are guaranteed to accept.

**Server integration:** Tower level unlock gate is recommended at level 1; class-level `tradingEnabled` remains required. Reuse existing escrow and caps. Add no new trade table or independent resource balance. If students can belong to multiple classes, require/retain explicit active-class selection when entering the board; never guess a class based on the most recent trade.

### 6.5 Workshop — Hero Training Ground

**Panel layout:** Large 50/50 division. Left half: selectable roster of all heroes. Right half: top half is an animated hero preview in a training yard with targets/punching bags/mechanical props; bottom half is detailed hero information: primary fire, skill, ultimate, talent, HP, attack, defense, speed, and any relevant cooldown. “Start Test” is a clear action adjacent to the selected hero heading or preview.

**Trial scene:** Full-screen private practice arena that reuses combat controls, hit detection, hero abilities, enemy AI, and sprite rendering. Distinguish it visually from a live campfire run (training floor, painted targets, or workshop floor), while preserving battlefield readability. Provide bottom/side controls for spawning one allowlisted enemy at a time: zombie, skeleton, devil, exploder, brute, or boss. The client may repeatedly request a spawn; the server enforces an entity cap and rate limit. “Summon Wave” creates a pre-defined mixed wave (excluding boss) for testing chains and abilities. Give the campfire/target effectively infinite health or use a non-damageable target; show no countdown, victory, defeat, rewards, progress credit, or leaderboard contribution. Provide a consistently visible Exit control.

**Authority and reuse:** Use a dedicated trial room/session mode and share combat logic with the existing Hero Lab/Campfire Run. Do not create a normal multiplayer room with a hidden client flag. Server validates ticket, owner, selected hero, spawn enum, caps, and session expiry. Reject or ignore reward-generating events at the server session boundary, not just in the UI. If the current room system cannot express a private no-reward mode without making live runs vulnerable, implement a separate room type that calls the shared combat systems.

### 6.6 Garden — Star Telescope

**Scene:** A spacious garden with fountain/greenery, telescope, visible deep blue sky, and gentle meteor/shooting-star movement. The building effect and Upgrade action stay in the compact header. The main scene should sell the experience of sitting in the garden and looking upward, not repeat the summon page's controls.

**Action:** A clear “Look through the telescope” action transitions to the current Summon page. It is navigation only; the user must still choose Summon ×1/×10. No pull or currency spend occurs when entering or during the transition.

**Transition:** Replace the current single donut transition that leaves uncovered gaps. Use overlapping/concentric blue lens rings whose outer layers cover every viewport pixel before collapsing, or a telescope-lens zoom that fully covers the viewport. Sequence: (1) reduce-motion check; (2) lock repeat activation; (3) animate lens/sky over full viewport with no transparent hole/gap; (4) switch to existing Summon tab while covered; (5) reveal the destination; (6) release input lock. Avoid a white/blank flash between tabs. On reduced motion, use a short cross-fade or immediate page switch.

**Sound:** Optional, quiet telescope chime/meteor whoosh if an existing sound framework supports it. Respect global mute and reduced-motion/audio preferences; never autoplay a loud or continuous loop. Audio failure must not block navigation.

### 6.7 Building shapes and level feedback

UI work should preserve the agreed layout/positions (Garden north, Library west, Workshop east, Tower south, Castle center). Each upgrade level should visibly change the relevant building silhouette/art in the Kingdom. Before authoring three sets of art, inspect actual asset availability and existing town renderer. If level art does not exist, provide a defined three-state illustration plan (recognizable base shape at levels 1–3) and make the visual state derive only from `GET /api/student/kingdom`. Do not invent unsaved client-side levels. Castle level continues to follow the current minimum-building rule unless a separate gameplay decision changes it.

## 7. State flow and failure handling

For all panels: `closed -> loading -> ready -> submitting -> success/error`. On open, fetch authoritative feature data; show an in-panel loading state rather than stale content. On a mutation, prevent duplicate submission, send an idempotency key, then replace local balance/ownership/building/trade state with the server response. On network failure, preserve the user's draft form and allow safe retry with the same request ID. Do not claim a purchase, upgrade, or trade succeeded before the API confirms it.

Trade confirmation must show “offer changed” or “not enough resources” and refresh the relevant board data when the API reports a stale state. Cosmetic purchase conflicts should resolve to “already owned” without debit. Upgrade conflicts should refresh cost/level. Training session expiry should return the player to the Workshop with a simple explanation. Telescope animation interruption should still land on Summon or restore the Garden; it must never leave the app stuck under an input-blocking overlay.

## 8. Delivery sequence

1. **Audit and contracts:** Confirm current identity/profile and websocket payload paths, inventory/coin/resource transaction boundaries, active-class selection, and current room authorization. Document the snapshot-store single-writer constraint before adding direct database writes.
2. **Persistence foundation:** Decide per-entity writer/repository strategy. Add cosmetic schema/catalog/backfill and transactional service functions; add idempotency, constraints, indexes, and RLS. Keep existing APIs and behavior compatible.
3. **Avatar visual projection:** Add one canonical safe `avatarVisual` projection; wire it into Castle preview, Kingdom local/remote player rendering, duel, and Campfire Run. Verify default and legacy color values.
4. **Castle wardrobe:** Implement responsive 75/25 UI, catalog filters/cards, preview-only state, purchase, equip/save, loading/error/empty states, and resource/coin receipt updates.
5. **Library archive:** Add stable hero lore data for all heroes and the illustrated shelf/book spread. Keep upgrade effect data canonical.
6. **Tower board:** Upgrade the panel to the diegetic board, wire existing class trade endpoints and Tower/class gates, then implement clear accept confirmation and create flow.
7. **Workshop trial:** Implement private no-reward server session and authorized spawn protocol, then wire the 50/50 selector/detail panel and test arena. Ensure no reward code can process trial activity.
8. **Garden/telescope:** Build the scene and full-viewport transition into the existing Summon page; add reduced-motion and optional quiet sound behavior.
9. **Kingdom integration:** Show authoritative three-level building art, consistent compact upgrade/effect headers, remove outer yellow border, and verify all transitions back to the town.
10. **QA and release:** Run the test/acceptance matrix below, then perform visual review at desktop/tablet/mobile sizes and with keyboard/reduced motion. Do not release transactional cosmetics/trades/training until the single-writer and reward-isolation checks pass.

## 9. Verification checklist

### Persistence and economy

- A wardrobe purchase debits exactly one server-defined currency amount, grants exactly one owned catalog item, and survives reload.
- Duplicate request ID, repeated click, lost response and retry do not double debit. Already-owned items do not charge.
- Insufficient balances, inactive catalog items, invalid slot IDs, unsupported emoji/render keys, and another student's cosmetic IDs are rejected.
- Existing avatar colors load correctly and remain usable without payment after migration.
- Equipped loadout is validated against ownership on every write; default/cleared slots work.
- Avatar appearance is consistent in Kingdom, duel, and run, including mirrored/facing directions and overlay anchoring.
- Building upgrades retain exact existing costs/effects/three-level cap and are single-spend/single-increment under retry/concurrent clicks.
- No stale snapshot-store write can overwrite a transactional repository/RPC update.

### Tower trades

- A student can read only trades for an enrolled class with trading enabled and Tower unlocked.
- A student cannot list, create, accept, or cancel through a class they are not in; hidden UI is not the only protection.
- Own offer cannot be accepted; open limit, bundle limit, daily cap, escrow, accept, cancel/refund all match current rules.
- Concurrent accepts of one request yield one exchange; a second accept sees a conflict/stale result; retries do not duplicate resources.
- Cancel/accept write resource logs and trade state atomically. Request display never exposes another class's records or private balances.
- X closes the confirmation without network mutation; Yes causes one accept request.

### Workshop

- Trial ticket cannot be reused by another student or after expiration.
- Only allowed enemy identifiers can be spawned; spam is capped; boss spawn is explicit; mixed wave excludes boss.
- Trial allows the intended full hero roster, uses real combat controls, and never grants currency, resources, XP, participation, quest progress, or run statistics.
- Trial has no game-over/win/reward state, and Exit returns to Workshop even on session/socket failure.
- Normal Campfire Run remains unchanged and continues to reward normally.

### Building presentation and transitions

- All five building entry points open the correct building-specific content; effect/current/next cost and Upgrade remain readable and accurate.
- Three building levels map to the correct saved art state; refresh/re-entry does not reset visual level.
- Library books open/close accessibly; every current hero has a portrait and lore; no character is misgendered.
- Garden transition covers the viewport without a gap/flash and navigates to Summon without pulling/spending.
- Reduced-motion users receive a usable no-flash transition; sound is muted/optional and never blocks navigation.
- No yellow outline frames the entire Kingdom view; focus and selected states remain distinguishable.
- Panels remain usable with keyboard and screen reader; small screens scroll/stack without clipped actions or overlap.

## 10. Decisions confirmed for the first release

1. **Tower unlock:** Tower level 1 plus the class `tradingEnabled` flag; existing caps remain unchanged.
2. **Workshop hero roster:** Any catalog hero in the no-reward trial, even if not owned; normal game ownership remains unchanged.
3. **Cosmetic prices:** Ribbon and star pin are free; top hat is 8 wood; crown is 3 crystal; trailblazer hat is 6 herb; leaf pin is 3 herb; heart pin is 2 crystal. Colors remain free. Prices are server-side in `config/avatar-cosmetics.js` and can be adjusted there.
4. **Avatar versus hero:** Wardrobe changes the player's persistent cat-ball identity; combat hero selection stays separate.
5. **Storage:** Current database writes stay on the snapshot store's existing inventory row. A normalized transactional repository for multi-instance operation remains a separate migration.

## 11. Implementation status and remaining release work

### Implemented in the current application

- All five building entry points use the shared large Kingdom window sizing and a compact header for level/effect/upgrade information. Building art reads authoritative Kingdom levels and has three visible states.
- **Library:** fixed-height book spines fill the shelves; selecting a hero opens an illustrated storybook overlay above the archive. Current hero lore and combat details are shown in the spread, with Escape/backdrop/Back-button close behavior and focus return.
- **Tower:** the left side is a class exchange notice board and the right side is the offer desk. It reuses class trade routes, requires an enrolled class and Tower level 1, previews resource changes, asks before escrow, pages longer boards, and keeps open offers cancelable/refundable.
- **Workshop:** the member list and hero detail are styled as sign-in paperwork and a training form. The selected catalog hero opens a private workshop trial with server-issued authorization; trial entities and reward paths are isolated from normal run rewards.
- **Garden:** the scene embeds the Summon page's `SummonSky`, overlays star-point constellation paths, and transitions into the existing Summon page without pulling or spending. Reduced-motion navigation bypasses the zoom animation.
- **Castle:** hat, pin, and color preview/save are wired. Purchases use server-side wood/crystal/herb prices; ownership, equipped loadout, request receipts, and resource balances persist together in `inventories.extra` through the existing database store. The castle-level explanation is a compact info chip. Player avatar appearance is projected separately from the selected combat hero and carried in room roster data.
- Diegetic Kingdom window guidance has been added to `BRANDBOOK.md`, including palette, sky, book shelf, and paperwork direction.

### Remaining before a production release

1. **Multi-instance transactions:** the existing snapshot store supports the database in its documented single-server-instance model. Before running multiple app instances or relying on cross-instance concurrent mutations, establish a repository/RPC writer for each affected entity and migrate atomically. Do not mix that writer with stale snapshot upserts.
2. **Acceptance and visual QA:** the plan's economy/retry/security matrix and desktop/tablet/mobile visual review have not been run as part of this implementation pass. Run them before release, including keyboard and reduced-motion review. This pass ran the production build, Node syntax checks for the touched server files, and `git diff --check`; it did not run the test suite or browser acceptance review.
3. **Optional telescope sound:** no extra chime/whoosh was added; navigation and visual feedback work without audio.

The remaining items are deployment/product decisions or pre-release validation; they are not additional building UI phases currently missing from the implemented local feature flow.

