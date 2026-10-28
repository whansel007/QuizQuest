<script setup>
// ============================================================
// STUDENT: walkable kingdom town
// HUD, building panels, the first-visit tour and the telescope
// hand-off to Hero Summon. The map itself lives in KingdomTown.
// ============================================================
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, retryablePost, setTab } from '../api.js';
import { fmtBundle, toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import { loadHome } from './home.js';
import KingdomTown from './KingdomTown.vue';
import AvatarPreview from './AvatarPreview.vue';
import BuildingIcon from './BuildingIcon.vue';
import { BUILDING_ROLES, buildingCap, buildingEffect } from './kingdom/building-effects.js';
import { GAME_CONFIG } from '../../../public/hero-lab/game-config.js';
import {
  BUILDING_LEVEL_CAP, TOWN_AVATAR_DEFAULT_COLOR, TOWN_AVATAR_ORIGINAL_COLOR, TOWN_AVATAR_PRESET_COLORS, TOWN_MAX_HEROES,
} from '../../../config/tuning.js';

const error = ref('');
const loaded = ref(false);
const k = ref(null);
const homeData = ref(null);
const town = ref(null);
let alive = true;

onMounted(async () => {
  window.addEventListener('keydown', onTownKeydown);
  try {
    homeData.value = await loadHome();
    if (S.classId) {
      const kd = await api('GET', '/api/student/kingdom');
      if (!alive) return;
      k.value = kd;
    }
    if (alive) loaded.value = true;
    if (alive && k.value) maybeStartIntro();
  } catch (err) {
    if (alive) error.value = err.message;
  }
});
onUnmounted(() => {
  alive = false;
  window.removeEventListener('keydown', onTownKeydown);
  clearTimeout(lensTimer);
});

const R = computed(() => k.value.catalog.resources);
const ownedHeroes = computed(() => {
  const home = homeData.value;
  if (!home) return [];
  const owned = new Set(home.inventory.heroes);
  return home.catalog.heroes.filter((hero) => owned.has(hero.id));
});
const townHeroes = computed(() => ownedHeroes.value.slice(0, TOWN_MAX_HEROES));
const upgraders = {};
const townTarget = ref(null);
const customizeOpen = ref(false);
const listOpen = ref(false);
const previewColor = ref(S.me?.avatarColor || TOWN_AVATAR_DEFAULT_COLOR);
const colorSaving = ref(false);
const plots = computed(() => Object.keys(k.value.catalog.buildings).map((id) => {
  const def = k.value.catalog.buildings[id];
  const lvl = k.value.buildings[id];
  const cost = def.costs[lvl];
  const affordable = !!cost && Object.entries(cost).every(([r, v]) => (k.value.resources[r] || 0) >= v);
  return { id, def, lvl, cost, affordable };
}));
const townPlot = computed(() => townTarget.value && townTarget.value !== 'castle' ? plots.value.find((p) => p.id === townTarget.value) : null);
const castleMeaning = computed(() => k.value?.castleLevel === 0
  ? 'Your castle grows as every building reaches the same level.'
  : `Every building has reached level ${k.value?.castleLevel}. The castle level is the lowest level among your four buildings.`);
const heroesOfType = (type) => ownedHeroes.value.filter((hero) => hero.type === type);
const haveText = computed(() => {
  const res = Object.fromEntries(Object.entries(k.value?.resources || {}).filter(([, v]) => v > 0));
  return Object.keys(res).length ? fmtBundle(res, R.value) : 'nothing yet';
});

// ---- sound: shares the World's saved volume/mute setting ----------------
const SETTINGS_KEY = 'hero-lab-settings';
function readSoundSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { muted: Boolean(saved.muted), volume: Number.isFinite(Number(saved.masterVolume)) ? Number(saved.masterVolume) : GAME_CONFIG.arenaTuning.sound.defaultMasterVolume };
  } catch { return { muted: false, volume: GAME_CONFIG.arenaTuning.sound.defaultMasterVolume }; }
}
const sound = ref(readSoundSettings());
function toggleSound() {
  sound.value = { ...sound.value, muted: !sound.value.muted };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, muted: sound.value.muted }));
  } catch { /* storage blocked: the choice lasts for this visit */ }
}

// ---- first-visit tour -----------------------------------------------------
// Remembered per student in this browser. There is no server-side flag for
// it, so a different browser or cleared storage shows the tour once more.
const INTRO_STEPS = [
  { highlight: 'castle', title: 'Welcome home!', body: 'This is your kingdom. The castle in the middle is your home, and it grows as your town does.' },
  { highlight: 'buildings', title: 'Four buildings', body: 'Garden to the north, Tower to the south, Library to the west and Workshop to the east. Upgrade them with the wood, crystal and herbs you earn to power up your heroes.' },
  { highlight: 'north', title: 'Adventure lies north', body: 'Walk up through the gap in the trees by the sign. Out there you can start a Duel quiz battle or join a Campfire Run with friends.' },
  { highlight: null, title: 'Getting around', body: 'Use WASD or the arrow keys, or click to walk. Press E at a door or beside a hero, and Z for emotes. The Buildings button opens any building from anywhere.' },
];
const introStep = ref(-1);
const introOpen = computed(() => introStep.value >= 0);
const introNext = ref(null);
const introKey = () => `qq-kingdom-intro-seen:${S.me?.id || S.me?.email || 'student'}`;
function maybeStartIntro() {
  let seen = false;
  try { seen = localStorage.getItem(introKey()) === '1'; } catch { /* storage blocked: show it this time */ }
  if (!seen) openIntro();
}
async function openIntro() {
  listOpen.value = false;
  townTarget.value = null;
  introStep.value = 0;
  await nextTick();
  introNext.value?.focus();
}
function closeIntro() {
  introStep.value = -1;
  try { localStorage.setItem(introKey(), '1'); } catch { /* storage blocked */ }
  town.value?.focus();
}
async function nextIntro() {
  if (introStep.value >= INTRO_STEPS.length - 1) { closeIntro(); return; }
  introStep.value += 1;
  await nextTick();
  introNext.value?.focus();
}

// ---- panels and navigation -------------------------------------------------
function onTownInteract(id) {
  if (id === 'duel') { setTab('practice'); return; }
  if (id === 'campfire') { setTab('world'); return; }
  customizeOpen.value = false;
  listOpen.value = false;
  townTarget.value = id;
}
function closePanel() {
  townTarget.value = null;
  town.value?.focus();
}
function onTownKeydown(event) {
  if (event.key !== 'Escape') return;
  if (introOpen.value) { closeIntro(); event.stopPropagation(); }
  else if (townTarget.value) { closePanel(); event.stopPropagation(); }
  else if (listOpen.value) { listOpen.value = false; event.stopPropagation(); }
  else if (customizeOpen.value) { customizeOpen.value = false; event.stopPropagation(); }
}
function openCustomize() {
  townTarget.value = null;
  customizeOpen.value = true;
}

// Telescope: a lens closes over the town, then Hero Summon opens. Looking
// through it never pulls or spends anything.
const lensOn = ref(false);
let lensTimer;
function lookThroughTelescope() {
  townTarget.value = null;
  lensOn.value = true;
  try { sessionStorage.setItem('qq-summon-from-telescope', '1'); } catch { /* the lens just won't open on arrival */ }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  lensTimer = setTimeout(() => setTab('pets'), reduced ? 260 : 760);
}

async function chooseAvatarColor(color) {
  if (colorSaving.value || color === previewColor.value) return;
  const previous = previewColor.value;
  previewColor.value = color;
  colorSaving.value = true;
  try {
    const result = await api('POST', '/api/student/avatar/color', { color });
    S.me.avatarColor = result.avatarColor;
    previewColor.value = result.avatarColor;
    toast('Your new look is saved!');
  } catch (err) {
    previewColor.value = previous;
    toast(err.message, true);
  } finally { colorSaving.value = false; }
}
async function upgrade(p) {
  // the same build key is reused until the server confirms the build
  const r = await (upgraders[p.id] ||= retryablePost('/api/student/kingdom/build', { building: p.id }))();
  // update in place (no remount) so the new building art swaps in on the map
  const grew = r.castleLevel > k.value.castleLevel;
  Object.assign(k.value, { buildings: r.buildings, castleLevel: r.castleLevel, resources: r.resources });
  toast(grew ? `${p.def.name} upgraded - your castle grew!` : `${p.def.name} upgraded!`);
}
</script>

<template>
  <div class="kingdom-screen">
    <div v-if="error" class="scene-note scene-error" role="alert">{{ error }}</div>
    <template v-else-if="loaded && !S.classId">
      <div class="scene-note">
        <span class="scene-kicker">A LITTLE KINGDOM AWAITS</span>
        <h1>Find your party</h1>
        <p>Join a class to explore and build your town.</p>
        <button class="btn primary note-action" type="button" @click="setTab('practice')">Join a class in Practice</button>
      </div>
    </template>
    <template v-else-if="loaded">
      <KingdomTown
        ref="town"
        :buildings="plots"
        :castle-level="k.castleLevel"
        :avatar-color="previewColor"
        :heroes="townHeroes"
        :highlight="introOpen ? INTRO_STEPS[introStep].highlight : null"
        :paused="introOpen || !!townTarget || lensOn"
        :muted="sound.muted"
        :volume="sound.volume"
        @interact="onTownInteract"
      />

      <div class="town-hud town-title-hud">
        <span class="scene-kicker">WELCOME HOME</span>
        <h1 class="town-title"><span>Your Kingdom</span><span class="town-title-dot" aria-hidden="true"> · </span><span>Storybook Town</span></h1>
        <div class="town-title-actions">
          <button class="hud-btn" type="button" :aria-expanded="listOpen" aria-controls="town-building-list" @click="listOpen = !listOpen">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 17V8l7-5 7 5v9h-5v-5H8v5H3Z" /></svg>
            Buildings
          </button>
          <button class="hud-btn hud-icon" type="button" :aria-label="'Replay the kingdom tour'" title="Kingdom tour" @click="openIntro">?</button>
        </div>
      </div>
      <section v-if="listOpen" id="town-building-list" class="town-list" aria-label="Your buildings">
        <button type="button" class="town-list-entry" @click="onTownInteract('castle')">
          <svg class="building-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 42V18h6v5h5v-9h10v9h5v-5h6v24H28V32h-8v10H8Z" fill="#ebddb8" stroke="#57412f" stroke-width="2.4" stroke-linejoin="round" /><path d="M24 14V5l8 3-8 3" fill="#d86f6b" stroke="#57412f" stroke-width="2" stroke-linejoin="round" /></svg>
          <span><b>Castle</b><small>Centre</small></span><em>Lv {{ k.castleLevel }}/{{ BUILDING_LEVEL_CAP }}</em>
        </button>
        <button v-for="p in plots" :key="p.id" type="button" class="town-list-entry" @click="onTownInteract(p.id)">
          <BuildingIcon :building="p.id" />
          <span><b>{{ p.def.name }}</b><small>{{ { garden: 'North', tower: 'South', library: 'West', workshop: 'East' }[p.id] }}</small></span>
          <em :class="{ ready: p.affordable }">Lv {{ p.lvl }}/{{ buildingCap(p.id) }}<template v-if="p.affordable"> · ready</template></em>
        </button>
      </section>
      <div class="town-hud town-level">Castle · {{ k.castleLevel }} / {{ BUILDING_LEVEL_CAP }}</div>

      <div class="town-hud town-actions">
        <button class="hud-btn gold" type="button" :aria-expanded="customizeOpen" @click="customizeOpen = !customizeOpen">Customize</button>
        <button class="hud-btn" type="button" title="Emotes (Z)" @click="town?.openEmotes()">Emote <kbd>Z</kbd></button>
        <button class="hud-btn hud-icon" type="button" :aria-pressed="sound.muted" :aria-label="sound.muted ? 'Turn town sounds on' : 'Mute town sounds'" :title="sound.muted ? 'Sounds off' : 'Sounds on'" @click="toggleSound">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3Z" /><path v-if="!sound.muted" d="M13 7c1.4 1.6 1.4 4.4 0 6M15.5 5c2.6 2.8 2.6 7.2 0 10" fill="none" stroke-width="1.8" stroke-linecap="round" /><path v-else d="m13 7 5 6m0-6-5 6" fill="none" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
      </div>
      <div class="town-hud town-controls-hud">
        <span><kbd>WASD</kbd> walk</span><span><kbd>E</kbd> open / greet</span><span><kbd>Z</kbd> emote</span><span class="north-hint">Battles: walk north ↑</span>
      </div>

      <section v-if="customizeOpen" class="avatar-customize" role="dialog" aria-label="Customize your town avatar">
        <button class="town-modal-close customize-close" type="button" aria-label="Close customization" @click="customizeOpen = false">×</button>
        <span class="town-modal-kicker">A NEW COAT OF COLOR</span>
        <h2>Customize your cat</h2>
        <AvatarPreview :color="previewColor" />
        <div class="avatar-swatches" role="group" aria-label="Avatar color presets">
          <button
            v-for="color in TOWN_AVATAR_PRESET_COLORS"
            :key="color"
            class="avatar-swatch"
            type="button"
            :style="{ '--swatch-color': color }"
            :aria-label="color === TOWN_AVATAR_ORIGINAL_COLOR ? 'Use original sprite color' : `Choose ${color}`"
            :title="color === TOWN_AVATAR_ORIGINAL_COLOR ? 'Original sprite color' : color"
            :aria-pressed="previewColor === color"
            :disabled="colorSaving"
            @click="chooseAvatarColor(color)"
          />
        </div>
        <p class="avatar-save-state" role="status">{{ colorSaving ? 'Saving your look…' : 'Pick a color to wear around town.' }}</p>
      </section>

      <!-- first-visit tour: a card along the bottom, so the town stays visible -->
      <section v-if="introOpen" class="town-intro" role="dialog" aria-labelledby="town-intro-title" aria-describedby="town-intro-body">
        <span class="town-modal-kicker">KINGDOM TOUR · {{ introStep + 1 }} OF {{ INTRO_STEPS.length }}</span>
        <h2 id="town-intro-title">{{ INTRO_STEPS[introStep].title }}</h2>
        <p id="town-intro-body">{{ INTRO_STEPS[introStep].body }}</p>
        <div class="town-intro-actions">
          <span class="intro-dots" aria-hidden="true"><i v-for="(s, i) in INTRO_STEPS" :key="i" :class="{ on: i === introStep }" /></span>
          <button class="btn" type="button" @click="closeIntro">Skip</button>
          <button ref="introNext" class="btn primary" type="button" @click="nextIntro">{{ introStep === INTRO_STEPS.length - 1 ? 'Start exploring' : 'Next' }}</button>
        </div>
      </section>

      <div v-if="townTarget" class="town-modal-shade" @pointerdown.self="closePanel">
        <section class="town-modal" :class="`theme-${townTarget}`" role="dialog" aria-modal="true" aria-labelledby="town-panel-title">
          <header class="panel-head">
            <div class="panel-title">
              <span class="town-modal-kicker">{{ BUILDING_ROLES[townTarget].kicker }}</span>
              <h2 id="town-panel-title">{{ townTarget === 'castle' ? 'Castle' : townPlot?.def.name }}</h2>
              <p class="panel-level">
                <span class="level-pips" aria-hidden="true"><i v-for="n in BUILDING_LEVEL_CAP" :key="n" :class="{ on: n <= (townTarget === 'castle' ? k.castleLevel : townPlot.lvl) }" /></span>
                Level {{ townTarget === 'castle' ? k.castleLevel : townPlot.lvl }} / {{ townTarget === 'castle' ? BUILDING_LEVEL_CAP : buildingCap(townPlot.id) }}
              </p>
            </div>
            <div v-if="townPlot" class="panel-upgrade">
              <AsyncButton v-if="townPlot.cost" class="btn" :class="{ primary: townPlot.affordable }" :disabled="!townPlot.affordable" :run="() => upgrade(townPlot)">
                {{ townPlot.lvl ? 'Upgrade' : 'Build' }} · {{ fmtBundle(townPlot.cost, R) }}
              </AsyncButton>
              <span v-else class="max-badge">Highest level</span>
            </div>
            <button class="town-modal-close" type="button" aria-label="Close" @click="closePanel">×</button>
          </header>

          <template v-if="townPlot">
            <p class="panel-purpose">{{ BUILDING_ROLES[townPlot.id].purpose }}</p>
            <dl class="panel-effect">
              <div><dt>Now</dt><dd>{{ townPlot.lvl ? buildingEffect(townPlot.id, townPlot.lvl) : 'Not built yet' }}</dd></div>
              <div v-if="townPlot.cost"><dt>Next level</dt><dd>{{ buildingEffect(townPlot.id, townPlot.lvl + 1) }}</dd></div>
            </dl>
            <p v-if="townPlot.cost && !townPlot.affordable" class="panel-note">You have {{ haveText }}. Gather more through Practice or by exploring the World.</p>
          </template>

          <!-- role-specific content -->
          <div class="panel-content">
            <template v-if="townTarget === 'garden'">
              <div class="sky-card">
                <svg class="sky-stars" viewBox="0 0 200 60" aria-hidden="true"><path d="M20 40 60 18l40 14 46-20 34 22" fill="none" stroke="#bba6e6" stroke-width="1.5" stroke-dasharray="3 4" /><g fill="#f2ba55"><circle cx="20" cy="40" r="3" /><circle cx="60" cy="18" r="3.5" /><circle cx="100" cy="32" r="2.5" /><circle cx="146" cy="12" r="4" /><circle cx="180" cy="34" r="3" /></g></svg>
                <div>
                  <h3>The stargazing telescope</h3>
                  <p>Look through the telescope to visit Hero Summon. Looking is free; summoning costs coins as usual.</p>
                </div>
                <button class="btn primary" type="button" @click="lookThroughTelescope">Look through the telescope</button>
              </div>
            </template>
            <template v-else-if="townTarget === 'tower'">
              <div class="board-card">
                <div class="board" aria-hidden="true"><i /><i /><i /><i /></div>
                <div>
                  <span class="preview-tag">Preview · coming later</span>
                  <h3>Class request board</h3>
                  <p>One day, classmates will pin what they need and what they can trade here, and the radio will broadcast new requests. Trading is not open yet.</p>
                  <button class="btn" type="button" disabled>Post a request (coming later)</button>
                </div>
              </div>
            </template>
            <template v-else-if="townTarget === 'library'">
              <div class="shelf-card">
                <div class="shelf" role="list" aria-label="Your magic heroes">
                  <span v-for="hero in heroesOfType('magic')" :key="hero.id" class="spine" role="listitem">{{ hero.name }}</span>
                  <span v-if="!heroesOfType('magic').length" class="spine empty" role="listitem">No magic heroes yet</span>
                </div>
                <span class="preview-tag">Preview · coming later</span>
                <h3>Hero archive</h3>
                <p>Hero stories and lore will be shelved here. For now the shelf shows the magic heroes this library powers up.</p>
              </div>
            </template>
            <template v-else-if="townTarget === 'workshop'">
              <div class="gym-card">
                <ul class="gym-roster" aria-label="Your physical heroes">
                  <li v-for="hero in heroesOfType('physical')" :key="hero.id">{{ hero.name }}</li>
                  <li v-if="!heroesOfType('physical').length" class="empty">No physical heroes yet</li>
                </ul>
                <span class="preview-tag">Preview · coming later</span>
                <h3>Training trials</h3>
                <p>Later, heroes will be able to test their skills on the training floor. For now the workshop powers up the physical heroes listed here.</p>
                <button class="btn" type="button" disabled>Start a trial (coming later)</button>
              </div>
            </template>
            <template v-else-if="townTarget === 'castle'">
              <p class="panel-purpose">{{ castleMeaning }}</p>
              <ol class="castle-levels">
                <li :class="{ done: k.castleLevel >= 1 }">Level 1 · Library, Workshop, Garden and Tower all reach level 1.</li>
                <li :class="{ done: k.castleLevel >= 2 }">Level 2 · All four buildings reach level 2.</li>
                <li :class="{ done: k.castleLevel >= 3 }">Level 3 · All four buildings reach level 3.</li>
              </ol>
              <div class="wardrobe-card">
                <div>
                  <span class="preview-tag">Preview · coming later</span>
                  <h3>Royal wardrobe</h3>
                  <p>Hats and accessories will live here. You can already change your cat's colour.</p>
                </div>
                <button class="btn primary" type="button" @click="openCustomize">Change your colour</button>
              </div>
            </template>
          </div>
        </section>
      </div>

      <div v-if="lensOn" class="lens-transition" aria-hidden="true"><div class="lens" /></div>
    </template>
  </div>
</template>

<style scoped>
.kingdom-screen { position: relative; width: 100%; height: 100%; min-height: 100%; overflow: hidden; background: #2f5e3e; }
.scene-note { position: absolute; inset: 50% auto auto 50%; width: min(90vw, 440px); padding: 30px; transform: translate(-50%, -50%); color: #23382f; background: #fbf2d8; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545; text-align: center; }
.scene-note h1 { margin: 8px 0; color: #254937; font: 700 32px/1.1 Georgia, "Palatino Linotype", serif; }
.scene-note p { margin: 0; }
.note-action { margin-top: 16px; }
.scene-error { color: #812e2d; }
/* storybook buttons: campfire-gold main action, parchment secondary */
.kingdom-screen .btn { min-height: 38px; padding: 7px 14px; color: #23382f; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px 9px 7px 10px; box-shadow: 0 3px 0 #7a6545; font: 800 .9rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; }
.kingdom-screen .btn.primary { color: #23382f; background: #f2ba55; border-color: #23382f; }
.kingdom-screen .btn:hover:not(:disabled), .kingdom-screen .btn:focus-visible { outline: 3px solid #8062a9; outline-offset: 2px; }
.kingdom-screen .btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.kingdom-screen .btn:disabled { color: #6b6450; background: #ece3cc; border-style: dashed; box-shadow: none; cursor: not-allowed; opacity: 1; }
.scene-kicker { display: block; color: #778054; font: 800 .66rem ui-monospace, monospace; letter-spacing: .11em; }
.town-hud { position: absolute; z-index: 2; }
.town-title-hud { top: 18px; left: 18px; padding: 11px 14px 12px; color: #fff8e4; background: rgb(35 56 47 / 90%); border: 2px solid #23382f; border-radius: 12px 10px 14px 9px; box-shadow: 0 4px 0 rgb(35 56 47 / 45%); }
.town-title-hud .scene-kicker { color: #f2ba55; }
.town-title { margin: 3px 0 9px; color: #fff8e4; font: 700 22px/1.15 Georgia, "Palatino Linotype", serif; }
.town-title-dot { color: #f2ba55; }
.town-title-actions { display: flex; gap: 6px; }
.hud-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 6px 12px; color: #23382f; background: #fbf2d8; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font: 800 .84rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; }
.hud-btn svg { width: 17px; height: 17px; fill: #23382f; stroke: #23382f; }
.hud-btn.gold { background: #f2ba55; }
.hud-btn kbd { padding: 0 5px; background: #fff8e4; border: 1.5px solid #23382f; border-radius: 4px; font: 800 .66rem/1.5 ui-monospace, monospace; }
.hud-icon { justify-content: center; min-width: 36px; padding: 6px; }
.hud-btn:hover, .hud-btn:focus-visible { outline: 3px solid #f2ba55; outline-offset: 2px; }
.hud-btn.gold:hover, .hud-btn.gold:focus-visible { outline-color: #fff8e4; }
.hud-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.town-list { position: absolute; z-index: 3; top: 128px; left: 18px; display: grid; gap: 6px; width: min(270px, calc(100vw - 36px)); padding: 9px; background: #fbf2d8; border: 2px solid #23382f; border-radius: 10px; box-shadow: 0 4px 0 #7a6545; }
.town-list-entry { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 10px; padding: 6px 9px; color: #23382f; background: #fff8e4; border: 1.5px solid #c5b58e; border-radius: 7px; text-align: left; cursor: pointer; }
.town-list-entry :deep(.building-icon), .town-list-entry .building-icon { width: 34px; height: 34px; }
.town-list-entry b { display: block; font: 700 1rem Georgia, "Palatino Linotype", serif; }
.town-list-entry small { color: #5f6d58; font: 800 .64rem ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
.town-list-entry em { color: #5f6d58; font: 800 .72rem ui-monospace, monospace; font-style: normal; white-space: nowrap; }
.town-list-entry em.ready { color: #254937; }
.town-list-entry:hover, .town-list-entry:focus-visible { border-color: #23382f; outline: 2px solid #f2ba55; outline-offset: 1px; }
.town-level { top: 18px; right: 18px; padding: 9px 14px; color: #23382f; background: #f2ba55; border: 3px solid #23382f; border-radius: 9px; box-shadow: 0 4px 0 #7a6545; font-weight: 900; pointer-events: none; }
.town-actions { left: 18px; bottom: 16px; display: flex; gap: 8px; }
.town-controls-hud { right: 18px; bottom: 16px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px; max-width: min(560px, 60vw); padding: 9px 14px; color: #fff8e4; background: rgb(35 56 47 / 90%); border-radius: 9px; font: 700 .8rem/1.3 Nunito, Trebuchet MS, sans-serif; pointer-events: none; }
.town-controls-hud kbd { padding: 1px 5px; color: #23382f; background: #f2ba55; border: 1px solid #23382f; border-radius: 4px; font: 800 .68rem ui-monospace, monospace; }
.north-hint { color: #f2ba55; }
.avatar-customize { position: absolute; z-index: 4; left: 18px; bottom: 70px; width: min(360px, calc(100vw - 32px)); max-height: calc(100% - 100px); overflow-y: auto; padding: 22px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 3px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 6px 0 #7a6545, 0 14px 30px rgb(16 33 23 / 28%); }
.avatar-customize h2 { margin: 4px 38px 0 0; color: #254937; font: 700 22px/1.1 Georgia, "Palatino Linotype", serif; }
.customize-close { top: 10px; right: 10px; }
.avatar-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; }
.avatar-swatch { width: 38px; height: 38px; justify-self: center; padding: 0; background: var(--swatch-color); border: 2px solid #23382f; border-radius: 50% 45% 48% 42%; box-shadow: 0 2px 0 #7a6545; cursor: pointer; }
.avatar-swatch[aria-pressed="true"] { outline: 3px solid #8062a9; outline-offset: 2px; transform: scale(1.08); }
.avatar-swatch:disabled { opacity: .72; cursor: wait; }
.avatar-swatch:focus-visible { outline: 3px solid #8062a9; outline-offset: 3px; }
.avatar-save-state { min-height: 1.3em; margin: 12px 0 0 !important; color: #52664b; font-size: .82rem; text-align: center; }

.town-intro { position: absolute; z-index: 5; left: 18px; bottom: 70px; width: min(430px, calc(100vw - 32px)); padding: 18px 20px 16px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 3px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 6px 0 #7a6545, 0 14px 30px rgb(16 33 23 / 30%); }
.town-intro h2 { margin: 4px 0 6px; color: #254937; font: 700 24px/1.15 Georgia, "Palatino Linotype", serif; }
.town-intro p { margin: 0 0 14px; line-height: 1.45; }
.town-intro-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.intro-dots { display: flex; gap: 6px; margin-right: auto; }
.intro-dots i { width: 9px; height: 9px; background: #e2d3ad; border: 1.5px solid #23382f; border-radius: 50%; }
.intro-dots i.on { background: #f2ba55; }

.town-modal-shade { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(22 36 27 / 66%); }
.town-modal { position: relative; width: min(100%, 640px); max-height: calc(100vh - 40px); overflow-y: auto; padding: 22px 24px 24px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545, 0 18px 48px rgb(0 0 0 / 30%); }
.panel-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px 16px; padding-right: 44px; padding-bottom: 14px; border-bottom: 2px dashed #c5b58e; }
.panel-title { flex: 1 1 220px; }
.panel-title h2 { margin: 4px 0 4px; color: #254937; font: 700 30px/1.05 Georgia, "Palatino Linotype", serif; }
.panel-level { display: flex; align-items: center; gap: 8px; margin: 0; color: #4a3d63; font-weight: 900; }
.level-pips { display: inline-flex; gap: 4px; }
.level-pips i { width: 14px; height: 14px; background: #fff8e4; border: 2px solid #23382f; border-radius: 3px 4px 3px 5px; }
.level-pips i.on { background: #f2ba55; }
.panel-upgrade { display: flex; align-items: center; align-self: center; }
.panel-upgrade :deep(.btn) { white-space: nowrap; }
.max-badge { padding: 6px 10px; color: #254937; background: #dcebc8; border: 2px solid #254937; border-radius: 8px; font-weight: 900; }
.town-modal-kicker { color: #5f6d58; font: 800 .68rem ui-monospace, monospace; letter-spacing: .08em; }
.town-modal-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; color: #23382f; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font-size: 24px; line-height: 1; cursor: pointer; }
.town-modal-close:focus-visible, .town-modal-close:hover { outline: 3px solid #f2ba55; outline-offset: 2px; }
.panel-purpose { margin: 14px 0 10px; line-height: 1.45; }
.panel-effect { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; margin: 0 0 10px; }
.panel-effect div { padding: 9px 12px; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px 10px 7px 9px; }
.panel-effect dt { color: #5f6d58; font: 800 .64rem ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
.panel-effect dd { margin: 2px 0 0; font-weight: 800; }
.panel-note { margin: 0 0 8px; color: #5f4a2e; font-size: .88rem; }
.panel-content { margin-top: 14px; }
.panel-content h3 { margin: 2px 0 4px; font: 700 19px/1.2 Georgia, "Palatino Linotype", serif; }
.panel-content p { margin: 0 0 10px; line-height: 1.45; }
.preview-tag { display: inline-block; padding: 2px 8px; color: #4a3d63; background: #ece3f8; border: 1.5px dashed #8062a9; border-radius: 999px; font: 800 .64rem ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; }
.sky-card { display: grid; gap: 10px; padding: 16px; color: #fff8e4; background: linear-gradient(160deg, #1d1f4a, #3a2e6b 70%, #5a4588); border: 3px solid #23382f; border-radius: 12px 10px 14px 9px; }
.sky-card h3 { color: #fff1b8; }
.sky-card p { color: #ece6ff; }
.sky-stars { width: 100%; height: 48px; }
.sky-card .btn { justify-self: start; }
.board-card { display: grid; grid-template-columns: 120px 1fr; gap: 14px; align-items: start; padding: 14px; background: #f3e4c4; border: 3px solid #23382f; border-radius: 10px 12px 9px 11px; }
.board { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px; background: #c9a66b; border: 3px solid #6b4128; border-radius: 4px; }
.board i { height: 34px; background: #fff8e4; border: 1.5px solid #23382f; border-radius: 2px; }
.board i:nth-child(2) { background: #fde3b0; transform: rotate(3deg); }
.board i:nth-child(3) { background: #e9ddfb; transform: rotate(-2deg); }
.board i:nth-child(4) { background: #ddefc9; }
.shelf-card, .gym-card { padding: 14px; border: 3px solid #23382f; border-radius: 10px 12px 9px 11px; }
.shelf-card { background: linear-gradient(180deg, #e5eef6, #d6e6f0); }
.shelf { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px; min-height: 92px; margin-bottom: 10px; padding: 8px 10px 0; background: #5c4a6e; border: 3px solid #23382f; border-bottom-width: 8px; border-radius: 6px; }
.spine { display: grid; place-items: center; width: 34px; height: 80px; padding: 4px 0; color: #23382f; background: #f2ba55; border: 2px solid #23382f; border-bottom: 0; border-radius: 3px 3px 0 0; font: 800 .66rem Nunito, sans-serif; writing-mode: vertical-rl; transform: rotate(180deg); }
.spine:nth-child(3n+2) { background: #6db8cf; }
.spine:nth-child(3n) { background: #d86f6b; color: #fff8e4; }
.spine.empty { width: auto; height: auto; padding: 8px 10px; color: #fff8e4; background: none; border: 0; writing-mode: horizontal-tb; transform: none; }
.gym-card { background: linear-gradient(180deg, #fbe2cc, #f5d2b4); }
.gym-roster { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; }
.gym-roster li { padding: 5px 11px; background: #fff8e4; border: 2px solid #23382f; border-radius: 999px 999px 999px 6px; font-weight: 800; }
.gym-roster li.empty { border-style: dashed; color: #5f4a2e; }
.castle-levels { display: grid; gap: 8px; margin: 0 0 14px; padding-left: 22px; line-height: 1.4; }
.castle-levels li.done { color: #254937; font-weight: 800; }
.wardrobe-card { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; background: #f8e3e1; border: 3px solid #23382f; border-radius: 10px 12px 9px 11px; }
.wardrobe-card p { margin: 0; }
.theme-garden .panel-head { border-bottom-color: #8062a9; }
.theme-tower .panel-level { color: #4a3d63; }

.lens-transition { position: fixed; z-index: 2000; inset: 0; overflow: hidden; pointer-events: none; }
.lens { position: absolute; left: 50%; top: 50%; width: 160vmax; height: 160vmax; border: 10px solid #c8963e; border-radius: 50%; box-shadow: 0 0 0 4px #23382f, 0 0 0 200vmax #17123a; transform: translate(-50%, -50%) scale(1); animation: lens-close .76s cubic-bezier(.6, 0, .4, 1) forwards; }
@keyframes lens-close { to { transform: translate(-50%, -50%) scale(0); } }
@media (prefers-reduced-motion: reduce) { .lens { animation-duration: .26s; } }

@media (max-width: 760px) {
  .town-controls-hud { display: none; }
}
@media (max-width: 600px) {
  .town-title-hud { top: 10px; left: 10px; right: auto; padding: 8px 10px; }
  .town-title { font-size: 17px; margin-bottom: 7px; }
  .town-title span:last-child { display: block; font-size: 14px; }
  .town-title-dot { display: none; }
  .town-list { top: 118px; left: 10px; }
  .town-level { top: 10px; right: 10px; padding: 6px 9px; font-size: .78rem; }
  .town-actions { left: 10px; right: 10px; bottom: 10px; flex-wrap: wrap; }
  .avatar-customize { bottom: 62px; left: 10px; padding: 18px; }
  .town-intro { bottom: 62px; padding: 14px 16px; }
  .town-intro h2 { font-size: 20px; }
  .town-modal { padding: 18px 16px 20px; }
  .panel-title h2 { font-size: 24px; }
  .board-card { grid-template-columns: 1fr; }
}
</style>
