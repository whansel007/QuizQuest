<script setup>
// ---------- the editor: one form, fields depend on the format ----------
import { ref, reactive, computed, watch } from 'vue';
import { S, api, rerender } from '../api.js';
import { toast } from '../ui.js';
import Field from '../components/Field.vue';
import MarkdownEditor from '../components/MarkdownEditor.vue';
import AsyncButton from '../components/AsyncButton.vue';
import QuestionDetails from './QuestionDetails.vue';
import {QUESTION_TYPES,QUESTION_LABELS} from './question-types.js';
import { initialTags } from './courses.js';

const props = defineProps({
  course: { type: Object, required: true },
  passages: { type: Array, required: true },
  q: { type: Object, default: null },
});
const emit = defineEmits(['close']);
const { course, passages, q } = props;

const openedAt = Date.now(); // preparation-time metric
const v = q ? q.latest : { type: 'mcq', stem: '', options: ['', '', '', ''], answerIndex: 0, explanation: '', difficulty: 'medium', sourceIds: [] };
// a new question starts in the selected weekly topic
const initial = initialTags(course, q || { topicId: S.topicId });
const initialTopic = course.topics.find(t=>t.id===initial.topicId);
const tags = reactive({...initial, topicText:initialTopic?.name || '', learningOutcome:initialTopic?.outcomes.find(o=>o.id===initial.outcomeId)?.text || ''});
const formats = [...QUESTION_TYPES];
if (q && !formats.includes(v.type)) formats.push(v.type);
const saving = ref(false);
const preview = computed(()=>payload());
const type = ref(v.type || 'mcq');
const stem = ref(v.stem);
const expl = ref(v.explanation);
const diff = ref(v.difficulty);
const sourceIds = ref(passages.filter((p) => v.sourceIds.includes(p.id)).map((p) => p.id));
const checkOut = ref(null);
const attempted = ref(false);
const fieldErrors = computed(()=>({
  stem: stem.value.trim().length<10 ? 'Enter at least 10 characters.' : stem.value.trim().length>600 ? 'Use at most 600 characters.' : '',
  explanation: !expl.value.trim() ? 'Explain why the answer is correct.' : expl.value.trim().length>1500 ? 'Use at most 1,500 characters.' : '',
  topic: !tags.topicText.trim() ? 'Enter a topic.' : '',
  outcome: !tags.learningOutcome.trim() ? 'Enter a learning outcome.' : '',
  options: ['mcq','multi'].includes(type.value) && st.value.options.some(o=>!o.text.trim()) ? 'Complete every option.' : type.value==='multi' && st.value.options.filter(o=>o.right).length<2 ? 'Select at least two correct options.' : ''
}));

const willVersion = q && q.versions.at(-1).publishedAt;
const frozenTags = q && q.versions.some((x) => x.publishedAt || x.attempts);
const tagTitle = frozenTags ? 'Published tags are fixed to preserve history. Create a new question to change the learning outcome.' : null;

// --- per-type state, rebuilt from the saved version when the format changes
let seq = 0;
const radioName = 'q-' + Math.random().toString(36).slice(2);
function freshState(t) {
  if (t === 'mcq' || t === 'multi') {
    const multi = t === 'multi';
    const correct = multi ? new Set(v.answerIndexes || []) : new Set([v.answerIndex ?? 0]);
    const start = v.options && (v.type === 'mcq' || v.type === 'multi') ? v.options : ['', '', '', ''];
    return { options: start.map((text, i) => ({ key: seq++, text, right: correct.has(i) })) };
  }
  if (t === 'tf') return { answerIndex: v.answerIndex ?? 0 };
  if (t === 'numeric') return { answer: String(v.answer ?? ''), tolerance: String(v.tolerance ?? 0), unit: v.unit || '' };
  if (t === 'short') return { modelAnswer: v.modelAnswer || '', keyPoints: (v.keyPoints || []).join('\n'),answerMode:v.answerMode || 'text',answer:String(v.answer??''),tolerance:String(v.tolerance??0),unit:v.unit || '' };
  if (t === 'param') {
    return {
      variables: (v.variables?.length ? v.variables : [{ name: 'a', min: 1, max: 10, step: 1 }]).map((x) => ({ key: seq++, name: String(x.name), min: String(x.min), max: String(x.max), step: String(x.step) })),
      answerExpr: v.answerExpr || '',
      distractors: (v.distractorExprs || []).join('\n'),
      constraint: v.constraint || '',
      decimals: String(v.decimals ?? 2),
      unit: v.unit || '',
    };
  }
  return {};
}
const st = ref(freshState(type.value));
watch(type, (t) => {
  st.value = freshState(t);
  checkOut.value = null;
});
const recoveryKey=`qq-editor:${S.me.id}:${course.id}:${q?.id||'new'}:${q?.latest.v||0}:${q?.latest.editedAt||0}`;
const recovery=ref(null),recoveryError=ref('');
try {recovery.value=JSON.parse(sessionStorage.getItem(recoveryKey));}catch{}
watch([type,stem,expl,diff,sourceIds,tags,st],()=>{
  try {sessionStorage.setItem(recoveryKey,JSON.stringify({type:type.value,stem:stem.value,expl:expl.value,diff:diff.value,sourceIds:sourceIds.value,tags,st:st.value}));}
  catch {recoveryError.value='Browser recovery storage is unavailable. Save your draft before leaving this view.';}
},{deep:true});
function restoreEdit(){
  const r=recovery.value;
  type.value=r.type;stem.value=r.stem;expl.value=r.expl;diff.value=r.diff;sourceIds.value=r.sourceIds;Object.assign(tags,r.tags);
  // Let the format watcher finish before restoring its type-specific fields.
  queueMicrotask(()=>{st.value=r.st;seq=Math.max(seq,...(r.st.options||r.st.variables||[]).map(x=>x.key+1));});
  recovery.value=null;
}
function discardRecovery(){try{sessionStorage.removeItem(recoveryKey);}catch{}recovery.value=null;}

// single-answer options behave like a radio group
function pickRight(i) {
  st.value.options.forEach((o, j) => (o.right = i === j));
}
const addOption = (multi) => st.value.options.length < (multi ? 6 : 5) && st.value.options.push({ key: seq++, text: '', right: false });
const removeOption = (i) => st.value.options.length > 3 && st.value.options.splice(i, 1);
const addVar = () => st.value.variables.push({ key: seq++, name: '', min: '1', max: '10', step: '1' });

function readType() {
  const s = st.value;
  const t = type.value;
  if (t === 'mcq') return { options: s.options.map((o) => o.text), answerIndex: s.options.findIndex((o) => o.right) };
  if (t === 'multi') return { options: s.options.map((o) => o.text), answerIndexes: s.options.map((o, i) => (o.right ? i : -1)).filter((i) => i >= 0) };
  if (t === 'tf') return { answerIndex: s.answerIndex };
  // empty box -> null (not 0), so the server rejects a missing answer
  if (t === 'numeric') return { answer: s.answer.trim() === '' ? null : Number(s.answer), tolerance: Number(s.tolerance || 0), unit: s.unit };
  if (t === 'short') return { modelAnswer: s.modelAnswer, keyPoints: s.keyPoints.split('\n').map((x) => x.trim()).filter(Boolean),...(s.answerMode==='numeric'?{answerMode:'numeric',answer:s.answer.trim()===''?null:Number(s.answer),tolerance:Number(s.tolerance||0),unit:s.unit}:{}) };
  if (t === 'param') {
    return {
      variables: s.variables.map((x) => ({ name: x.name.trim(), min: Number(x.min), max: Number(x.max), step: Number(x.step) })),
      answerExpr: s.answerExpr,
      distractorExprs: s.distractors.split('\n').map((x) => x.trim()).filter(Boolean),
      constraint: s.constraint,
      decimals: Number(s.decimals),
      unit: s.unit,
    };
  }
  return {};
}

const payload = () => ({
  type: type.value,
  topicText: tags.topicText,
  learningOutcome: tags.learningOutcome,
  topicId: tags.topicId,
  outcomeId: tags.outcomeId,
  stem: stem.value,
  explanation: expl.value,
  difficulty: diff.value,
  sourceIds: sourceIds.value,
  ...readType(),
  prepSeconds: (Date.now() - openedAt) / 1000,
});

async function check() {
  attempted.value=true;
  checkOut.value = await api('POST', `/api/teacher/courses/${course.id}/questions/check`, { ...payload(), id: q?.id });
}
const save = (publish) => async () => {
  if(saving.value) return;
  saving.value=true;
  try {
    await check();
    if(checkOut.value.errors.length) return;
    if(!tags.topicText.trim() || !tags.learningOutcome.trim()) {checkOut.value.errors.push('Enter a topic and learning outcome.'); return;}
    if (q) await api('PUT', `/api/teacher/questions/${q.id}`, payload());
    else await api('POST', `/api/teacher/courses/${course.id}/questions`, { ...payload(), publish });
    toast('Saved');
    try {sessionStorage.removeItem(recoveryKey);}catch{}
    rerender();
  } finally { saving.value=false; }
};
const stemLabel = computed(() => (type.value === 'tf' ? 'Statement' : 'Question'));
const plainLabel = 'font-weight:400;color:inherit';
</script>

<template>
  <section class="panel question-editor" aria-label="Question editor">
    <h3>{{ q ? 'Edit question' : 'New question' }}</h3>
    <div v-if="recovery" class="note">An unsaved edit is available in this tab. <button class="btn small" @click="restoreEdit">Restore unsaved edit</button> <button class="btn small" @click="discardRecovery">Discard saved edit</button></div>
    <p v-if="recoveryError" class="note warn">{{recoveryError}}</p>
    <div v-if="willVersion" class="note small">This version has been published, so saving creates v{{ q.latest.v + 1 }}. Attempts on earlier versions are kept as they were.</div>
    <div class="row top">
      <Field label="Topic" v-slot="{id}"><input :id="id" v-model="tags.topicText" type="text" maxlength="160" :disabled="!!frozenTags" :title="tagTitle" :aria-invalid="attempted && !!fieldErrors.topic" /><small v-if="attempted && fieldErrors.topic" class="field-error">{{fieldErrors.topic}}</small></Field>
      <Field label="Learning outcome" v-slot="{id}"><textarea :id="id" v-model="tags.learningOutcome" :aria-invalid="attempted && !!fieldErrors.outcome" maxlength="2000" rows="2" :disabled="!!frozenTags" :title="tagTitle"></textarea><small v-if="attempted && fieldErrors.outcome" class="field-error">{{fieldErrors.outcome}}</small></Field>
      <Field label="Format" v-slot="{ id }">
        <select :id="id" v-model="type">
          <option v-for="t in formats" :key="t" :value="t">{{ QUESTION_LABELS[t] || course.formats.labels[t] }}</option>
        </select>
      </Field>
    </div>
    <MarkdownEditor v-model="stem" :label="stemLabel" :rows="6" :maxlength="600" :invalid="attempted && !!fieldErrors.stem" :error="attempted ? fieldErrors.stem : ''" />

    <div>
      <!-- single answer / select all -->
      <div v-if="type === 'mcq' || type === 'multi'">
        <label>{{ type === 'multi' ? 'Options (tick every correct one)' : 'Options (select the correct one)' }}</label>
        <div>
          <div v-for="(o, i) in st.options" :key="o.key" class="opt-row">
            <input v-if="type === 'multi'" v-model="o.right" type="checkbox" :name="radioName" :aria-label="'Option '+(i+1)+' is correct'" />
            <input v-else type="radio" :name="radioName" :checked="o.right" :aria-label="'Option '+(i+1)+' is correct'" @change="pickRight(i)" />
            <textarea v-model="o.text" rows="2" :aria-label="'Option '+(i+1)"></textarea>
            <button class="btn small" :aria-label="'Remove option '+(i+1)" :disabled="st.options.length<=3" @click="removeOption(i)">&times;</button>
          </div>
        </div>
        <p v-if="attempted && fieldErrors.options" class="field-error">{{fieldErrors.options}}</p>
        <button class="btn small" style="margin-bottom: 10px" @click="addOption(type === 'multi')">+ option</button>
      </div>
      <!-- true / false -->
      <div v-else-if="type === 'tf'" class="field">
        <label>The statement is…</label>
        <label v-for="(label, i) in ['True', 'False']" :key="label" style="font-weight: 400; color: inherit; margin-right: 16px; display: inline">
          <input v-model="st.answerIndex" type="radio" :name="radioName" :value="i" /> {{ label }}
        </label>
      </div>
      <!-- numeric -->
      <div v-else-if="type === 'numeric'" class="row top">
        <Field label="Correct answer" v-slot="{ id }"><input :id="id" v-model="st.answer" type="text" /></Field>
        <Field label="Accepted ± tolerance" v-slot="{ id }"><input :id="id" v-model="st.tolerance" type="text" /></Field>
        <Field label="Unit" v-slot="{ id }"><input :id="id" v-model="st.unit" type="text" placeholder="e.g. ms, kg (optional)" /></Field>
      </div>
      <!-- short answer -->
      <div v-else-if="type === 'short'">
        <Field label="Answer grading" v-slot="{id}"><select :id="id" v-model="st.answerMode"><option value="text">Text: key points</option><option value="numeric">Numerical: answer and tolerance</option></select></Field>
        <div v-if="st.answerMode==='numeric'" class="row top"><Field label="Numerical short answer" v-slot="{id}"><input :id="id" v-model="st.answer" type="text" /></Field><Field label="Accepted tolerance" v-slot="{id}"><input :id="id" v-model="st.tolerance" type="text" /></Field><Field label="Answer unit" v-slot="{id}"><input :id="id" v-model="st.unit" type="text" /></Field></div>
        <Field label="Model answer (shown to students after they answer)" v-slot="{ id }"><textarea :id="id" v-model="st.modelAnswer" rows="2"></textarea></Field>
        <Field label="Key points a good answer must cover (one per line, 1-6)" v-slot="{ id }"><textarea :id="id" v-model="st.keyPoints" rows="3" placeholder="One key point per line"></textarea></Field>
        <p v-if="st.answerMode==='numeric'" class="small muted">Numerical responses are checked locally against the answer and tolerance. Professor marking remains available.</p>
        <p v-else class="small muted">{{ course.geminiEnabled ? 'Answers are graded by Gemini against these key points (provisional; you can override in Analytics → Answers to mark).' : 'Without Gemini, answers are graded by keyword coverage of these key points (provisional; you can override in Analytics → Answers to mark).' }}</p>
      </div>
      <!-- maths variation -->
      <div v-else-if="type === 'param'">
        <p class="small muted">Write the question with placeholders like {a}. Each student gets fresh values; the server computes the answer and the distractors. Allowed: + - * / ^ ( ), sqrt, abs, round, min, max, floor, ceil. The explanation may use {answer} and the variables.</p>
        <label>Variables (name, min, max, step)</label>
        <div>
          <div v-for="(x, i) in st.variables" :key="x.key" class="opt-row">
            <input v-for="k in ['name', 'min', 'max', 'step']" :key="k" v-model="x[k]" type="text" :placeholder="k" :aria-label="k" style="max-width: 110px" />
            <button class="btn small" @click="st.variables.splice(i, 1)">✕</button>
          </div>
        </div>
        <button class="btn small" style="margin-bottom: 10px" @click="addVar">+ variable</button>
        <Field label="Answer formula" v-slot="{ id }"><input :id="id" v-model="st.answerExpr" type="text" placeholder="e.g. (a + b) / 2" /></Field>
        <Field label="Distractor formulas (2-4)" v-slot="{ id }"><textarea :id="id" v-model="st.distractors" rows="3" placeholder="One formula per line, each modelling a common mistake, e.g. a + b"></textarea></Field>
        <div class="row top">
          <Field class="grow" label="Constraint" v-slot="{ id }"><input :id="id" v-model="st.constraint" type="text" placeholder="optional, e.g. a != b && b > 0" /></Field>
          <Field label="Decimals" v-slot="{ id }"><input :id="id" v-model="st.decimals" type="text" style="max-width: 80px" /></Field>
          <Field label="Unit" v-slot="{ id }"><input :id="id" v-model="st.unit" type="text" style="max-width: 120px" /></Field>
        </div>
      </div>
    </div>

    <MarkdownEditor v-model="expl" label="Explanation shown after answering" :rows="5" :maxlength="1500" :invalid="attempted && !!fieldErrors.explanation" :error="attempted ? fieldErrors.explanation : ''" />
    <div class="row top">
      <Field label="Intended difficulty" v-slot="{ id }">
        <select :id="id" v-model="diff"><option v-for="d in ['easy', 'medium', 'hard']" :key="d" :value="d">{{ d }}</option></select>
      </Field>
      <details class="field grow advanced-options">
        <summary>Advanced: source passages</summary>
        <template v-if="passages.length">
          <label v-for="p in passages" :key="p.id" :style="plainLabel"><input v-model="sourceIds" type="checkbox" :value="p.id" /> {{ p.title }}</label>
        </template>
        <span v-else class="small muted">No passages yet. Manual questions do not require a report.</span>
      </details>
    </div>

    <p class="small muted">Markdown and fenced code are supported. Use Preview to check formatting.</p>
    <details class="editor-preview"><summary>Preview question</summary><QuestionDetails :value="preview" /></details>
    <div v-if="checkOut" role="status" aria-live="polite">
      <div v-if="checkOut.errors.length" class="note bad small"><b>Fix before saving: </b>{{ checkOut.errors.join(' ') }}</div>
      <div v-else class="note good small">Structure checks pass.</div>
      <div v-if="checkOut.warnings.length" class="note warn small">{{ checkOut.warnings.join(' ') }}</div>
      <div v-if="checkOut.samples?.length" class="panel" style="background: var(--bg)">
        <div class="small muted">Sample variations students could get:</div>
        <div v-for="(s, i) in checkOut.samples" :key="i" style="margin-top: 8px">
          <div style="font-weight: 600">{{ s.stem }}</div>
          <div class="small">{{ s.options.map((o, j) => (j === s.answerIndex ? `[${o} ✓]` : o)).join('   ·   ') }}</div>
        </div>
      </div>
    </div>
    <div class="row">
      <AsyncButton class="btn" :run="check">Check</AsyncButton>
      <AsyncButton v-if="q" class="btn primary" :disabled="saving" :run="save(false)">Save</AsyncButton>
      <template v-else>
        <AsyncButton class="btn" :disabled="saving" :run="save(false)">Save as draft</AsyncButton>
        <AsyncButton class="btn primary" :disabled="saving" :run="save(true)">Save &amp; publish</AsyncButton>
      </template>
      <button class="btn" @click="emit('close')">Cancel</button>
    </div>
  </section>
</template>

<style scoped>
.field-error { color:var(--bad,#a32b38); display:block; margin-top:4px; }
.question-editor { border-color:var(--accent); min-width:0; }
.question-editor .row.top { display:flex; flex-wrap:wrap; gap:16px; }
.question-editor .row.top > .field { flex:1 1 210px; min-width:0; }
.question-editor textarea { width:100%; resize:vertical; }
.opt-row { display:flex; align-items:flex-start; gap:10px; margin:8px 0; }
.opt-row textarea { flex:1; min-width:0; }
.opt-row input[type=radio], .opt-row input[type=checkbox] { margin-top:12px; }
.advanced-options, .editor-preview { padding:12px 0; }
summary { cursor:pointer; font-weight:600; }
@media(max-width:600px) { .opt-row { flex-wrap:wrap; } .opt-row textarea { flex-basis:70%; } }
</style>
