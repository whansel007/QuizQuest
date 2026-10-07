<script setup>
// ============================================================
// Source material: paste, PDF, scans & diagrams
// ============================================================
import { ref, reactive, markRaw, onMounted } from 'vue';
import { api, rerender } from '../api.js';
import { toast, action } from '../ui.js';
import Heading from '../components/Heading.vue';
import Field from '../components/Field.vue';
import AsyncButton from '../components/AsyncButton.vue';
import CoursePicker from './CoursePicker.vue';
import TopicOutcomeFields from './TopicOutcomeFields.vue';
import { loadCourses, currentCourse, initialTags } from './courses.js';
import { loadPdfJs, toBase64 } from './pdf.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const passages = ref([]);
const tags = reactive({ topicId: null, outcomeId: null });
onMounted(async () => {
  try {
    courses.value = await loadCourses();
    course.value = currentCourse();
    if (course.value) {
      passages.value = await api('GET', `/api/teacher/courses/${course.value.id}/passages`);
      Object.assign(tags, initialTags(course.value));
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
      // pdf.js objects must not be made reactive (markRaw)
      out.push({ n: i, text: t, page: markRaw(page), scanned, checked: !scanned });
    }
    return out;
  });
  if (!title.value) title.value = file.name.replace(/\.pdf$/i, '').slice(0, 120);
  importBox.value = { pages };
});

const transcribePage = (p) => async () => {
  const vp = p.page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  await p.page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const r = await api('POST', `/api/teacher/courses/${course.value.id}/transcribe`, { imageBase64: await toBase64(blob), mimeType: 'image/png', mode: 'text' });
  p.text = r.text;
  p.checked = true;
  if (r.containsPersonalData) toast('The model flagged possible personal data on this page - please check before saving.', true);
  toast(`Page ${p.n} transcribed - included below when you click "Add selected pages"`);
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
  const defs = sentences.filter((s) => /^(?:(?:A|An|The)\s+)?[A-Za-z0-9][A-Za-z0-9\- ]{0,40}?\s+(is|are|means)\s+/.test(s));
  preview.value = {
    clean,
    summary: `${clean.split(/\s+/).filter(Boolean).length} words, ${sentences.length} sentences, about ${Math.max(1, Math.ceil(clean.length / 700))} retrieval chunk(s). ${defs.length} definition-style sentence(s) found (the offline drafter uses these).`,
    paras: clean.split('\n\n').slice(0, 40),
  };
}

async function savePassage() {
  await api('POST', `/api/teacher/courses/${course.value.id}/passages`, { title: title.value, topicId: tags.topicId, outcomeId: tags.outcomeId, text: preview.value.clean, origin, confirmNoPersonalData: confirm.value });
  toast('Passage saved');
  rerender();
}

const deletePassage = (p) => async () => {
  await api('DELETE', `/api/teacher/passages/${p.id}`);
  toast('Passage deleted');
  rerender();
};
const plainLabel = 'font-weight:400;color:inherit;margin:10px 0';
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <Heading title="Source material"><CoursePicker :courses="courses" /></Heading>
      <div class="panel">
        <h3>Add material</h3>
        <p class="small muted">Material is stored separately from questions and treated as reference content only: instructions inside it are never followed. Long documents are split into chunks so drafting only uses the relevant parts.</p>
        <Field label="Title" v-slot="{ id }"><input :id="id" v-model="title" type="text" placeholder="e.g. Week 3 notes: protocols" /></Field>
        <div class="row top"><TopicOutcomeFields v-model:topic-id="tags.topicId" v-model:outcome-id="tags.outcomeId" :course="course" /></div>
        <div class="row top" style="margin-bottom: 12px">
          <div class="panel grow" style="margin: 0; min-width: 240px">
            <b>📄 Text-based PDF</b>
            <p class="small muted">Text is extracted in your browser. Scanned pages are detected and can be transcribed.</p>
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
                <span class="grow">Page {{ p.n }}: <span v-if="p.scanned" class="badge draft">no text layer - looks scanned</span><template v-else>{{ `${p.text.length} characters - "${p.text.slice(0, 70)}…"` }}</template></span>
                <AsyncButton v-if="p.scanned" class="btn small" :disabled="!course.geminiEnabled" :title="course.geminiEnabled ? '' : 'Needs GEMINI_API_KEY on the server'" :run="transcribePage(p)">Transcribe with AI</AsyncButton>
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

      <div v-for="t in course.topics" :key="t.id" class="panel">
        <h3>{{ t.name }} <span class="badge plain">{{ passages.filter((p) => p.topicId === t.id).length }} passage(s)</span></h3>
        <details v-for="p in passages.filter((x) => x.topicId === t.id)" :key="p.id" style="margin: 8px 0">
          <summary><b>{{ p.title }}</b> <span class="small muted">{{ `· ${t.outcomes.find((o) => o.id === p.outcomeId)?.text} · ${p.text.length} chars${p.origin && p.origin !== 'paste' ? ' · from ' + p.origin : ''} · cited by ${p.usedBy} question(s)` }}</span></summary>
          <p class="small" style="white-space: pre-wrap; margin-top: 6px; max-height: 240px; overflow: auto">{{ p.text }}</p>
          <AsyncButton class="btn small bad" :run="deletePassage(p)">Delete passage</AsyncButton>
        </details>
      </div>
    </template>
  </template>
</template>
