/*
  Floating question-generation status (GenerationStatus.vue and
  generation-status.js):
   1. Progress uses the server's saved count, never a made-up percentage
   2. Success, partial success and failure say what happened
   3. Only finished batches can be dismissed; actions only run when clicked
   4. Screen readers hear each change through one persistent live region
*/
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import GenerationStatus from '../GenerationStatus.vue';
import { generationStatus } from '../generation-status.js';

const job = (status, saved, extra = {}) => ({
  id: 'job-1', kind: 'generation', status, message: '', input: { count: 5, topicId: 'topic' },
  result: { created: Array.from({ length: saved }, (_, i) => 'q' + i) }, ...extra,
});
let wrapper;
const open = (props) => (wrapper = mount(GenerationStatus, { props, attachTo: document.body }));
const button = (text) => wrapper.findAll('button').find((b) => b.text() === text);
afterEach(() => wrapper?.unmount());

describe('generationStatus', () => {
  it('reports progress as saved of requested, skipping the server message that repeats it', () => {
    const s = generationStatus(job('running', 2, { message: '2 of 5 questions ready' }));
    expect(s).toMatchObject({ active: true, saved: 2, total: 5, title: 'Generating questions', detail: '', progress: '2 of 5 saved to the Question Bank' });
    expect(s.announcement).toBe('Generating questions: 2 of 5 saved to the Question Bank.');
    expect(JSON.stringify(s)).not.toMatch(/%/);
    expect(generationStatus(job('queued', 0, { message: 'Waiting for AI capacity. Your progress is saved.' })).detail).toBe('Waiting for AI capacity. Your progress is saved.');
  });
  it('counts saved questions on success', () => {
    expect(generationStatus(job('complete', 5))).toMatchObject({ tone: 'good', active: false, title: '5 questions saved to the Question Bank' });
    expect(generationStatus(job('complete', 1, { input: { count: 1 } })).title).toBe('1 question saved to the Question Bank');
  });
  it('explains partial success and failure, and offers Resume only where the server allows it', () => {
    const partial = generationStatus(job('failed', 3, { message: '3 questions saved; 2 still missing. Resume to fill the remaining 2.' }));
    expect(partial).toMatchObject({ tone: 'warn', title: '3 of 5 questions saved', canResume: true });
    expect(partial.detail).toContain('2 still missing');
    const none = generationStatus(job('failed', 0, { message: 'Improve the saved report.', result: { created: [], applicationUnsupported: true, warnings: ['w'] } }));
    expect(none).toMatchObject({ tone: 'bad', title: 'No questions were saved', detail: 'Improve the saved report.', canResume: false, warnings: 1 });
    expect(generationStatus(job('interrupted', 0)).canResume).toBe(true);
  });
});

describe('GenerationStatus', () => {
  it('shows live progress without a dismiss button, and keeps the live region when hidden', async () => {
    open({ job: job('running', 2) });
    expect(wrapper.get('[role=progressbar]').attributes()).toMatchObject({ 'aria-valuenow': '2', 'aria-valuemax': '5', 'aria-valuetext': '2 of 5 saved to the Question Bank' });
    expect(wrapper.find('[aria-label="Dismiss generation status"]').exists()).toBe(false);
    expect(wrapper.get('[role=status]').text()).toBe('Generating questions: 2 of 5 saved to the Question Bank.');
    await wrapper.setProps({ job: job('running', 4) });
    expect(wrapper.get('[role=status]').text()).toContain('4 of 5');
    await wrapper.setProps({ job: null });
    expect(wrapper.find('.gen-status').exists()).toBe(false);
    expect(wrapper.find('[role=status][aria-live=polite]').exists()).toBe(true);
  });
  it('is fixed to the viewport and reserves room under the page only while shown', async () => {
    open({ job: job('running', 0) });
    await nextTick();
    expect(wrapper.get('.gen-status').attributes('aria-label')).toBe('Question generation status');
    expect(document.body.style.paddingBottom).toMatch(/px$/);
    await wrapper.setProps({ job: null });
    expect(document.body.style.paddingBottom).toBe('');
  });
  it('dismisses a finished batch by button or Escape, and returns focus without scrolling', async () => {
    const before = document.createElement('button');
    document.body.append(before);
    open({ job: job('complete', 5) });
    before.focus();
    const close = wrapper.get('[aria-label="Dismiss generation status"]');
    close.element.focus();
    await close.trigger('focusin', { relatedTarget: before });
    await close.trigger('click');
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
    expect(document.activeElement).toBe(before);
    await wrapper.get('.gen-status').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('dismiss')).toHaveLength(2);
    before.remove();
  });
  it('ignores Escape while generating', async () => {
    open({ job: job('running', 1) });
    await wrapper.get('.gen-status').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('dismiss')).toBeUndefined();
  });
  it('offers View Question Bank once questions are saved, and Resume after a failure', async () => {
    open({ job: job('running', 0) });
    expect(button('View Question Bank')).toBeUndefined();
    await wrapper.setProps({ job: job('failed', 3, { message: 'Resume to fill the remaining 2.' }) });
    expect(wrapper.get('.gen-status').classes()).toContain('warn');
    await button('View Question Bank').trigger('click');
    await button('Resume saved work').trigger('click');
    expect(wrapper.emitted('view')).toHaveLength(1);
    expect(wrapper.emitted('resume')).toHaveLength(1);
    await wrapper.setProps({ busy: true });
    expect(button('Resume saved work').attributes('disabled')).toBeDefined();
  });
  it('names another weekly topic and points to warnings without repeating them', () => {
    open({ job: job('complete', 5, { result: { created: ['a', 'b', 'c', 'd', 'e'], warnings: ['Long warning text'] } }), topicLabel: 'Week 2 · Networks' });
    expect(wrapper.text()).toContain('Week 2 · Networks');
    expect(wrapper.text()).toContain('1 warning is shown with the generation results.');
    expect(wrapper.text()).not.toContain('Long warning text');
  });
});
