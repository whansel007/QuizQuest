<script setup>
import { computed } from 'vue';

const props = defineProps({ text: { type: String, default: '' } });

// Render the code notation used in question stems without interpreting any
// question content as HTML.
const parts = computed(() => {
  const output = [];
  const pattern = /```([\w+-]*)[ \t]*\n?([\s\S]*?)```|`([^`\n]+)`/g;
  let cursor = 0;
  for (const match of props.text.matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) output.push({ type: 'text', value: props.text.slice(cursor, start) });
    if (match[2] !== undefined) {
      output.push({ type: 'block', value: match[2].replace(/^\n|\n$/g, '') });
    } else {
      output.push({ type: 'inline', value: match[3] });
    }
    cursor = start + match[0].length;
  }
  if (cursor < props.text.length) output.push({ type: 'text', value: props.text.slice(cursor) });
  return output;
});
</script>

<template>
  <div class="formatted-text">
    <template v-for="(part, index) in parts" :key="index">
      <pre v-if="part.type === 'block'" class="code-block"><code>{{ part.value }}</code></pre>
      <code v-else-if="part.type === 'inline'" class="inline-code">{{ part.value }}</code>
      <span v-else>{{ part.value }}</span>
    </template>
  </div>
</template>

<style scoped>
.formatted-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.inline-code, .code-block {
  color: #20382c;
  background: #e7e9d6;
  border: 1px solid #aab38e;
  border-radius: 6px;
  font: 500 .86em/1.5 ui-monospace, "Cascadia Code", Consolas, monospace;
}
.inline-code { padding: .08em .32em; }
.code-block { display: block; max-width: 100%; margin: .65em 0; padding: .75em .9em; overflow-x: auto; white-space: pre; }
</style>
