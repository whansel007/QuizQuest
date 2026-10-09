<script setup>
// ============================================================
// The kingdom drawn as an isometric pile of blocks (SVG).
// New blocks drop in layer by layer when something is built, and
// `preview` shows the next upgrade of a building as ghost blocks.
// ============================================================
import { computed, reactive, watch, onUnmounted } from 'vue';
import { MAP, PLOTS, PATHS, S, C, blocks, render, iso, flat, shade } from './voxels.js';

const props = defineProps({
  buildings: { type: Object, required: true }, // { library: 0..3, ... }
  castleLevel: { type: Number, required: true },
  preview: { type: String, default: null }, // building id whose next level is shown as ghosts
  label: { type: String, required: true },
});

const levels = computed(() => ({ ...props.buildings, castle: props.castleLevel, scenery: 0 }));
const current = computed(() => Object.entries(levels.value).flatMap(([id, lvl]) => blocks(id, lvl)));

// --- which blocks are new since the last render (key -> drop delay in ms)
const fresh = reactive(new Map());
const known = new Map();
const ORDER = ['scenery', 'castle', 'tower', 'library', 'workshop', 'garden'];
let clearTimer = null;
watch(
  current,
  (list) => {
    const added = list.filter((v) => known.get(v.key) !== v.c);
    known.clear();
    for (const v of list) known.set(v.key, v.c);
    if (!added.length) return;
    const first = known.size === added.length; // the whole kingdom: stagger buildings
    const base = Object.fromEntries(ORDER.map((id) => [id, Math.min(...added.filter((v) => v.id === id).map((v) => v.z))]));
    let last = 0;
    for (const v of added) {
      const d = (first ? ORDER.indexOf(v.id) * 90 : 0) + (v.z - base[v.id]) * 70 + ((v.x + v.y) % 3) * 12;
      fresh.set(v.key, d);
      last = Math.max(last, d);
    }
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => fresh.clear(), last + 700);
  },
  { immediate: true },
);
onUnmounted(() => clearTimeout(clearTimer));

// --- ghost blocks for the previewed upgrade
const ghosts = computed(() => {
  const id = props.preview;
  if (!id) return [];
  const have = new Map(current.value.map((v) => [v.key, v.c]));
  const next = { ...props.buildings, [id]: props.buildings[id] + 1 };
  const castle = Math.min(...Object.values(next)); // this build may also grow the castle
  return [...blocks(id, next[id]), ...(castle > props.castleLevel ? blocks('castle', castle) : [])]
    .filter((v) => have.get(v.key) !== v.c)
    .map((v) => ({ ...v, key: 'ghost:' + v.key, ghost: true }));
});

const scene = computed(() => {
  // a block still dropping in doesn't hide its neighbours yet
  const solid = new Set(current.value.filter((v) => !fresh.has(v.key)).map((v) => `${v.x},${v.y},${v.z}`));
  return render([...current.value, ...ghosts.value], solid);
});

// --- ground slab, plots and the path ring around the castle
const P = (x, y, z) => iso(x, y, z).map((n) => +n.toFixed(2)).join(',');
const ground = {
  top: flat(0, 0, MAP, MAP),
  left: [P(0, MAP, -1), P(MAP, MAP, -1), P(MAP, MAP, 0), P(0, MAP, 0)].join(' '),
  right: [P(MAP, 0, -1), P(MAP, MAP, -1), P(MAP, MAP, 0), P(MAP, 0, 0)].join(' '),
};
const paths = PATHS.map((p) => flat(...p));
const plots = Object.entries(PLOTS).filter(([id]) => id !== 'castle' && id !== 'scenery').map(([id, p]) => ({ id, points: flat(p.x, p.y, p.size, p.size) }));
const view = `${-MAP * Math.cos(Math.PI / 6) * S - 8} ${-5 * S} ${2 * MAP * Math.cos(Math.PI / 6) * S + 16} ${(MAP + 6) * S + 8}`;
</script>

<template>
  <svg class="iso" :viewBox="view" role="img" :aria-label="label">
    <polygon :points="ground.left" :fill="shade(C.dirt, 0.9)" />
    <polygon :points="ground.right" :fill="shade(C.dirt, 0.72)" />
    <polygon :points="ground.top" :fill="C.grass" />
    <polygon v-for="(p, i) in paths" :key="i" :points="p" :fill="C.path" />
    <polygon v-for="p in plots" :key="p.id" :points="p.points" :fill="C.plot" :class="['plot-tile', { previewing: preview === p.id }]" />
    <g v-for="v in scene" :key="v.key" class="vx" :class="{ drop: fresh.has(v.key), ghost: v.ghost }" :style="fresh.has(v.key) ? { animationDelay: fresh.get(v.key) + 'ms' } : null">
      <polygon v-for="(f, i) in v.faces" :key="i" :points="f.points" :fill="f.fill" :stroke="v.ghost ? null : f.fill" />
    </g>
  </svg>
</template>
