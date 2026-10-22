<script setup>
import {QUESTION_TYPES,QUESTION_LABELS} from './question-types.js';
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { S, api as request, setTab, reqId } from '../api.js';
import ImportMaterials from './ImportMaterials.vue';
import MarkdownEditor from '../components/MarkdownEditor.vue';
import { initialTags, topicLabel } from './courses.js';
import { draftStore } from './authoring-draft.js';
import { when } from '../ui.js';
import { suggestAssessment, sourceSummary } from './report-suggestions.mjs';
// topic: the weekly topic whose files, reports and questions this works on
const props = defineProps({ course: Object, topic: { type: Object, required: true }, target: Object });
// These endpoints acknowledge durable jobs; inference runs in the background.
// A lost response must release the UI while keeping the same recovery identity.
const api = (method, url, data) => request(method, url, data, { timeout: 30000 });
const attachments = ref({materialIds:[],names:{},pending:false,busy:false,ready:false});
const jobs = ref([]), reportId = ref(''), review = ref(''), baseRevision = ref(0), error = ref(''), busy = ref(false), hasMaterial = ref(false);
const types = QUESTION_TYPES;
const typeLabels=QUESTION_LABELS;
const config = reactive({ ...initialTags(props.course, { topicId: props.topic.id }), learningOutcome:'',assessmentStyle:'both',quantities: { mcq: 5, tf: 0, short: 0, multi: 0 } });
function applyTarget(t) {
  if(!t) return;
  const outcome=props.topic.outcomes.find(x=>x.id===t.outcomeId);
  if(outcome) config.learningOutcome=outcome.text;
  if(t.count)config.quantities={...Object.fromEntries(types.map(type=>[type,0])),mcq:t.count};
}
// This topic's reports; reports made before weekly topics (from every file
// of the course) stay available as "older" ones.
const reports = computed(() => jobs.value.filter((j) => j.kind === 'analysis' && j.input.reportBased && j.input.topicId === props.topic.id));
const olderReports = computed(() => jobs.value.filter((j) => j.kind === 'analysis' && j.input.reportBased && !j.input.topicId));
const report = computed(() => [...reports.value, ...olderReports.value].find((j) => j.id === reportId.value));
// A running job may belong to another topic of the course
const jobTopic = (j) => props.course.topics.find((t) => t.id === j.input.topicId);
const current = computed(() => [...jobs.value].reverse().find((j) => ['queued','running'].includes(j.status)) || (['failed','interrupted'].includes(jobs.value.at(-1)?.status) ? jobs.value.at(-1) : null));
const generation = computed(() => [...jobs.value].reverse().find((j) => j.kind === 'generation' && j.input.analysisId === reportId.value && j.input.topicId === props.topic.id));
const running = computed(() => busy.value || jobs.value.some((j) => ['queued','running'].includes(j.status)));
const dirty = computed(() => !!report.value && review.value.trim() !== (report.value.reviewedText || ''));
const saved = computed(() => report.value?.reportSourceId && !dirty.value && baseRevision.value === report.value.reportRevision);
const total = computed(() => types.reduce((a,type) => a + (Number(config.quantities[type]) || 0),0));
const validCounts = computed(() => total.value >= 1 && total.value <= 10 && types.every(type => Number.isInteger(config.quantities[type]) && config.quantities[type] >= 0 && config.quantities[type] <= 10));
const pendingGeneration=ref(null), notice=ref('');
// Says why Generate questions is disabled instead of leaving a silent grey button.
const generateBlocked = computed(() =>
  running.value ? 'Wait for the current step to finish.'
  : pendingGeneration.value ? 'Retry or check the pending generation request above first.'
  : !saved.value ? (dirty.value ? 'Save your report changes first.' : 'Load the latest saved report first.')
  : !config.learningOutcome.trim() ? 'Enter a learning outcome.'
  : !validCounts.value ? 'Choose whole-number quantities totalling 1–10 questions.'
  : '');
const sameIds = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
// Which files a report was made from, and whether that differs from what is attached now.
const reportSources = computed(() => report.value ? sourceSummary(report.value.input.passageIds, attachments.value.names) : '');
const reportOutdated = computed(() => report.value?.status === 'complete' && report.value.input.topicId && attachments.value.ready && !attachments.value.pending
  && attachments.value.materialIds.length > 0 && !sameIds(report.value.input.passageIds, attachments.value.materialIds));
const reportLabel = (j) => { const files = [...new Set(j.input.passageIds.map((id) => attachments.value.names[id]).filter(Boolean))];
  return when(j.at) + (files.length ? ' · ' + files[0] + (files.length > 1 ? ` +${files.length - 1} more` : '') : ''); };
// Fills only an empty outcome, from the saved report's learning objectives.
const suggested = ref({ topic: '', outcome: '' });
function suggestFromReport() {
  if (report.value?.status !== 'complete') return;
  suggested.value = suggestAssessment(report.value.reviewedText || report.value.result.markdown || '');
  if (!config.learningOutcome.trim() && suggested.value.outcome) config.learningOutcome = suggested.value.outcome;
}
const usingSuggestion = computed(() => suggested.value.outcome && config.learningOutcome === suggested.value.outcome);
const attemptKey=`generation-attempt:${S.me.id}:${props.course.id}`;
const key = `report-workflow:${S.me.id}:${props.course.id}:${props.topic.id}`, path = `/api/teacher/courses/${props.course.id}`;
let timer, refreshing, disposed = false, restoring = true, loadedId = '';
function loadEditor() {
  if (!report.value || report.value.status !== 'complete') return;
  review.value = report.value.reviewedText || report.value.result.markdown || '';
  baseRevision.value = report.value.reportRevision || 0;
  loadedId = reportId.value;
  suggestFromReport();
}
async function refresh() {
  if (disposed) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const data = await api('GET', path + '/authoring');
    if (disposed) return;
    jobs.value = data;
    if(pendingGeneration.value && data.some(j=>j.input.attemptId===pendingGeneration.value.attemptId)) {
      pendingGeneration.value=null;
      try {await draftStore(attemptKey,null);} catch {error.value='The generation request was received, but browser recovery storage could not be updated. Refresh progress before retrying.';}
      notice.value='Generation request received. Progress and saved drafts are shown below.';
    }
    if (!report.value) reportId.value = reports.value.at(-1)?.id || '';
    if (loadedId !== reportId.value && report.value?.status === 'complete') loadEditor();
  })();
  try { await refreshing; } finally { refreshing = null; }
}
async function poll() {
  try { await refresh(); }
  catch (e) { if (!disposed) error.value = e.message + ' Your saved work remains available. Refresh progress to reconnect.'; return; }
  schedulePoll();
}
function schedulePoll() {
  clearTimeout(timer);
  if (!disposed && jobs.value.some((j) => ['queued','running'].includes(j.status))) timer = setTimeout(poll,2500);
}
onMounted(async () => {
  try {
    pendingGeneration.value=await draftStore(attemptKey) || null;
    const draft = await draftStore(key);
    if (draft) {
      Object.assign(config,draft.config); reportId.value = draft.reportId || ''; review.value = draft.review || '';
      if(config.quantities.numeric || config.quantities.param) error.value='Previous numeric and maths-variation counts were cleared. Set quantities using the four supported types; numerical answers can use Short Answer.';
      config.quantities=Object.fromEntries(types.map(type=>[type,config.quantities[type] || 0]));
      baseRevision.value = draft.baseRevision || 0; loadedId = draft.loadedId || '';
      delete config.topicText; // the topic is now the selected weekly topic
      if(draft.config.learningOutcome===undefined) config.learningOutcome=draft.config.learningGoals || props.topic.outcomes.find(o=>o.id===config.outcomeId)?.text || '';
    }
  } catch { error.value = 'Browser recovery storage is unavailable. Save your report before leaving this page.'; }
  applyTarget(props.target);
  try { await refresh(); }
  catch (e) { error.value = e.message; }
  suggestFromReport();
  restoring = false;
  schedulePoll();
});
onUnmounted(() => { disposed = true; clearTimeout(timer); });
watch(() => props.target,applyTarget);
watch([config,reportId,review,baseRevision], async () => {
  if (restoring) return;
  try { await draftStore(key,JSON.parse(JSON.stringify({config,reportId:reportId.value,review:review.value,baseRevision:baseRevision.value,loadedId}))); }
  catch { error.value = 'Browser recovery storage is unavailable. Save the report before leaving this page.'; }
},{deep:true});
async function action(fn) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  clearTimeout(timer);
  try { if (refreshing) await refreshing; await fn(); await refresh(); schedulePoll(); } catch(e) { error.value = e.message; } finally { busy.value = false; }
}
function startReport() {
  if (busy.value || attachments.value.busy || attachments.value.pending || !attachments.value.ready) return;
  const materialIds=[...attachments.value.materialIds].sort();
  const changed = reports.value.some(j=>j.status==='complete') && !reports.value.some(j=>j.status==='complete' && sameIds(j.input.passageIds, materialIds));
  if (changed && !window.confirm('Attached files have changed. Generate a new report from the currently attached files? Existing reports, saved versions and questions will be kept.' + (dirty.value ? ' Unsaved edits in this editor will be replaced.' : ''))) return;
  if (!changed && dirty.value && !window.confirm('Keep editing the current report? Choose Cancel to keep editing, or OK to open the report for all uploaded material. Unsaved edits in this editor may be replaced.')) return;
  return action(async () => {
    const j = await api('POST',path+'/authoring',{kind:'report',topicId:props.topic.id,materialIds,confirmMaterialChange:changed});
    reportId.value=j.id; loadedId=''; review.value=''; baseRevision.value=0;
  });
}
function switchReport(event) {
  if (dirty.value && !window.confirm('Switch reports and discard the unsaved edits in this editor?')) { event.target.value=reportId.value; return; }
  reportId.value=event.target.value; loadedId=''; loadEditor();
}
function reloadReport() {
  if (dirty.value && !window.confirm('Replace this editor with the latest server-saved report? Download your edits first if you want to keep both.')) return;
  loadEditor();
}
function saveReport() { return action(async () => {
  const j = await api('PUT',path+`/authoring/${reportId.value}/review`,{markdown:review.value,reportRevision:baseRevision.value});
  baseRevision.value=j.reportRevision; review.value=j.reviewedText;
}).then(suggestFromReport); }
async function submitGeneration() {
  const payload=pendingGeneration.value;
  if(!payload) return; // A concurrent progress refresh may already acknowledge it.
  try {await draftStore(attemptKey,JSON.parse(JSON.stringify(payload)));}
  catch {throw new Error('Could not save generation recovery data. No request was sent. Enable browser storage and retry.');}
  try {
    const job=await api('POST',path+'/authoring',payload);
    pendingGeneration.value=null;
    await draftStore(attemptKey,null);
    notice.value=job.status==='complete' ? 'This generation batch is complete. Review its saved drafts below.' : 'Generation batch started. You can return later; progress is saved.';
  } catch(e) {
    if(e.status && e.status<500) {pendingGeneration.value=null;await draftStore(attemptKey,null);}
    throw e;
  }
}
function generate() {
  if(busy.value || running.value || pendingGeneration.value) return;
  return action(async()=>{
    notice.value='';
    pendingGeneration.value={kind:'generation',attemptId:reqId(),analysisId:reportId.value,reportRevision:baseRevision.value,topicId:props.topic.id,learningOutcome:config.learningOutcome,assessmentStyle:config.assessmentStyle,
      quantities:Object.fromEntries(types.filter(type=>config.quantities[type]>0).map(type=>[type,config.quantities[type]]))};
    await submitGeneration();
  });
}
function resume(j) { return action(() => api('POST',path+`/authoring/${j.id}/resume`)); }
// Opens the Question bank on this batch's topic, where its drafts are.
function reviewDrafts() { S.qFilter='draft'; S.topicId=props.topic.id; setTab('review'); }
function download() {
  const url=URL.createObjectURL(new Blob([review.value],{type:'text/markdown;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download=`knowledge-report${props.topic.week ? '-week-' + props.topic.week : ''}.md`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
</script>
<template>
  <p class="muted">For <b>{{ topicLabel(topic) }}</b>: Upload → Knowledge report → Edit &amp; save → Configure questions → Generate → Review &amp; publish</p>
  <button class="btn small" :disabled="busy" @click="action(() => {})">Refresh progress</button>
  <div v-if="error" class="note bad" role="alert">{{ error }}</div>
  <p v-if="notice" role="status" aria-live="polite">{{notice}}</p>
  <div v-if="pendingGeneration" :class="['note',busy?'':'warn']" role="status"><span v-if="busy">Submitting your generation request...</span><template v-else>A generation request needs confirmation. Retry the same request to recover its job without creating another batch. <button class="btn" :disabled="running" @click="action(submitGeneration)">Retry generation request</button><button class="btn" :disabled="running" @click="action(() => {})">Check request status</button></template></div>
  <div v-if="current" class="note" role="status" aria-live="polite">
    {{ current.message }}<template v-if="jobTopic(current) && jobTopic(current).id !== topic.id"> ({{ topicLabel(jobTopic(current)) }})</template> <span v-if="['queued','running'].includes(current.status)">You can return later; progress is saved.</span>
    <span v-if="current.retryAt > Date.now()">Try again after {{ when(current.retryAt) }}.</span>
    <button v-if="['failed','interrupted'].includes(current.status) && !current.result.applicationUnsupported" class="btn" :disabled="running" @click="resume(current)">Resume saved work</button>
  </div>
  <ImportMaterials :course="course" :topic="topic" :disabled="running" in-workflow @available="hasMaterial=$event" @state="attachments=$event" />
  <button v-if="hasMaterial" class="btn" :disabled="running || attachments.busy || attachments.pending || !attachments.ready" @click="startReport">Generate report</button>
  <p v-if="attachments.pending" class="small muted">Upload or remove selected files before generating a report.</p>
  <div v-if="reports.length || olderReports.length" class="panel">
    <h3>Knowledge report</h3>
    <label v-if="reports.length + olderReports.length > 1 || !report">Report <select aria-label="Knowledge report" :value="reportId" :disabled="running" @change="switchReport">
      <option v-if="!report" value="" disabled>{{ reports.length ? 'Choose a report' : 'No report for this topic yet' }}</option>
      <option v-for="j in reports" :key="j.id" :value="j.id">{{ reportLabel(j) }}</option>
      <optgroup v-if="olderReports.length" label="Older reports (all course files, before weekly topics)"><option v-for="j in olderReports" :key="j.id" :value="j.id">{{ reportLabel(j) }}</option></optgroup>
    </select></label>
    <p v-if="!report && !reports.length" class="small muted">Upload this topic's lecture files above and click <strong>Generate report</strong>, or choose an older report.</p>
    <p v-if="report && !report.input.topicId" class="note warn small">This older report was made from every file in the course, not just this topic's. Questions drafted from it are still filed under {{ topicLabel(topic) }}.</p>
    <p v-if="reportSources" class="small muted">Made from: {{ reportSources }}</p>
    <p v-if="reportOutdated" class="note warn" role="status">This report was made from different files than the ones attached now. Click <strong>Generate report</strong> to make one from the current files, or keep using this one.</p>
    <template v-if="report?.status === 'complete'">
      <p>Edit this report to reflect what students should learn. Questions use only the latest saved report.</p>
      <p v-if="report.result.insufficient" class="note warn">Some material could not support a complete explanation. Review the gaps and add missing information before assessing it.</p>
      <p v-if="report.reportRevision && baseRevision !== report.reportRevision" class="note warn">A newer saved version is available. Your editor has been kept. Download your edits or load the saved report to compare.</p>
      <div class="actions"><button class="btn" :disabled="!review" @click="download">Download .md</button><button class="btn" :disabled="running" @click="reloadReport">Load saved report</button></div>
      <MarkdownEditor v-model="review" label="Knowledge report (Markdown)" :rows="20" :maxlength="50000" :disabled="running" />
      <button class="btn primary" :disabled="running || review.trim().length < 50" @click="saveReport">Save report</button>
      <span v-if="saved" class="badge published">Report saved</span><span v-else class="muted">Save your changes before generating questions.</span>
    </template>
  </div>
  <div v-if="report?.reportSourceId" class="panel">
    <h3>Assessment configuration</h3>
    <p>Questions are filed under <b>{{ topicLabel(topic) }}</b>.</p>
    <label for="assessment-outcome">Learning outcome</label><textarea id="assessment-outcome" v-model="config.learningOutcome" maxlength="2000" rows="3" :disabled="running" placeholder="What should students be able to explain, evaluate or do?" />
    <div v-if="topic.outcomes.length" class="row small outcome-picks"><span class="muted">This topic's outcomes:</span><button v-for="o in topic.outcomes" :key="o.id" type="button" class="btn small" :aria-pressed="config.learningOutcome === o.text ? 'true' : 'false'" :disabled="running" @click="config.learningOutcome = o.text">{{ o.text }}</button></div>
    <p v-if="usingSuggestion" class="small muted">Suggested from the report's learning objectives. Edit as needed; a new outcome is added to this topic.</p>
    <label for="assessment-style">Assessment Style</label><select id="assessment-style" v-model="config.assessmentStyle" :disabled="running"><option value="conceptual">Conceptual</option><option value="application">Application</option><option value="both">Both</option></select>
    <p>Choose quantities for each question type. Up to 10 questions per assessment; reuse this report for further assessments.</p>
    <div class="row top"><label v-for="type in types" :key="type">{{ typeLabels[type] }}<input v-model.number="config.quantities[type]" :aria-label="typeLabels[type] + ' quantity'" type="number" min="0" max="10" step="1" :disabled="running" style="max-width:100px" /></label></div>
    <p class="small muted">MCQ has one correct option; Multi-select has multiple correct options. Short Answer accepts text or numerical responses.</p>
    <p>{{ total }} questions in total</p>
    <button class="btn primary" :disabled="!!generateBlocked" @click="generate">Generate questions</button>
    <p v-if="generateBlocked" class="small muted" role="status">{{ generateBlocked }}</p>
  </div>
  <div v-for="warning in generation?.result.warnings || []" :key="warning" class="note warn" role="alert">{{ warning }}</div>
  <div v-if="generation?.result.created?.length" class="panel">
    <h3>Review and publish</h3>
    <p role="status" aria-live="polite">{{ generation.result.created.length }} of {{ generation.input.count }} questions saved as drafts. Review answers and explanations before approval; AI checks can miss errors.</p>
    <p>Edit, reject or regenerate individual questions in the Question Bank. Approve &amp; publish makes approved questions available to students.</p>
    <button class="btn primary" @click="reviewDrafts">Review drafts</button>
  </div>
</template>
