<script setup>
import RichText from '../components/RichText.vue';
defineProps({ text: String });
</script>
<template><article class="markdown-preview" aria-label="Knowledge report preview"><RichText :text="text" /></article></template>
<style scoped>.markdown-preview { max-width:85ch; }</style>
