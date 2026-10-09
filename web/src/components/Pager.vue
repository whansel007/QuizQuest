<script setup>
// ============================================================
// Page controls for a usePaged() list: "Showing 11-20 of 34",
// Previous / page numbers / Next. Hidden when everything fits on one page.
// Long page runs collapse to 1 … 4 5 6 … 12.
// ============================================================
import { computed } from 'vue';

const props = defineProps({
  paged: { type: Object, required: true },
  label: { type: String, required: true }, // e.g. "Commonly missed questions pages"
  noun: { type: String, default: 'items' },
});

const numbers = computed(() => {
  const { page, pages } = props.paged;
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push(null); // gap
    out.push(p);
    prev = p;
  }
  return out;
});
</script>

<template>
  <nav v-if="paged.pages > 1" class="pager no-print" :aria-label="label">
    <span class="small muted pager-count">Showing {{ paged.from }}–{{ paged.to }} of {{ paged.total }} {{ noun }}</span>
    <button class="btn small" :disabled="paged.page === 1" aria-label="Previous page" @click="paged.go(paged.page - 1)">‹ Prev</button>
    <template v-for="(p, i) in numbers" :key="p ?? 'gap' + i">
      <span v-if="p === null" class="small muted" aria-hidden="true">…</span>
      <button v-else class="btn small" :aria-current="p === paged.page ? 'page' : null" :aria-label="`Page ${p}`" @click="paged.go(p)">{{ p }}</button>
    </template>
    <button class="btn small" :disabled="paged.page === paged.pages" aria-label="Next page" @click="paged.go(paged.page + 1)">Next ›</button>
  </nav>
</template>
