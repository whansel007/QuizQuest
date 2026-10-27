<script setup>
// ============================================================
// Source material, grouped by weekly topic: paste, PDF, scans & diagrams
// ============================================================
import { ref, reactive, computed, markRaw, onMounted } from 'vue';
import { S, api, rerender } from '../api.js';
import { toast, action, when } from '../ui.js';
import Field from '../components/Field.vue';
import AsyncButton from '../components/AsyncButton.vue';
import TopicOutcomeFields from './TopicOutcomeFields.vue';
import { loadCourses, currentCourse, initialTags, syncTopic, topicLabel, NEW } from './courses.js';
import { loadPdfJs, toBase64 } from './pdf.js';
import { pdfPageHasFigure } from './import-materials.js';

const error = ref('');
const emit = defineEmits(['changed']);
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const passages = ref([]);
const tags = reactive({ topicId: null, outcomeId: null, topicName: '', topicWeek: null, outcomeText: '' });
onMounted(async () => {
  try {
    courses.value = await loadCourses();
    course.value = currentCourse();
    syncTopic(course.value);
    if (course.value) {
      passages.value = await api('GET', `/api/teacher/courses/${course.value.id}/passages`);
      Object.assign(tags, initialTags(course.value, { topicId: S.topicId }));
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});

const title = ref('');
const text = ref('');
const confirm = ref(false);
const preview = ref(null);
let origin = 'paste';
function appendText(t, how) {
  text.value = (text.value.trim() ? text.value.trim() + '\n\n' : '') + t.trim();
  origin = how;
  preview.value = null;
}

// The import box shows one of: progress text, an error, the PDF page
// picker, or result notes.
const importBox = ref(null);
async function withProgress(textMsg, fn) {
  importBox.value = { progress: textMsg };
  try {
    return await fn();
  } catch (err) {
    importBox.value = { error: err.message };
    err.shown = true;
    throw err;
  }
}

// --- PDF: extract the text layer in the browser; flag pages without one
const onPdf = action(async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) throw new Error('PDF is larger than 25 MB.');
  const pages = await withProgress('Reading PDF…', async () => {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      // rebuild lines: pdf.js gives text runs with end-of-line markers
      const t = tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
      const scanned = t.length < 30;
      const figure = !scanned && (await pdfPageHasFigure(lib, page));
      // pdf.js objects must not be made reactive (markRaw)
      out.push({ n: i, text: t, page: markRaw(page), scanned, figure, checked: !scanned });
    }
    return out;
  });
  if (!title.value) title.value = file.name.replace(/\.pdf$/i, '').slice(0, 120);
  importBox.value = { pages };
});

// Scanned page: the AI transcription replaces the empty text layer.
// Page with figures: the AI describes the figures, added after the page text.
const transcribePage = (p) => async () => {
  const mode = p.scanned ? 'text' : 'figures';
  const vp = p.page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  await p.page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  // JPEG keeps photo-heavy pages under the server's 4 MB image limit
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const r = await api('POST', `/api/teacher/courses/${course.value.id}/transcribe`, { imageBase64: await toBase64(blob), mimeType: 'image/jpeg', mode });
  if (r.containsPersonalData) toast('The model flagged possible personal data on this page - please check before saving.', true);
  if (mode === 'text') {
    p.text = r.text;
    toast(`Page ${p.n} transcribed - included below when you click "Add selected pages"`);
  } else {
    if (r.text.trim()) p.text += `\n\n[Figure description, AI-generated: check against the original]\n${r.text.trim()}`;
    toast(r.text.trim() ? `Figures on page ${p.n} described - included below when you click "Add selected pages"` : `The AI found no teaching figure on page ${p.n}.`);
  }
  p.figure = false;
  p.checked = true;
};

function addPages() {
  const chosen = importBox.value.pages.filter((p) => p.checked && p.text.trim()).map((p) => p.text);
  appendText(chosen.join('\n\n'), 'pdf');
  importBox.value = { notes: [['note good small', `Added ${chosen.length} page(s) to the text box - review it below.`]] };
}

// --- Image of a scanned page or a diagram -> Gemini -> editable text
const imgInput = ref(null);
const imgMode = ref('text');
async function transcribeImage() {
  const file = imgInput.value.files[0];
  if (!file) throw new Error('Choose an image first.');
  if (file.size > 4 * 1024 * 1024) throw new Error('Image is larger than 4 MB.');
  const mode = imgMode.value;
  const r = await withProgress('Transcribing…', async () => api('POST', `/api/teacher/courses/${course.value.id}/transcribe`, { imageBase64: await toBase64(file), mimeType: file.type, mode }));
  appendText(mode === 'diagram' ? `[Diagram description]\n${r.text}` : r.text, mode === 'diagram' ? 'diagram' : 'scan');
  importBox.value = {
    notes: [
      ['note good small', 'Added the AI transcription to the text box. Check it carefully against the original - it is a suggestion, not a copy.'],
      ...(r.containsPersonalData ? [['note bad small', 'The model flagged possible personal data in this image. Remove it before saving.']] : []),
    ],
  };
}

function showPreview() {
  // Normalise whitespace so the professor sees exactly what gets stored
  const clean = text.value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  text.value = clean;
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  preview.value = {
    clean,
    summary: `${clean.split(/\s+/).filter(Boolean).length} words, ${sentences.length} sentences, about ${Math.max(1, Math.ceil(clean.length / 700))} retrieval chunk(s).`,
    paras: clean.split('\n\n').slice(0, 40),
  };
}

async function savePassage() {
  const body = { title: title.value, text: preview.value.clean, origin, confirmNoPersonalData: confirm.value };
  // a new topic and/or typed learning outcome is created by the server with the passage
  if (tags.topicId === NEW) body.newTopic = { name: tags.topicName, week: tags.topicWeek === '' ? null : tags.topicWeek };
  else body.topicId = tags.topicId;
  if (tags.outcomeId === NEW) body.outcomeText = tags.outcomeText;
  else body.outcomeId = tags.outcomeId;
  const p = await api('POST', `/api/teacher/courses/${course.value.id}/passages`, body);
  if (body.newTopic) {
    await loadCourses(true);
    S.topicId = p.topicId;
    toast(`Passage saved to the new topic ${topicLabel(p.topic)}`);
  } else {
    if (body.outcomeText) await loadCourses(true);
    toast('Passage saved');
  }
  rerender();
}

const deletePassage = (p) => async () => {
  if (!window.confirm(`Delete "${p.title}"? ${p.usedBy ? 'Questions cite this material and will lose access to its text. ' : ''}This cannot be undone.`)) return;
  await api('DELETE', `/api/teacher/passages/${p.id}`);
  toast('Passage deleted');
  rerender();
};
const plainLabel = 'font-weight:400;color:inherit;margin:10px 0';

// ---- weekly topics: which topic's material is shown and uploaded to
const topic = computed(() => course.value?.topics.find((t) => t.id === S.topicId) || null);
async function refresh() {
  passages.value = await api('GET', `/api/teacher/courses/${course.value.id}/passages`);
}

// Uploaded lecture files are listed once per file, collapsed. Versions that
// were replaced or removed stay stored (questions may cite them) but are
// hidden unless asked for. Topic sections keep hand-added material only.
const showReplaced = ref(false);
// The earlier slide/page import saved titles like "deck.pptx — Slide 3" without
// file tracking; AI drafting does not use those, so they are listed as older imports.
const legacyImport = (p) => !p.importHash && (p.origin === 'pptx' || p.origin === 'pdf') && / — (Slide|Page) \d+$/.test(p.title);
const isUpload = (p) => Boolean(p.importHash) || legacyImport(p);
const uploadFiles = computed(() => {
  const files = new Map();
  for (const p of passages.value.filter(isUpload)) {
    const legacy = legacyImport(p);
    const name = p.fileName || p.title.split(legacy ? ' — ' : ' · ')[0];
    const inUse = !legacy && p.attached !== false;
    // One entry for the version in use; replaced versions stay separate.
    const topicId = p.topicId ?? null;
    const key = inUse ? 'in-use:' + topicId + ':' + name : legacy ? 'legacy:' + name + ':' + topicId : 'old:' + (p.documentId || name);
    if (!files.has(key)) files.set(key, { key, name, topicId, inUse, legacy, parts: [], at: 0, usedBy: 0 });
    const f = files.get(key);
    f.parts.push(p);
    f.at = Math.max(f.at, Date.parse(p.createdAt) || p.createdAt || 0);
    f.usedBy += p.usedBy || 0;
  }
  return [...files.values()].sort((a, b) => b.inUse - a.inUse || b.at - a.at);
});
const replacedCount = computed(() => uploadFiles.value.filter((f) => !f.inUse).length);
const manual = (topicId) => passages.value.filter((p) => p.topicId === topicId && !isUpload(p));
// A topic lists the files it uses; the replaced versions are only added when
// the professor asks to see them. Files that are not in a topic yet are
// listed under "Files not in a topic", so they can be moved into one.
const filesIn = (topicId) => uploadFiles.value.filter((f) => f.topicId === topicId && (f.inUse || showReplaced.value));
// topics shown below: the chosen one, or every topic that has material
const shownTopics = computed(() => (topic.value ? [topic.value] : course.value.topics.filter((t) => filesIn(t.id).length || manual(t.id).length)));
// Files uploaded before weekly topics: move each into the week it belongs to
const unsorted = computed(() => filesIn(null));
const moveTo = reactive({});
const moveFile = (f) => async () => {
  const target = course.value.topics.find((t) => t.id === (moveTo[f.key] ?? S.topicId));
  if (!target) throw new Error('Choose a topic first.');
  await api('PUT', `/api/teacher/courses/${course.value.id}/imports`, { passageIds: f.parts.map((p) => p.id), topicId: target.id });
  toast(`Moved ${f.name} to ${topicLabel(target)}`);
  await refresh();
  emit('changed');
};
const fileSummary = (f) => `${f.parts.length} excerpt(s) · ${f.inUse ? 'in use' : f.legacy ? 'older import, not used by AI drafting' : 'replaced or removed'} · uploaded ${when(f.at)} · cited by ${f.usedBy} question(s)`;
const partLabel = (f, p) => p.title.split(f.legacy ? ' — ' : ' · ').slice(1).join(' · ') || p.title;
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <button class="btn small" @click="refresh">Refresh material library</button>
      <div class="panel">
        <h3>Add notes or transcribe images</h3>
        <p class="small muted">Material is stored separately from questions and treated as reference content only: instructions inside it are never followed. Long documents are split into chunks so drafting only uses the relevant parts.</p>
        <Field label="Title" v-slot="{ id }"><input :id="id" v-model="title" type="text" placeholder="e.g. Week 3 notes: protocols" /></Field>
        <div class="row top"><TopicOutcomeFields v-model:topic-id="tags.topicId" v-model:outcome-id="tags.outcomeId" v-model:topic-name="tags.topicName" v-model:topic-week="tags.topicWeek" v-model:outcome-text="tags.outcomeText" :course="course" allow-new /></div>
        <div class="row top" style="margin-bottom: 12px">
          <div class="panel grow" style="margin: 0; min-width: 240px">
            <b>📄 Text-based PDF</b>
            <p class="small muted">Text is extracted in your browser. Scanned pages and pages with figures are detected, and AI can transcribe or describe them.</p>
            <input type="file" accept="application/pdf" @change="onPdf" />
          </div>
          <div class="panel grow" style="margin: 0; min-width: 240px">
            <b>🖼️ Scan or diagram image</b>
            <p class="small muted">{{ course.geminiEnabled ? 'Gemini suggests text; you review it before saving.' : 'Needs GEMINI_API_KEY on the server (no offline OCR).' }}</p>
            <input ref="imgInput" type="file" accept="image/png,image/jpeg,image/webp" />
            <div class="row" style="margin-top: 6px">
              <select v-model="imgMode" style="width: auto" aria-label="Image mode">
                <option value="text">Transcribe text (scanned page)</option>
                <option value="diagram">Describe a diagram</option>
              </select>
              <AsyncButton class="btn" :disabled="!course.geminiEnabled" :run="transcribeImage">Transcribe</AsyncButton>
            </div>
          </div>
        </div>

        <div>
          <template v-if="importBox">
            <p v-if="importBox.progress" class="muted small">{{ importBox.progress }}</p>
            <div v-else-if="importBox.error" class="note bad small">{{ importBox.error }}</div>
            <div v-else-if="importBox.pages" class="panel" style="background: var(--bg)">
              <div class="small muted">{{ importBox.pages.length }} page(s). Untick pages you don't want (e.g. title or reference pages).</div>
              <div v-for="p in importBox.pages" :key="p.n" class="opt-row small">
                <input v-model="p.checked" type="checkbox" :aria-label="`Include page ${p.n}`" />
                <span class="grow">Page {{ p.n }}: <span v-if="p.scanned" class="badge draft">no text layer - looks scanned</span><template v-else>{{ `${p.text.length} characters - "${p.text.slice(0, 70)}…"` }} <span v-if="p.figure" class="badge draft">has a figure</span></template></span>
                <AsyncButton v-if="p.scanned || p.figure" class="btn small" :disabled="!course.geminiEnabled" :title="course.geminiEnabled ? '' : 'Needs GEMINI_API_KEY on the server'" :run="transcribePage(p)">{{ p.scanned ? 'Transcribe with AI' : 'Describe figures with AI' }}</AsyncButton>
              </div>
              <button class="btn primary small" style="margin-top: 8px" @click="addPages">Add selected pages</button>
            </div>
            <template v-else-if="importBox.notes">
              <div v-for="([cls, msg], i) in importBox.notes" :key="i" :class="cls">{{ msg }}</div>
            </template>
          </template>
        </div>

        <Field label="Text" v-slot="{ id }">
          <textarea :id="id" v-model="text" rows="10" placeholder="Paste lecture notes here, or import a PDF / image below. Only use material you are authorised to use, and no student information." @input="preview = null"></textarea>
          <span class="small muted">{{ text.length }} / 100000</span>
        </Field>
        <button class="btn" @click="showPreview">Preview</button>
        <div>
          <div v-if="preview" class="panel" style="background: var(--bg)">
            <h3>Preview</h3>
            <p class="small muted">{{ preview.summary }}</p>
            <div style="max-height: 320px; overflow: auto">
              <p v-for="(para, i) in preview.paras" :key="i" style="white-space: pre-wrap">{{ para }}</p>
            </div>
            <label :style="plainLabel"><input v-model="confirm" type="checkbox" /> I confirm this is authorised course material and contains no student personal data.</label>
            <AsyncButton class="btn primary" :run="savePassage">Save passage</AsyncButton>
          </div>
        </div>
      </div>

      <label v-if="replacedCount" :style="plainLabel"><input v-model="showReplaced" type="checkbox" /> Show {{ replacedCount }} replaced, removed or older import(s), kept for question history</label>
      <div v-for="t in shownTopics" :key="t.id" class="panel">
        <h3>{{ topicLabel(t) }} <span class="badge plain">{{ filesIn(t.id).filter((f) => f.inUse).length }} file(s)</span> <span v-if="manual(t.id).length" class="badge plain">{{ manual(t.id).length }} passage(s)</span></h3>
        <p v-if="!filesIn(t.id).length && !manual(t.id).length" class="small muted">No material in this topic yet.</p>
        <details v-for="f in filesIn(t.id)" :key="f.key" style="margin: 8px 0">
          <summary><b>{{ f.name }}</b> <span class="small muted">· {{ fileSummary(f) }}</span></summary>
          <details v-for="p in f.parts" :key="p.id" style="margin: 6px 0 6px 16px">
            <summary>{{ partLabel(f, p) }} <span class="small muted">· {{ p.text.length }} chars · cited by {{ p.usedBy }}</span></summary>
            <p class="small" style="white-space: pre-wrap; margin-top: 6px; max-height: 240px; overflow: auto">{{ p.text }}</p>
          </details>
        </details>
        <details v-for="p in manual(t.id)" :key="p.id" style="margin: 8px 0">
          <summary><b>{{ p.title }}</b> <span class="small muted">{{ `· ${t.outcomes.find((o) => o.id === p.outcomeId)?.text || 'no learning outcome'} · ${p.text.length} chars${p.origin && p.origin !== 'paste' ? ' · from ' + p.origin : ''} · cited by ${p.usedBy} question(s)` }}</span></summary>
          <p class="small" style="white-space: pre-wrap; margin-top: 6px; max-height: 240px; overflow: auto">{{ p.text }}</p>
          <AsyncButton class="btn small bad" :run="deletePassage(p)">Delete passage</AsyncButton>
        </details>
      </div>
      <div v-if="unsorted.length" class="panel" style="border-color: var(--warn)">
        <h3>Files not in a topic <span class="badge draft">{{ unsorted.length }}</span></h3>
        <p class="small muted">Uploaded before weekly topics. Move each file into the week it was taught, so its topic's knowledge report uses it. Existing reports and questions are kept.</p>
        <div v-for="f in unsorted" :key="f.key" class="unsorted-file">
          <details class="grow">
            <summary><b>{{ f.name }}</b> <span class="small muted">· {{ fileSummary(f) }}</span></summary>
            <details v-for="p in f.parts" :key="p.id" style="margin: 6px 0 6px 16px">
              <summary>{{ partLabel(f, p) }} <span class="small muted">· {{ p.text.length }} chars</span></summary>
              <p class="small" style="white-space: pre-wrap; margin-top: 6px; max-height: 240px; overflow: auto">{{ p.text }}</p>
            </details>
          </details>
          <div v-if="f.inUse && !f.legacy" class="row">
            <select :value="moveTo[f.key] ?? S.topicId" @change="moveTo[f.key] = $event.target.value" style="width: auto; max-width: 100%" :aria-label="`Topic for ${f.name}`">
              <option value="" disabled>Move to topic…</option>
              <option v-for="t in course.topics" :key="t.id" :value="t.id">{{ topicLabel(t) }}</option>
            </select>
            <AsyncButton class="btn small" :disabled="!(moveTo[f.key] ?? S.topicId)" :run="moveFile(f)">Move</AsyncButton>
          </div>
        </div>
      </div>
    </template>
  </template>
</template>
