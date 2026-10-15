<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { S, api } from '../api.js';
import { extractFile } from './import-materials.js';
import { draftStore } from './authoring-draft.js';
import { initialTags } from './courses.js';
const props = defineProps({ course: Object, disabled: Boolean });
const emit = defineEmits(['saved', 'available', 'state']);
const pages = ref([]), busy = ref(false), loading = ref(true), fileInput = ref(null), message = ref(''), error = ref(''), confirmed = ref(false);
const key = `import:${S.me.id}:${props.course.id}`;
const replaceInput = ref(null), replaceTarget = ref('');
const fileKey = (p) => p.documentId || p.fileName || p.title.split(' · ')[0];
const files = computed(() => [...new Set(pages.value.map(fileKey))]);
const unsaved = computed(() => pages.value.filter((p) => !p.saved));
const fileStatus = computed(() => files.value.map((id) => {
  const parts = pages.value.filter((p) => fileKey(p) === id);
  const name = parts[0].fileName || parts[0].title.split(' · ')[0];
  const saved = parts.filter((p) => p.saved).length;
  return { id, name, status: saved === parts.length ? 'Uploaded' : saved ? `Partially uploaded (${saved}/${parts.length} excerpts)` : 'Selected — ready to upload' };
}));
function emitState() {
  const materialIds = [...new Set(pages.value.filter(p=>p.saved).map(p=>p.id))];
  emit('available', materialIds.length > 0);
  emit('state', { materialIds, pending: unsaved.value.length > 0, busy: busy.value, ready: !loading.value });
}
watch([busy, loading, unsaved], emitState);
async function sync() {
  const material = (await api('GET', `/api/teacher/courses/${props.course.id}/passages`)).filter(p=>p.origin !== 'report' && p.attached !== false);
  const stored = material.filter(p=>p.importHash);
  const matches = (p,s) => s.title===p.title && s.text===p.text && s.documentId===p.documentId;
  // Server attachment state is authoritative for previously uploaded drafts.
  pages.value = pages.value.filter(p=>!p.saved || stored.some(s=>matches(p,s)));
  for (const p of pages.value) {
    const saved = stored.find(s=>matches(p,s));
    if (saved) Object.assign(p,saved,{saved:true});
  }
  for (const p of stored) if (!pages.value.some(s=>matches(p,s))) pages.value.push({...p,fileName:p.fileName || p.title.split(' · ')[0],saved:true});
  await stash();
  emitState();
}
async function stash() {
  try { await draftStore(key, JSON.parse(JSON.stringify(pages.value))); }
  catch { error.value = 'Browser recovery storage is unavailable. Keep this tab open until the upload is saved.'; }
}
onMounted(async () => {
  try { pages.value = (await draftStore(key)) || []; }
  catch { error.value = 'Browser recovery storage is unavailable. Keep this tab open until the upload is saved.'; }
  try {
    await sync();
  } catch (e) { error.value = 'Could not verify uploaded files. Refresh to reconnect. ' + e.message; }
  finally { loading.value = false; }
});
async function detach(id) {
  const ids=pages.value.filter(p=>fileKey(p)===id && p.saved).map(p=>p.id);
  if(ids.length) await api('PUT', `/api/teacher/courses/${props.course.id}/imports`, {passageIds:ids,attached:false});
  pages.value=pages.value.filter(p=>fileKey(p)!==id);
  await stash();
  if(ids.length) await sync();
  else emitState();
}
async function removeFile(id) {
  if (busy.value || props.disabled || loading.value) return;
  busy.value=true; error.value='';
  try { await detach(id); message.value='File removed from attached material. Existing reports and questions are kept.'; emit('saved'); }
  catch(e) { error.value=e.message; }
  finally { busy.value=false; }
}
function replaceFile(id) { replaceTarget.value=id; replaceInput.value.click(); }
async function choose(event, replacing = '') {
  if (busy.value || props.disabled || loading.value) return;
  busy.value = true; error.value = '';
  try {
    if (event.target.files.length > 20) throw new Error('Choose up to 20 files at once.');
    for (const file of event.target.files) {
      try {
        message.value = `Reading ${file.name}`;
        const extracted = await extractFile(file, () => message.value = `Reading ${file.name}…`);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([file.name, extracted])));
        const documentId = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
        if (pages.value.some((p) => p.documentId === documentId)) {
          if(replacing && replacing!==documentId) await detach(replacing);
          continue;
        }
        if (!extracted.some((p) => p.text.trim())) throw new Error('No readable text found. Use image transcription in Source material or upload a text-based PDF.');
        const additions=[];
        for (const p of extracted) {
          const value = p.text.trim() || `[Unreadable visual or scanned page: ${p.label}. No factual content could be extracted.]`;
          const pieces = value.match(/[\s\S]{1,70000}/g);
          pieces.forEach((text, i) => additions.push({
            documentId, fileName: file.name,
            title: `${file.name} · ${p.label}${pieces.length > 1 ? ' · Part ' + (i + 1) : ''}`.slice(0,120),
            text, origin: /\.pdf$/i.test(file.name) ? 'pdf' : /\.pptx$/i.test(file.name) ? 'pptx' : 'text', saved: false,
          }));
        }
        if(replacing) await detach(replacing);
        pages.value.push(...additions);
        await stash();
      } catch (e) { error.value += `${file.name}: ${e.message} `; }
    }
    message.value = 'Files ready. All uploaded material will be processed together.';
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; event.target.value = ''; }
}
async function save() {
  if (busy.value || props.disabled || loading.value || !confirmed.value || !unsaved.value.length) return;
  busy.value = true; error.value = '';
  try {
    for (const p of unsaved.value) {
      message.value = 'Saving uploaded material…';
      const saved = await api('POST', `/api/teacher/courses/${props.course.id}/import`, { ...p, ...initialTags(props.course), confirmNoPersonalData: confirmed.value });
      Object.assign(p,saved,{saved:true}); await stash();
    }
    message.value = 'Uploaded material saved.';
    await sync();
    emit('saved');
  } catch (e) { error.value = e.message + ' Retry to continue; material already saved will be kept.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="panel">
    <h3>Upload lecture material</h3>
    <p>Choose PDF, PowerPoint or text files, up to 100 MB each. All uploaded material is included automatically.</p>
    <p class="small muted">Text and speaker notes are read locally. Check diagrams, equations and any gaps when editing the report.</p>
    <input ref="fileInput" aria-label="Lecture files" type="file" multiple accept=".pdf,.pptx,.txt,.md,.csv" :disabled="loading || busy || disabled" style="display:none" @change="choose" />
    <input ref="replaceInput" aria-label="Replacement lecture file" type="file" accept=".pdf,.pptx,.txt,.md,.csv" :disabled="loading || busy || disabled" style="display:none" @change="choose($event,replaceTarget)" />
    <button class="btn" :disabled="loading || busy || disabled" @click="fileInput.click()">Choose files</button>
    <p v-if="loading" role="status">Checking uploaded files…</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" class="note bad" role="alert">{{ error }}</p>
    <template v-if="files.length">
      <ul aria-label="Lecture file upload status"><li v-for="file in fileStatus" :key="file.id"><span>{{ file.name }}</span> — <strong>{{ file.status }}</strong> <button class="btn small" :disabled="loading || busy || disabled" :aria-label="'Replace ' + file.name" @click="replaceFile(file.id)">Replace</button> <button class="btn small" :disabled="loading || busy || disabled" :aria-label="'Remove ' + file.name" @click="removeFile(file.id)">Remove</button></li></ul>
      <p v-if="!unsaved.length">All uploaded material is saved.</p>
      <label v-if="unsaved.length"><input v-model="confirmed" type="checkbox" :disabled="busy || disabled" /> This is authorised course material without student personal data.</label>
      <button v-if="unsaved.length" class="btn primary" :disabled="loading || busy || disabled || !confirmed" @click="save">Upload files</button>
      <p v-else class="small muted">Uploaded files are ready. Generate a report when you choose.</p>
    </template>
  </div>
</template>
