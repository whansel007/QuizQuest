<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { S, api } from '../api.js';
import { extractFile, originOf } from './import-materials.js';
import { toBase64 } from './pdf.js';
import { draftStore } from './authoring-draft.js';
import { topicLabel } from './courses.js';
// topic: the weekly topic files are uploaded to and listed from (null = older
// course-wide uploads that are not in a topic).
const props = defineProps({ course: Object, topic: { type: Object, default: null }, disabled: Boolean, inWorkflow: Boolean });
const emit = defineEmits(['saved', 'available', 'state']);
const pages = ref([]), busy = ref(false), loading = ref(true), fileInput = ref(null), message = ref(''), error = ref(''), confirmed = ref(false);
const topicId = props.topic?.id ?? null;
const key = `import:${S.me.id}:${props.course.id}` + (topicId ? `:${topicId}` : '');
const replaceInput = ref(null), replaceTarget = ref(''), useAi = ref(false), controller = ref(null);
// File name of every uploaded excerpt, including replaced ones, so reports can name their sources.
const names = ref({});
const ACCEPT = '.pdf,.pptx,.pptm,.ppsx,.ppsm,.potx,.ppt,.docx,.doc,.txt,.md,.csv';
const fileKey = (p) => p.documentId || p.fileName || p.title.split(' · ')[0];
const files = computed(() => [...new Set(pages.value.map(fileKey))]);
const unsaved = computed(() => pages.value.filter((p) => !p.saved));
const fileStatus = computed(() => files.value.map((id) => {
  const parts = pages.value.filter((p) => fileKey(p) === id);
  const name = parts[0].fileName || parts[0].title.split(' · ')[0];
  const saved = parts.filter((p) => p.saved).length;
  return { id, name, note: parts[0].fileNote || '', status: saved === parts.length ? 'Uploaded' : saved ? `Partially uploaded (${saved}/${parts.length} excerpts)` : 'Read — not uploaded yet' };
}));
const pendingFiles = computed(() => fileStatus.value.filter((f) => f.status !== 'Uploaded').length);
function emitState() {
  const materialIds = [...new Set(pages.value.filter(p=>p.saved).map(p=>p.id))];
  emit('available', materialIds.length > 0);
  emit('state', { materialIds, names: names.value, pending: unsaved.value.length > 0, busy: busy.value, ready: !loading.value });
}
watch([busy, loading, unsaved], emitState);
async function sync() {
  const all = (await api('GET', `/api/teacher/courses/${props.course.id}/passages`)).filter(p=>p.origin !== 'report');
  names.value = Object.fromEntries(all.map((p) => [p.id, p.fileName || p.title.split(' · ')[0]]));
  const material = all.filter(p=>p.attached !== false && (p.topicId ?? null) === topicId);
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
// Opt-in only: sends slide/document images and scanned pages to Gemini.
async function describe(blob, mode) {
  return api('POST', `/api/teacher/courses/${props.course.id}/transcribe`, { imageBase64: await toBase64(blob), mimeType: blob.type, mode }, { signal: controller.value?.signal });
}
// Reading stops at the next page or image (aborting an AI request in flight);
// uploading stops after the excerpt being saved.
function cancel() {
  controller.value?.abort();
  message.value = 'Cancelling…';
}
function replaceFile(id) { replaceTarget.value=id; replaceInput.value.click(); }
async function choose(event, replacing = '') {
  if (busy.value || props.disabled || loading.value) return;
  busy.value = true; error.value = '';
  const ctrl = (controller.value = new AbortController());
  let added = 0, cancelled = '';
  try {
    if (event.target.files.length > 20) throw new Error('Choose up to 20 files at once.');
    for (const file of event.target.files) {
      if (ctrl.signal.aborted) break;
      try {
        message.value = `Reading ${file.name}`;
        const ai = useAi.value;
        let documentId = '';
        const result = await extractFile(file, (step) => message.value = `${file.name}: ${step}…`, {
          describe: ai ? describe : undefined,
          signal: ctrl.signal,
          // Runs before any AI step. A file already listed is skipped, except
          // Replace with that same file, which re-reads it (e.g. to retry AI).
          accept: async (fingerprint) => {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([file.name, fingerprint, ai])));
            documentId = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
            return replacing === documentId || !pages.value.some((p) => p.documentId === documentId);
          },
        });
        if (!result) {
          if(replacing) await detach(replacing);
          continue;
        }
        const { pages: extracted, note } = result;
        if (!extracted.some((p) => p.text.trim())) throw new Error('No readable text found. Tick “Describe images with AI” to transcribe scanned pages, or upload a text-based file.');
        const additions=[];
        for (const p of extracted) {
          const value = p.text.trim() || `[Unreadable visual or scanned page: ${p.label}. No factual content could be extracted.]`;
          const pieces = value.match(/[\s\S]{1,70000}/g);
          pieces.forEach((text, i) => additions.push({
            documentId, fileName: file.name, fileNote: note,
            title: `${file.name} · ${p.label}${pieces.length > 1 ? ' · Part ' + (i + 1) : ''}`.slice(0,120),
            text, origin: originOf(file.name), saved: false,
          }));
        }
        if(replacing) await detach(replacing);
        pages.value.push(...additions);
        await stash();
        added++;
      } catch (e) {
        if (e.name === 'AbortError') { cancelled = file.name; break; }
        error.value += `${file.name}: ${e.message} `;
      }
    }
    message.value = cancelled
      ? `Cancelled. ${cancelled} ${replacing ? 'did not replace the listed file, which is kept' : 'was not added'}.${pendingFiles.value ? ' Files marked “not uploaded yet” still need Upload files.' : ''}`
      : added ? 'Files read. Not uploaded yet: tick the confirmation below and click Upload files.' : error.value ? 'No new files were added.' : 'These files are already listed. Nothing new to upload.';
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; controller.value = null; event.target.value = ''; }
}
async function save() {
  if (busy.value || props.disabled || loading.value || !confirmed.value || !unsaved.value.length) return;
  busy.value = true; error.value = '';
  const ctrl = (controller.value = new AbortController());
  const queue = unsaved.value;
  let done = 0;
  try {
    for (const p of queue) {
      if (ctrl.signal.aborted) break;
      message.value = `Uploading excerpt ${done + 1} of ${queue.length}…`;
      const saved = await api('POST', `/api/teacher/courses/${props.course.id}/import`, { ...p, topicId, confirmNoPersonalData: confirmed.value });
      Object.assign(p,saved,{saved:true}); await stash();
      done++;
    }
    message.value = done < queue.length
      ? `Upload stopped: ${done} of ${queue.length} excerpts saved. Click Upload files to finish, or Remove the file.`
      : 'Upload complete. You do not need to upload these files again.';
    await sync();
    if (done) emit('saved');
  } catch (e) { error.value = e.message + ' Click Upload files to retry; material already saved will be kept.'; }
  finally { busy.value = false; controller.value = null; }
}
</script>
<template>
  <div class="panel">
    <h3>Upload lecture material<template v-if="topic"> for {{ topicLabel(topic) }}</template></h3>
    <p>Choose PDF, PowerPoint, Word or text files, up to 100 MB each. {{ topic ? 'Every file uploaded to this topic is used for its knowledge report.' : 'All uploaded material is included automatically.' }}</p>
    <p class="small muted">Text, tables, charts and speaker notes are read in your browser. Check diagrams, equations and any gaps when editing the report.</p>
    <label v-if="course.geminiEnabled" class="small"><input v-model="useAi" type="checkbox" :disabled="loading || busy || disabled" /> Describe images with AI: sends large slide/document pictures and scanned PDF pages to Google Gemini (up to 40 per file). Use only for authorised course material without student personal data.</label>
    <input ref="fileInput" aria-label="Lecture files" type="file" multiple :accept="ACCEPT" :disabled="loading || busy || disabled" style="display:none" @change="choose" />
    <input ref="replaceInput" aria-label="Replacement lecture file" type="file" :accept="ACCEPT" :disabled="loading || busy || disabled" style="display:none" @change="choose($event,replaceTarget)" />
    <button class="btn" :disabled="loading || busy || disabled" @click="fileInput.click()">Choose files</button>
    <p v-if="loading" role="status">Checking uploaded files…</p>
    <p v-if="message" role="status">{{ message }} <button v-if="busy && controller" class="btn small" @click="cancel">Cancel</button></p>
    <p v-if="error" class="note bad" role="alert">{{ error }}</p>
    <template v-if="files.length">
      <ul class="file-list" aria-label="Lecture file upload status"><li v-for="file in fileStatus" :key="file.id"><span>{{ file.name }}</span> — <strong>{{ file.status }}</strong> <span v-if="file.note" class="small muted">{{ file.note }}</span><span class="file-actions"><button class="btn small" :disabled="loading || busy || disabled" :aria-label="'Replace ' + file.name" @click="replaceFile(file.id)">Replace</button><button class="btn small" :disabled="loading || busy || disabled" :aria-label="'Remove ' + file.name" @click="removeFile(file.id)">Remove</button></span></li></ul>
      <p v-if="!unsaved.length">All uploaded material is saved.</p>
      <p v-else-if="!busy" class="note warn" role="status">{{ pendingFiles === 1 ? '1 file is' : pendingFiles + ' files are' }} not uploaded yet. Tick the box below and click <strong>Upload files</strong>; reports only use uploaded files.</p>
      <label v-if="unsaved.length"><input v-model="confirmed" type="checkbox" :disabled="busy || disabled" /> This is authorised course material without student personal data.</label>
      <button v-if="unsaved.length" class="btn primary" :disabled="loading || busy || disabled || !confirmed" @click="save">Upload files</button>
      <p v-else class="small muted">Nothing more to upload. Next step: {{ inWorkflow ? 'click Generate report below' : 'Generate report on the AI drafting page' }}.</p>
    </template>
  </div>
</template>
