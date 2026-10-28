 <script setup>
// ============================================================
// STUDENT: walkable kingdom town
// ============================================================
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { S, api, retryablePost } from '../api.js';
import { fmtBundle, toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import { loadHome } from './home.js';
import KingdomTown from './KingdomTown.vue';
import AvatarPreview from './AvatarPreview.vue';
import {
  BUILDING_LEVEL_CAP, TOWN_AVATAR_DEFAULT_COLOR, TOWN_AVATAR_ORIGINAL_COLOR, TOWN_AVATAR_PRESET_COLORS, TOWN_MAX_HEROES,
} from '../../../config/tuning.js';

const error = ref('');
const loaded = ref(false);
const k = ref(null);
const homeData = ref(null);
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
  } catch (err) {
    if (alive) error.value = err.message;
  }
});
onUnmounted(() => {
  alive = false;
  window.removeEventListener('keydown', onTownKeydown);
});

const R = computed(() => k.value.catalog.resources);
const townHeroes = computed(() => {
  const home = homeData.value;
  if (!home) return [];
  const owned = new Set(home.inventory.heroes);
  return home.catalog.heroes.filter((hero) => owned.has(hero.id)).slice(0, TOWN_MAX_HEROES);
});
const upgraders = {};
const townTarget = ref(null);
const customizeOpen = ref(false);
const journalOpen = ref(false);
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
function onTownInteract(id) { customizeOpen.value = false; journalOpen.value = false; townTarget.value = id; }
function onTownKeydown(event) {
  if (event.key !== 'Escape') return;
  if (townTarget.value) { townTarget.value = null; event.stopPropagation(); }
  else if (customizeOpen.value) { customizeOpen.value = false; event.stopPropagation(); }
  else if (journalOpen.value) { journalOpen.value = false; event.stopPropagation(); }
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
  // update in place (no remount) so the new blocks drop into the scene
  const grew = r.castleLevel > k.value.castleLevel;
  Object.assign(k.value, { buildings: r.buildings, castleLevel: r.castleLevel, resources: r.resources });
  toast(grew ? `${p.def.name} upgraded - your castle grew!` : `${p.def.name} upgraded!`);
}
</script>

<template>
  <div class="kingdom-screen">
    <div v-if="error" class="scene-note scene-error">{{ error }}</div>
    <template v-else-if="loaded && !S.classId">
      <div class="scene-note">
        <span class="scene-kicker">A LITTLE KINGDOM AWAITS</span>
        <h1>Find your party</h1>
        <p>Join a class to explore and build your town.</p>
      </div>
    </template>
    <template v-else-if="loaded">
      <KingdomTown :buildings="plots" :castle-level="k.castleLevel" :avatar-color="previewColor" :heroes="townHeroes" @interact="onTownInteract" />
      <div class="town-hud town-title-hud" aria-label="Kingdom town">
        <span class="scene-kicker">YOUR KINGDOM</span>
        <strong>Storybook Town</strong>
      </div>
      <button class="town-hud town-journal-trigger" type="button" :aria-expanded="journalOpen" @click="journalOpen = !journalOpen">Building guide</button>
      <section v-if="journalOpen" class="town-journal" aria-label="Building shortcuts">
        <button v-for="p in plots" :key="p.id" type="button" class="town-journal-entry" @click="onTownInteract(p.id)">
          <span>{{ p.def.emoji }} {{ p.def.name }}</span><small>Lv {{ p.lvl }}/{{ BUILDING_LEVEL_CAP }}</small>
        </button>
      </section>
      <div class="town-hud town-level">Castle · {{ k.castleLevel }} / {{ BUILDING_LEVEL_CAP }}</div>
      <div class="town-hud town-controls-hud">WASD / arrows to wander <span>·</span> click to stroll <span>·</span> <kbd>E</kbd> at a doorway</div>
      <button class="town-hud customize-trigger" type="button" :aria-expanded="customizeOpen" @click="customizeOpen = !customizeOpen">✦ Customize</button>
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

      <div v-if="townTarget" class="town-modal-shade" @pointerdown.self="townTarget = null">
        <section class="town-modal" role="dialog" aria-modal="true" :aria-labelledby="townTarget === 'castle' ? 'town-castle-title' : 'town-upgrade-title'">
          <button class="town-modal-close" type="button" aria-label="Close" @click="townTarget = null">×</button>
          <template v-if="townTarget === 'castle'">
            <span class="town-modal-kicker">THE HEART OF TOWN</span>
            <h2 id="town-castle-title">Castle · Level {{ k.castleLevel }}/3</h2>
            <p>{{ castleMeaning }}</p>
            <ol class="castle-levels">
              <li>Level 1 · Library, Workshop, Garden and Tower all reach level 1.</li>
              <li>Level 2 · All four buildings reach level 2.</li>
              <li>Level 3 · All four buildings reach level 3.</li>
            </ol>
          </template>
          <template v-else-if="townPlot">
            <span class="town-modal-kicker">BUILDING UPGRADES</span>
            <h2 id="town-upgrade-title">{{ townPlot.def.name }}</h2>
            <p class="town-modal-level">Level {{ townPlot.lvl }} / {{ BUILDING_LEVEL_CAP }}</p>
            <p v-if="townPlot.cost">{{ townPlot.lvl ? 'Next upgrade' : 'First build' }} · {{ fmtBundle(townPlot.cost, R) }}</p>
            <p v-else>This building has reached its highest level.</p>
            <AsyncButton v-if="townPlot.cost" class="btn small" :class="{ primary: townPlot.affordable }" :disabled="!townPlot.affordable" :run="() => upgrade(townPlot)">
              {{ townPlot.lvl ? 'Upgrade' : 'Build' }}: {{ fmtBundle(townPlot.cost, R) }}
            </AsyncButton>
            <p v-if="townPlot.cost && !townPlot.affordable" class="small muted">Gather what you need through Practice or by exploring the World.</p>
          </template>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kingdom-screen { position: relative; width: 100%; height: 100%; min-height: 100%; overflow: hidden; background: #32533e; }
.scene-note { position: absolute; inset: 50% auto auto 50%; width: min(90vw, 440px); padding: 30px; transform: translate(-50%, -50%); color: #23382f; background: #fbf2d8; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545; text-align: center; }
.scene-note h1 { margin: 8px 0; color: #254937; font: 700 32px/1.1 Georgia, "Palatino Linotype", serif; }
.scene-note p { margin: 0; }
.scene-error { color: #812e2d; }
.scene-kicker { display: block; color: #778054; font: 800 .66rem ui-monospace, monospace; letter-spacing: .11em; }
.town-hud { position: absolute; z-index: 2; color: #fff8e4; background: rgb(35 56 47 / 88%); box-shadow: 0 4px 0 rgb(35 56 47 / 45%); pointer-events: none; }
.town-title-hud { top: 22px; left: 22px; padding: 12px 16px; border-radius: 12px 10px 14px 9px; }
.town-title-hud .scene-kicker { color: #f2ba55; }
.town-title-hud strong { display: block; margin-top: 3px; font: 700 23px/1.1 Georgia, "Palatino Linotype", serif; }
.town-journal-trigger { top: 98px; left: 22px; padding: 8px 12px; color: #23382f; background: #fbf2d8; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font: 800 .8rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; pointer-events: auto; }
.town-journal { position: absolute; z-index: 3; top: 142px; left: 22px; display: grid; gap: 5px; width: min(230px, calc(100vw - 44px)); padding: 9px; background: #fbf2d8; border: 2px solid #23382f; border-radius: 9px; box-shadow: 0 4px 0 #7a6545; }
.town-journal-entry { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 9px; color: #23382f; background: #fff8e4; border: 1px solid #c5b58e; border-radius: 6px; text-align: left; cursor: pointer; }
.town-journal-entry:hover, .town-journal-entry:focus-visible { outline: 2px solid #8062a9; outline-offset: 1px; }
.town-journal-entry small { color: #6d7653; font: 700 .7rem ui-monospace, monospace; white-space: nowrap; }
.town-level { top: 22px; right: 22px; padding: 9px 14px; color: #23382f; background: #f2ba55; border: 3px solid #23382f; border-radius: 9px; box-shadow: 0 4px 0 #7a6545; font-weight: 900; }
.town-controls-hud { right: 20px; bottom: 18px; padding: 9px 14px; border-radius: 9px; color: #fff8e4; font: 600 .82rem/1.2 Trebuchet MS, sans-serif; }
.town-controls-hud span { color: #f2ba55; padding: 0 4px; }
.town-controls-hud kbd { padding: 2px 6px; color: #23382f; background: #f2ba55; border: 1px solid #23382f; border-radius: 4px; font: 800 .7rem ui-monospace, monospace; }
.customize-trigger { left: 20px; bottom: 18px; padding: 10px 16px; color: #23382f; background: #f2ba55; border: 3px solid #23382f; border-radius: 9px; box-shadow: 0 4px 0 #7a6545; font: 800 .9rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; pointer-events: auto; }
.customize-trigger:hover, .customize-trigger:focus-visible { outline: 3px solid #fff8e4; outline-offset: 3px; }
.avatar-customize { position: absolute; z-index: 4; left: 20px; bottom: 76px; width: min(360px, calc(100vw - 32px)); max-height: calc(100% - 100px); overflow-y: auto; padding: 22px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 3px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 6px 0 #7a6545, 0 14px 30px rgb(16 33 23 / 28%); }
.avatar-customize h2 { margin: 4px 38px 0 0; color: #254937; font: 700 22px/1.1 Georgia, "Palatino Linotype", serif; }
.customize-close { top: 10px; right: 10px; }
.avatar-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; }
.avatar-swatch { width: 38px; height: 38px; justify-self: center; padding: 0; background: var(--swatch-color); border: 2px solid #23382f; border-radius: 50% 45% 48% 42%; box-shadow: 0 2px 0 #7a6545; cursor: pointer; }
.avatar-swatch[aria-pressed="true"] { outline: 3px solid #8062a9; outline-offset: 2px; transform: scale(1.08); }
.avatar-swatch:disabled { opacity: .72; cursor: wait; }
.avatar-swatch:focus-visible { outline: 3px solid #8062a9; outline-offset: 3px; }
.avatar-save-state { min-height: 1.3em; margin: 12px 0 0 !important; color: #52664b; font-size: .82rem; text-align: center; }
.town-modal-shade { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(22 36 27 / 66%); }
.town-modal { position: relative; width: min(100%, 520px); padding: 28px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545, 0 18px 48px rgb(0 0 0 / 30%); }
.town-modal h2 { margin: 6px 36px 8px 0; color: #254937; font: 700 28px/1.1 Georgia, "Palatino Linotype", serif; }
.town-modal p { line-height: 1.45; }
.town-modal-kicker { color: #778054; font: 800 .68rem ui-monospace, monospace; letter-spacing: .08em; }
.town-modal-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; color: #23382f; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font-size: 24px; line-height: 1; cursor: pointer; }
.town-modal-close:focus-visible, .town-modal-close:hover { outline: 3px solid #f2ba55; outline-offset: 2px; }
.town-modal-level { color: #8062a9; font-weight: 900; }
.castle-levels { display: grid; gap: 8px; padding-left: 22px; line-height: 1.4; }
@media (max-width: 600px) { .town-title-hud { top: 12px; left: 12px; padding: 8px 11px; } .town-title-hud strong { font-size: 18px; } .town-journal-trigger { top: 82px; left: 12px; } .town-journal { top: 124px; left: 12px; } .town-level { top: 12px; right: 12px; padding: 7px 9px; font-size: .78rem; } .town-controls-hud { right: 10px; bottom: 10px; left: 10px; padding: 8px; text-align: center; font-size: .72rem; } .customize-trigger { bottom: 55px; left: 10px; padding: 8px 11px; font-size: .8rem; } .avatar-customize { bottom: 110px; left: 10px; padding: 18px; } .town-modal { padding: 22px; } }
</style>
