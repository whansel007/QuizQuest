<script setup>
// "Report a problem with this question" - goes to the professor, who sees
// the reason without the student's identity.
import { ref, useId } from 'vue';
import { api } from '../api.js';
import { action } from '../ui.js';

const props = defineProps({ questionId: { type: String, required: true } });
const emit = defineEmits(['sent', 'cancel']);
const reason = ref('');
const id = useId();
const send = action(async () => {
  const r = await api('POST', `/api/student/questions/${props.questionId}/report`, { reason: reason.value });
  emit('sent', r.already ? 'You already reported this question.' : 'Thanks, your professor will review it.');
});
</script>

<template>
  <div class="panel" style="margin-top: 10px; background: var(--bg)">
    <label :for="id">Report this question to your professor</label>
    <textarea :id="id" v-model="reason" rows="2" maxlength="300" placeholder="What seems wrong? e.g. two answers look correct, a typo, the explanation disagrees with the notes"></textarea>
    <div class="row" style="margin-top: 8px">
      <button class="btn small primary" @click="send">Send report</button>
      <button class="btn small" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>
