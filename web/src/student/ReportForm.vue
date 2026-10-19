<script setup>
// "Report a problem with this question" - goes to the professor, who sees
// the reason without the student's identity.
import { ref, useId, onUnmounted } from 'vue';
import { api } from '../api.js';
import categories from '../../../src/quiz/report-categories.json';

const props = defineProps({ questionId: { type: String, required: true }, attemptId: String });
const emit = defineEmits(['sent', 'cancel']);
const reason = ref('');
const category = ref('answer');
const busy = ref(false);
const error = ref('');
const id = useId();
let alive = true;
onUnmounted(() => { alive = false; });
async function send() {
  if (busy.value) return;
  error.value = '';
  if (!reason.value.trim()) { error.value = 'Please describe the problem.'; return; }
  busy.value = true;
  try {
    const r = await api('POST', `/api/student/questions/${props.questionId}/report`, {
      reason: reason.value.trim(), category: category.value, attemptId: props.attemptId,
    });
    if (alive) emit('sent', r.already ? 'You already have an open report for this question version. Check My Progress for its status.' : 'Report sent. You can follow its status in My Progress.');
  } catch (err) {
    // Keep the typed reason on failure so the student can retry safely.
    if (alive) error.value = err.message;
  } finally {
    if (alive) busy.value = false;
  }
}
</script>

<template>
  <form class="panel" style="margin-top: 10px; background: var(--bg)" @submit.prevent="send">
    <label :for="id + '-category'">Problem category</label>
    <select :id="id + '-category'" v-model="category" :disabled="busy"><option v-for="item in categories" :key="item.value" :value="item.value">{{ item.label }}</option></select>
    <label :for="id">Report this question to your professor</label>
    <textarea :id="id" v-model="reason" :disabled="busy" required rows="2" maxlength="300" placeholder="What seems wrong? e.g. two answers look correct, a typo, the explanation disagrees with the notes"></textarea>
    <p class="small muted">{{ reason.length }}/300 characters. Avoid personal information. Your professor sees the problem without your identity.</p>
    <p v-if="error" class="note bad" role="alert">{{ error }}</p>
    <div class="row" style="margin-top: 8px">
      <button type="submit" class="btn small primary" :disabled="busy">{{ busy ? 'Sending…' : 'Send report' }}</button>
      <button type="button" class="btn small" :disabled="busy" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
