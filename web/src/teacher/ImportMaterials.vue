<script setup>
import { ref, computed, onMounted, watch, useId } from 'vue';
import { S, api } from '../api.js';
import { extractFile, originOf } from './import-materials.js';
import { toBase64 } from './pdf.js';
import { draftStore } from './authoring-draft.js';
// topic: the weekly topic files are uploaded to and listed from (null = older
// course-wide uploads that are not in a topic).
const props = defineProps({ course: Object, topic: { type: Object, default: null }, disabled: Boolean, inWorkflow: Boolean });
const emit = defineEmits(['saved', 'available', 'state']);
const pages = ref([]), busy = ref(false), loading = ref(true), fileInput = ref(null), message = ref(''), error = ref(''), confirmed = ref(false);
const topicId = props.topic?.id ?? null;
const key = `import:${S.me.id}:${props.course.id}` + (topicId ? `:${topicId}` : '');
const replaceInput = ref(null), replaceTarget = ref(''), useAi = ref(false), controller = ref(null);
const failures = ref([]), active = ref(null), retryTarget = ref('');
const verified = ref(false);
const locked = computed(() => loading.value || !verified.value || busy.value || props.disabled);
const originals = new Map();
const expanded = ref(true), regionId = useId();
const preferenceKey = key + ':expanded';
try { expanded.value = sessionStorage.getItem(preferenceKey) !== 'false'; } catch { /* Optional UI preference. */ }
function setExpanded(value) {
  expanded.value = value;
  try { sessionStorage.setItem(preferenceKey, String(value)); } catch { /* Upload recovery is independent. */ }
}
defineExpose({ collapse: () => setExpanded(false) });
// File name of every uploaded excerpt, including replaced ones, so reports can name their sources.
const names = ref({});
const ACCEPT = '.pdf,.pptx,.pptm,.ppsx,.ppsm,.potx,.ppt,.docx,.doc,.txt,.md,.csv';
const uploadBody = p => ({ title: p.title, text: p.text, origin: p.origin, documentId: p.documentId, fileName: p.fileName, topicId: p.topicId ?? topicId, outcomeId: p.outcomeId ?? null, confirmNoPersonalData: true });
const fileKey = (p) => p.documentId || p.fileName || p.title.split(' · ')[0];
const files = computed(() => [...new Set(pages.value.map(fileKey))]);
const unsaved = computed(() => pages.value.filter((p) => !p.saved));
const fileStatus = computed(() => files.value.map((id) => {
  const parts = pages.value.filter((p) => fileKey(p) === id);
  const name = parts[0].fileName || parts[0].title.split(' · ')[0];
  const saved = parts.filter((p) => p.saved).length;
  const failure = parts.find(p => p.uploadError)?.uploadError;
  const replacement = parts.find(p => p.replaces)?.replaces;
  return { id, name, note: parts[0].fileNote || '', saved, total: parts.length, failure, replacement,
    complete: saved === parts.length && !replacement,
    status: failure ? 'Upload failed' : active.value?.id === id ? 'Uploading' : saved === parts.length && !replacement ? 'Uploaded' : saved ? `Partially uploaded (${saved}/${parts.length} excerpts)` : 'Ready to upload' };
}));
const savedFiles = computed(() => fileStatus.value.filter(f => f.complete));
const pending = computed(() => fileStatus.value.filter(f => !f.complete));
const warningCount = computed(() => savedFiles.value.filter(f => f.note).length);
const warningSummary = computed(() => {
  const notes = savedFiles.value.map(f => f.note).join(' ');
  const concerns = [];
  if (/personal data/i.test(notes)) concerns.push('Possible personal data was skipped');
  if (/not read|no readable text|cannot read|more were not/i.test(notes)) concerns.push('Unread content');
  if (/could not be described|stopped early/i.test(notes)) concerns.push('AI image processing incomplete');
  return concerns.join(' · ') || 'Review AI descriptions before assessing';
});
const pendingFiles = computed(() => pending.value.length + failures.value.length);
function emitState() {
  const materialIds = [...new Set(pages.value.filter(p=>p.saved).map(p=>p.id))];
  emit('available', materialIds.length > 0);
  emit('state', { materialIds, names: names.value, pending: pendingFiles.value > 0, busy: busy.value, ready: !loading.value && verified.value });
}
watch([busy, loading, pendingFiles], emitState);
async function reconnect() {
  loading.value = true; error.value = '';
  try { await sync(); } catch (e) { error.value = 'Could not verify uploaded files. ' + e.message; }
  finally { loading.value = false; }
}
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
  verified.value = true;
  await stash();
  emitState();
}
async function stash() {
  try { await draftStore(key, JSON.parse(JSON.stringify({ pages: pages.value, failures: failures.value }))); }
  catch { error.value = 'Browser recovery storage is unavailable. Keep this tab open until the upload is saved.'; }
}
onMounted(async () => {
  try {
    const recovered = await draftStore(key);
    pages.value = Array.isArray(recovered) ? recovered : recovered?.pages || [];
    failures.value = recovered?.failures || [];
  }
  catch { error.value = 'Browser recovery storage is unavailable. Keep this tab open until the upload is saved.'; }
  try {
    await sync();
  } catch (e) { error.value = 'Could not verify uploaded files. Refresh to reconnect. ' + e.message; }
  finally { loading.value = false; }
});
async function detach(id) {
  const parts = pages.value.filter(p => fileKey(p) === id);
  const backup = parts.find(p => p.replacementSources)?.replacementSources || [];
  // Shared excerpts may have joined the replacement server-side. Restore their
  // original grouping before removing a partly saved replacement.
  for (const p of backup) await api('POST', `/api/teacher/courses/${props.course.id}/import`, uploadBody(p));
  const ids=parts.filter(p=>p.saved && !backup.some(old => old.id === p.id)).map(p=>p.id);
  if(ids.length) await api('PUT', `/api/teacher/courses/${props.course.id}/imports`, {passageIds:ids,attached:false});
  pages.value=pages.value.filter(p=>fileKey(p)!==id);
  for (const p of backup) if (!pages.value.some(old => old.id === p.id)) pages.value.push(p);
  await stash();
  if(ids.length || backup.length) await sync();
  else emitState();
}
async function removeFile(id) {
  if (locked.value) return;
  busy.value=true; error.value='';
  try {
    failures.value = failures.value.filter(f => f.id !== id); originals.delete(id);
    await detach(id); message.value='File removed from attached material. Existing reports and questions are kept.'; emit('saved');
  }
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
async function retryFile(file) {
  const original = originals.get(file.id);
  if (original) return choose({ target: { files: [original], value: '' } }, file.replacing || '', file.id);
  retryTarget.value = file.id;
  replaceTarget.value = file.replacing || '';
  message.value = `Reselect ${file.name} to retry. Your browser no longer has the original file.`;
  replaceInput.value.click();
}
async function choose(event, replacing = '', retrying = '') {
  if (locked.value) return;
  busy.value = true; error.value = '';
  const ctrl = (controller.value = new AbortController());
  let added = 0, cancelled = '';
  try {
    if (event.target.files.length > 20) throw new Error('Choose up to 20 files at once.');
    for (const file of event.target.files) {
      if (ctrl.signal.aborted) break;
      const failureId = retrying || `selection:${file.name}:${file.size}:${file.lastModified}`;
      if (!retrying && failures.value.some(f => f.id === failureId)) continue;
      originals.set(failureId, file);
      active.value = { id: failureId, name: file.name, status: 'Reading' };
      failures.value = failures.value.filter(f => f.id !== failureId);
      failures.value.push({ id: failureId, name: file.name, replacing, error: 'Reading was interrupted. Retry or reselect this file.' });
      await stash();
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
            const otherDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([file.name, fingerprint, !ai])));
            const otherId = [...new Uint8Array(otherDigest)].map(n => n.toString(16).padStart(2, '0')).join('');
            return replacing === documentId || replacing === otherId || !pages.value.some(p => [documentId, otherId].includes(p.documentId));
          },
        });
        if (!result) {
          failures.value = failures.value.filter(f => f.id !== failureId);
          originals.delete(failureId);
          await stash();
          continue;
        }
        const { pages: extracted, note } = result;
        if (!extracted.some((p) => p.text.trim())) throw new Error('No readable text found. Tick “Describe images with AI” to transcribe scanned pages, or upload a text-based file.');
        const additions=[];
        for (const p of extracted) {
          const value = p.text.trim() || `[Unreadable visual or scanned page: ${p.label}. No factual content could be extracted.]`;
          const pieces = value.match(/[\s\S]{1,70000}/g);
          pieces.forEach((text, i) => additions.push({
            documentId, fileName: file.name, fileNote: note, replaces: replacing || undefined,
            title: `${file.name} · ${p.label}${pieces.length > 1 ? ' · Part ' + (i + 1) : ''}`.slice(0,120),
            text, origin: originOf(file.name), saved: false,
          }));
        }
        // Keep the old attachment until every replacement excerpt is saved.
        // Re-reading the same fingerprint must not duplicate local rows.
        if (replacing === documentId) {
          const old = pages.value.filter(p => fileKey(p) === documentId);
          if (old.length === additions.length && additions.every(p => old.some(o => o.title === p.title && o.text === p.text))) {
            old.forEach(p => { p.fileNote = note; });
            failures.value = failures.value.filter(f => f.id !== failureId); originals.delete(failureId); await stash(); continue;
          }
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([documentId, additions.map(p => p.text)])));
          const versionId = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
          if (pages.value.some(p => p.documentId === versionId)) {
            failures.value = failures.value.filter(f => f.id !== failureId); originals.delete(failureId); await stash(); continue;
          }
          additions.forEach(p => { p.documentId = versionId; });
        }
        if (replacing) additions[0].replacementSources = JSON.parse(JSON.stringify(pages.value.filter(p => fileKey(p) === replacing && p.saved)));
        pages.value.push(...additions);
        failures.value = failures.value.filter(f => f.id !== failureId);
        originals.delete(failureId);
        await stash();
        added++;
      } catch (e) {
        const reason = e.name === 'AbortError' ? 'Reading cancelled. Retry when ready.' : e.message;
        failures.value = failures.value.filter(f => f.id !== failureId);
        failures.value.push({ id: failureId, name: file.name, replacing, error: reason });
        await stash();
        if (e.name === 'AbortError') { cancelled = file.name; break; }
      }
    }
    message.value = cancelled
      ? `Cancelled. ${cancelled} ${replacing ? 'did not replace the listed file, which is kept' : 'was not added'}.${pendingFiles.value ? ' Files marked “not uploaded yet” still need Upload files.' : ''}`
      : added ? 'Files read. Not uploaded yet: tick the confirmation below and click Upload files.' : failures.value.length ? 'Some files need attention. Retry or remove them below.' : error.value ? 'No new files were added.' : 'These files are already listed. Nothing new to upload.';
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; controller.value = null; active.value = null; retryTarget.value = ''; event.target.value = ''; }
}
async function save(onlyId = '') {
  if (locked.value || !confirmed.value || !pending.value.length) return;
  busy.value = true; error.value = '';
  const ctrl = (controller.value = new AbortController());
  const queue = unsaved.value.filter(p => !onlyId || fileKey(p) === onlyId);
  const hadSaved = savedFiles.value.length > 0;
  let currentPage;
  let done = 0;
  try {
    for (const p of queue) {
      if (ctrl.signal.aborted) break;
      currentPage = p;
      active.value = { id: fileKey(p), name: p.fileName, status: 'Uploading' };
      delete p.uploadError;
      message.value = `Uploading excerpt ${done + 1} of ${queue.length}…`;
      const saved = await api('POST', `/api/teacher/courses/${props.course.id}/import`, uploadBody(p));
      Object.assign(p,saved,{saved:true}); await stash();
      done++;
    }
    for (const file of pending.value.filter(f => f.saved === f.total && (!onlyId || f.id === onlyId))) {
      const newIds = pages.value.filter(p => fileKey(p) === file.id).map(p => p.id);
      const backup = pages.value.find(p => fileKey(p) === file.id && p.replacementSources)?.replacementSources || [];
      const oldIds = [...new Set([...backup, ...pages.value.filter(p => fileKey(p) === file.replacement && p.saved)].filter(p => !newIds.includes(p.id)).map(p => p.id))];
      if (oldIds.length) await api('PUT', `/api/teacher/courses/${props.course.id}/imports`, { passageIds: oldIds, attached: false });
      pages.value = pages.value.filter(p => fileKey(p) !== file.replacement || newIds.includes(p.id));
      pages.value.filter(p => fileKey(p) === file.id).forEach(p => { delete p.replaces; delete p.replacementSources; delete p.uploadError; });
    }
    await stash();
    message.value = done < queue.length
      ? `Upload stopped: ${done} of ${queue.length} excerpts saved. Click Upload files to finish, or Remove the file.`
      : pendingFiles.value ? `${pendingFiles.value} file(s) still need attention. Saved files are kept above.` : 'Upload complete. You do not need to upload these files again.';
    await sync();
    if (done) emit('saved');
  } catch (e) {
    const affected = currentPage || pages.value.find(p => p.replaces && (!onlyId || fileKey(p) === onlyId));
    if (affected) affected.uploadError = e.message + ' Retry to finish; saved excerpts and the original file are kept.';
    else error.value = e.message;
    await stash();
  }
  finally {
    if (!hadSaved && savedFiles.value.length) setExpanded(true);
    busy.value = false; controller.value = null; active.value = null;
  }
}
</script>
<template>
  <section v-if="verified && savedFiles.length" class="panel saved-materials" aria-label="Successfully uploaded files">
    <h3 class="saved-heading"><button type="button" class="saved-toggle" :aria-expanded="expanded" :aria-controls="regionId" @click="setExpanded(!expanded)">
      <span class="grow">Successfully Uploaded Files <span class="badge published">{{ savedFiles.length }}</span><span v-if="warningCount" class="warning-summary small">{{ warningCount }} file(s) have extraction notes · {{ warningSummary }}</span></span>
      <span class="small">{{ expanded ? 'Hide files' : 'Show files' }}</span><span aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
    </button></h3>
    <div :id="regionId" class="saved-region" :class="{ expanded }" :inert="!expanded" :aria-hidden="!expanded">
      <div class="saved-inner">
        <article v-for="file in savedFiles" :key="file.id" class="material-row" :aria-label="file.name">
          <div class="grow"><strong class="file-name">{{ file.name }}</strong><div class="small muted"><span class="badge published">Uploaded</span> · {{ file.total }} excerpt(s) saved</div>
            <details v-if="file.note" class="small file-warning"><summary>Extraction notes — file saved</summary><p>{{ file.note }}</p><p>Check unread diagrams and AI descriptions in the report. Replace this file to read it again.</p></details>
            <details class="small"><summary>View extracted text</summary><p v-for="p in pages.filter(p => fileKey(p) === file.id)" :key="p.id" class="extracted-text">{{ p.text }}</p></details>
          </div>
          <div class="material-actions"><button class="btn small" :disabled="locked || pending.some(f => f.replacement === file.id)" :aria-label="'Replace ' + file.name" @click="replaceFile(file.id)">Replace</button><button class="btn small" :disabled="locked || pending.some(f => f.replacement === file.id)" :aria-label="'Remove ' + file.name" @click="removeFile(file.id)">Remove</button></div>
        </article>
      </div>
    </div>
  </section>
  <section class="panel upload-materials" aria-label="Upload materials">
    <h3>Upload Materials</h3>
    <p class="small muted">PDF, PowerPoint, Word, TXT, Markdown or CSV · Up to 100 MB each, 20 files at once.</p>
    <p v-if="!pendingFiles && !busy" class="small muted">{{ savedFiles.length ? 'Add another lecture file to this topic.' : 'Choose lecture files to get started.' }}</p>
    <input ref="fileInput" aria-label="Lecture files" type="file" multiple :accept="ACCEPT" :disabled="locked" style="display:none" @change="choose" />
    <input ref="replaceInput" aria-label="Replacement lecture file" type="file" :accept="ACCEPT" :disabled="locked" style="display:none" @change="choose($event,replaceTarget,retryTarget)" />
    <button class="btn" :disabled="locked" @click="fileInput.click()">Choose files</button>
    <details v-if="course.geminiEnabled" class="small upload-options"><summary>Image processing options</summary><label><input v-model="useAi" type="checkbox" :disabled="locked" /> Describe images with AI</label><p class="muted">Sends large pictures and scanned pages to Google Gemini (up to 40 per file). Check descriptions and unread diagrams in your report.</p></details>
    <p v-if="loading" role="status">Checking uploaded files…</p>
    <p v-if="message" class="small upload-message" role="status">{{ message }} <button v-if="busy && controller" class="btn small" @click="cancel">Cancel</button></p>
    <p v-if="error" class="note bad" role="alert">{{ error }}</p>
    <button v-if="!verified && !loading" class="btn" @click="reconnect">Retry connection</button>
    <div v-if="active?.status === 'Reading'" class="material-row" role="status"><strong class="file-name">{{ active.name }}</strong><span>Reading…</span></div>
    <article v-for="file in pending" :key="file.id" class="material-row" :aria-label="file.name">
      <div class="grow"><strong class="file-name">{{ file.name }}</strong><div class="small" :class="file.failure ? 'file-warning' : 'muted'">{{ file.status }} · {{ file.saved }}/{{ file.total }} excerpts saved</div><p v-if="file.replacement" class="small muted">Replacement: the original stays attached until this file is fully saved.</p><p v-if="file.failure" class="small file-warning" role="alert">{{ file.failure }}</p><details v-if="file.note" class="small"><summary>Extraction notes</summary>{{ file.note }}</details></div>
      <div class="material-actions"><button v-if="file.failure || file.saved" class="btn small" :disabled="locked || !confirmed" :aria-label="'Retry ' + file.name" @click="save(file.id)">Retry</button><button class="btn small" :disabled="locked" :aria-label="'Remove ' + file.name" @click="removeFile(file.id)">Remove</button></div>
    </article>
    <article v-for="file in failures.filter(f => f.id !== active?.id)" :key="file.id" class="material-row" :aria-label="file.name">
      <div class="grow"><strong class="file-name">{{ file.name }}</strong><div class="small file-warning">Could not read file</div><p class="small" role="alert">{{ file.error }}</p></div>
      <div class="material-actions"><button class="btn small" :disabled="locked" :aria-label="'Retry ' + file.name" @click="retryFile(file)">Retry</button><button class="btn small" :disabled="locked" :aria-label="'Remove ' + file.name" @click="removeFile(file.id)">Remove</button></div>
    </article>
    <label v-if="pending.length" class="small"><input v-model="confirmed" type="checkbox" :disabled="busy || disabled" /> This is authorised course material without student personal data.</label>
    <button v-if="pending.length" class="btn primary" :disabled="locked || !confirmed" @click="save()">Upload files</button>
  </section>
</template>

<style scoped>
.saved-materials { padding: 0; overflow: hidden; }
.saved-heading { margin: 0; }
.saved-toggle { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; padding: 16px 18px; border: 0; background: transparent; color: var(--ink); font: inherit; cursor: pointer; }
.saved-toggle:hover { background: var(--accent-soft); }
.saved-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.warning-summary { display: block; color: var(--warn); font-weight: 400; margin-top: 5px; }
.saved-region { display: grid; grid-template-rows: 0fr; visibility: hidden; transition: grid-template-rows .2s ease, visibility .2s; }
.saved-region.expanded { grid-template-rows: 1fr; visibility: visible; }
.saved-inner { min-height: 0; overflow: hidden; }
.saved-inner .material-row { margin: 0 18px; }
.material-row { display: flex; align-items: flex-start; gap: 14px; padding: 12px 0; border-top: 1px solid var(--line); }
.file-name { display: block; overflow-wrap: anywhere; }
.material-actions { display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; }
.file-warning { color: var(--warn); }
.material-row p { margin: 5px 0; }
.material-row details { margin-top: 6px; }
summary { cursor: pointer; }
.upload-options, .upload-message { margin: 12px 0; }
.extracted-text { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; }
@media (max-width: 540px) { .material-row { flex-direction: column; gap: 8px; } .saved-toggle { flex-wrap: wrap; gap: 8px; } .saved-toggle > .grow { flex-basis: 100%; } }
@media (prefers-reduced-motion: reduce) { .saved-region { transition: none; } }
</style>
