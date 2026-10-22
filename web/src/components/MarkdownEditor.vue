<script setup>
import { ref, useId } from 'vue';
import RichText from './RichText.vue';
const props=defineProps({modelValue:{type:String,default:''},label:{type:String,required:true},rows:{type:Number,default:6},maxlength:Number,disabled:Boolean,invalid:Boolean,error:String});
const emit=defineEmits(['update:modelValue']);
const preview=ref(false),id=useId();
</script>
<template>
  <section class="markdown-editor field" :aria-label="'Markdown editor: '+label">
    <div class="editor-heading"><label :for="id">{{label}}</label><div class="editor-modes" :aria-label="label+' mode'" role="group">
      <button type="button" class="btn small" :aria-pressed="!preview" @click="preview=false">Write</button>
      <button type="button" class="btn small" :aria-pressed="preview" @click="preview=true">Preview</button>
    </div></div>
    <textarea v-show="!preview" :id="id" :value="modelValue" :rows="rows" :maxlength="maxlength" :disabled="disabled" :aria-invalid="invalid" :aria-describedby="id+'-help'+(error?' '+id+'-error':'')" @input="emit('update:modelValue',$event.target.value)"></textarea>
    <div v-if="preview" class="markdown-editor-preview" :aria-label="label+' preview'" tabindex="0"><RichText v-if="modelValue" :text="modelValue" /><p v-else class="muted">Nothing to preview yet. Choose Write to add content.</p></div>
    <small :id="id+'-help'" class="muted">Markdown: **bold**, *emphasis*, `inline code`, lists and fenced code blocks. Indentation and line breaks are kept. Maths is shown exactly as typed, so write it plainly (e.g. 1 px = 1/96 inch).</small>
    <small v-if="error" :id="id+'-error'" class="field-error" role="status">{{error}}</small>
  </section>
</template>
<style scoped>
.markdown-editor { min-width:0; }
.editor-heading { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
.editor-heading label { margin:0; }
.editor-modes { display:flex; gap:6px; }
.editor-modes [aria-pressed=true] { color:var(--accent); background:var(--accent-soft); border-color:var(--accent); }
/* Grows with its content up to most of the screen, so short text needs no inner scrolling. */
textarea { width:100%; resize:vertical; field-sizing:content; min-height:8em; max-height:70vh; }
.markdown-editor-preview { min-height:100px; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--bg); margin-bottom:6px; }
.field-error { display:block; color:var(--bad,#a32b38); margin-top:4px; }
small { display:block; }
</style>
