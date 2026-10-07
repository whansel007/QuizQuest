<script setup>
// A button whose click runs an async function: disabled while it runs,
// errors shown as a toast.   <AsyncButton class="btn" :run="save">Save</AsyncButton>
import { ref } from 'vue';
import { toast } from '../ui.js';
const props = defineProps({ run: { type: Function, required: true }, disabled: Boolean });
const busy = ref(false);
async function click(e) {
  busy.value = true;
  try {
    await props.run(e);
  } catch (err) {
    if (!err.shown) toast(err.message, true);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button type="button" :disabled="busy || disabled" @click="click"><slot /></button>
</template>
