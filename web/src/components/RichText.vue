<script setup>
import { computed } from 'vue';
import { richBlocks, inlineText } from './rich-text.mjs';
const props = defineProps({ text: { type: [String, Number], default: '' } });
const blocks = computed(() => richBlocks(props.text));
</script>
<template>
  <div class="rich-text">
    <template v-for="(block, i) in blocks" :key="i">
      <pre v-if="block.tag === 'pre'"><code :data-language="block.language">{{ block.text }}</code></pre>
      <component :is="block.tag" v-else-if="block.items">
        <li v-for="(item, k) in block.items" :key="k"><component :is="part.tag" v-for="(part,j) in inlineText(item)" :key="j">{{ part.text }}</component></li>
      </component>
      <component :is="block.tag" v-else><component :is="part.tag" v-for="(part,j) in inlineText(block.text)" :key="j">{{ part.text }}</component></component>
    </template>
  </div>
</template>
<style scoped>
.rich-text { min-width:0; overflow-wrap:anywhere; line-height:1.6; }
.rich-text :deep(p) { margin:0 0 .4em; white-space:pre-wrap; }
.rich-text :deep(p:last-child) { margin-bottom:0; }
.rich-text :deep(pre) { max-width:100%; overflow-x:auto; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--bg); white-space:pre; }
.rich-text :deep(pre code) { padding:0; background:none; border:0; white-space:pre; }
.rich-text :deep(ul), .rich-text :deep(ol) { padding-left:24px; margin:6px 0; }
.rich-text :deep(code) { overflow-wrap:anywhere; }
</style>
