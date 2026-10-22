<script setup>
import RichText from '../components/RichText.vue';
defineProps({ value: {type:Object, required:true}, sample:Object });
const correct = (v,i) => v.type === 'multi' ? v.answerIndexes?.includes(i) : v.answerIndex === i;
</script>
<template>
  <div class="question-details">
    <RichText class="question-stem" :text="value.stem" />
    <ol v-if="['mcq','multi','tf'].includes(value.type)" class="answer-options" aria-label="Answer options">
      <li v-for="(option,i) in (value.type==='tf'?['True','False']:value.options)" :key="i" :class="{correct:correct(value,i)}">
        <span class="option-letter" aria-hidden="true">{{String.fromCharCode(65+i)}}</span><RichText :text="option" /><span v-if="correct(value,i)" class="answer-indicator">✓ Correct</span>
      </li>
    </ol>
    <section v-if="value.type==='numeric' || (value.type==='short' && value.answerMode==='numeric')" class="answer-section"><h4>Numerical answer</h4><p>{{ value.answer }} {{value.unit}} <span class="muted">(± {{value.tolerance || 0}})</span></p></section>
    <template v-if="value.type==='short'">
      <section class="answer-section"><h4>Model answer</h4><RichText :text="value.modelAnswer" /></section>
      <section class="answer-section"><h4>Grading key points</h4><ul><li v-for="(point,i) in value.keyPoints" :key="i"><RichText :text="point" /></li></ul></section>
    </template>
    <section v-if="value.type==='param'" class="answer-section">
      <h4>Formula &amp; variables</h4><code>{{value.answerExpr}}</code><p v-for="x in value.variables" :key="x.name">{{x.name}}: {{x.min}} to {{x.max}}, step {{x.step}}</p>
      <p v-if="value.constraint">Constraint: <code>{{value.constraint}}</code></p><p>Decimals: {{value.decimals}} · Unit: {{value.unit || 'none'}}</p>
      <p>Distractor formulas</p><code v-for="(d,i) in value.distractorExprs" :key="i" class="formula">{{d}}</code>
      <details v-if="sample"><summary>Example variation</summary><RichText :text="sample.stem" /><ol><li v-for="(o,i) in sample.options" :key="i"><RichText :text="o" /><span v-if="i===sample.answerIndex">✓ Correct</span></li></ol></details>
    </section>
    <section v-if="value.explanation" class="answer-section explanation"><h4>Explanation</h4><RichText :text="value.explanation" /></section>
  </div>
</template>
<style scoped>
.question-details { min-width:0; }
.question-stem { font-weight:600; font-size:1.04rem; margin:14px 0; }
.answer-options { list-style:none; padding:0; margin:14px 0; display:grid; gap:8px; }
.answer-options li { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-weight:400; min-width:0; }
.answer-options .rich-text { flex:1; }
.answer-options li.correct { border-color:var(--good,#23835c); background:color-mix(in srgb, var(--good,#23835c) 6%, transparent); }
.option-letter { font-weight:600; flex-shrink:0; }
.answer-indicator { font-size:.75rem; font-weight:650; color:var(--good,#23835c); white-space:nowrap; }
.answer-section { border-top:1px solid var(--line); padding-top:12px; margin-top:14px; }
h4 { font-size:.8rem; color:var(--muted); margin:0 0 6px; }
p { margin:4px 0; }.formula { display:block; margin:4px 0; }
@media(max-width:600px) { .answer-options li { flex-wrap:wrap; } .answer-indicator { margin-left:24px; } }
</style>
