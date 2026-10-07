<script setup>
// A labelled form control. The label is tied to the control via for/id so
// screen readers (and getByLabel in the browser tests) find it:
//   <Field label="Length" v-slot="{ id }"><select :id="id">...</select></Field>
import { useId } from 'vue';
defineProps({ label: { type: String, required: true } });
const id = useId();
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <slot :id="id" />
  </div>
</template>
