/*
  AI drafting workflow page (AuthoringWorkflow.vue), with the API mocked:
   1. The learning outcome starts from the topic's outcome, unless one was restored
   2. The step indicator marks finished steps and the current one
   3. Question quantities are checked next to the total as they are typed
*/
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import AuthoringWorkflow from '../AuthoringWorkflow.vue';
import { api } from '../../api.js';
import { draftStore } from '../authoring-draft.js';

vi.mock('../../api.js', () => ({ S: { me: { id: 'teacher' } }, api: vi.fn(), setTab: vi.fn(), reqId: () => 'attempt-abcdefgh' }));
vi.mock('../authoring-draft.js', () => ({ draftStore: vi.fn() }));

const topic = { id: 'topic', week: 1, name: 'Data', outcomes: [{ id: 'o1', text: 'Explain delay.' }, { id: 'o2', text: 'Compare links.' }] };
const course = { id: 'course', topics: [topic] };
const report = { id: 'r1', kind: 'analysis', status: 'complete', at: 1, input: { reportBased: true, topicId: 'topic', passageIds: [] }, reviewedText: 'R'.repeat(60), reportRevision: 1, reportSourceId: 'p1', result: { markdown: 'R'.repeat(60) } };
let server, drafts, wrapper;
const button = (text) => wrapper.findAll('button').find((b) => b.text() === text);
const outcome = () => wrapper.get('#assessment-outcome').element.value;
const current = () => wrapper.get('[aria-current=step]').text();
async function open() {
  wrapper = mount(AuthoringWorkflow, { props: { course, topic }, global: { stubs: { ImportMaterials: true, MarkdownEditor: true } } });
  await flushPromises();
}
beforeEach(() => {
  vi.clearAllMocks();
  server = [structuredClone(report)]; drafts = {};
  draftStore.mockImplementation(async (key, value) => (value === undefined ? structuredClone(drafts[key]) : (drafts[key] = value)));
  api.mockImplementation(async () => structuredClone(server));
});
afterEach(() => wrapper?.unmount());

describe('learning outcome', () => {
  it("starts from the topic's outcome, so Generate is ready", async () => {
    await open();
    expect(outcome()).toBe('Explain delay.');
    expect(wrapper.get('[aria-pressed=true]').text()).toBe('Explain delay.');
    expect(button('Generate questions').attributes('disabled')).toBeUndefined();
  });
  it('keeps an outcome restored from the recovery draft', async () => {
    drafts['report-workflow:teacher:course:topic'] = { config: { learningOutcome: 'My own outcome.', quantities: { mcq: 2 } }, reportId: 'r1', review: 'R'.repeat(60), baseRevision: 1, loadedId: 'r1' };
    await open();
    expect(outcome()).toBe('My own outcome.');
  });
});

describe('step indicator', () => {
  it('starts at Upload when there is nothing yet', async () => {
    server = [];
    await open();
    expect(current()).toContain('Upload');
    expect(wrapper.findAll('.workflow-steps li.done')).toHaveLength(0);
  });
  it('marks report steps done and moves on to Generate once configured', async () => {
    await open();
    expect(current()).toContain('Generate');
    expect(wrapper.findAll('.workflow-steps li.done').map((li) => li.text())).toEqual(['✓Upload (done)', '✓Knowledge report (done)', '✓Edit & save (done)', '✓Configure questions (done)']);
    await wrapper.get('#assessment-outcome').setValue('');
    expect(current()).toContain('Configure questions');
  });
  it('points to Review & publish after a batch is saved', async () => {
    server.push({ id: 'g1', kind: 'generation', status: 'complete', at: 2, message: '', input: { analysisId: 'r1', topicId: 'topic', count: 2 }, result: { created: ['a', 'b'] } });
    await open();
    expect(current()).toContain('Review & publish');
  });
});

describe('question quantities', () => {
  const quantity = (label) => wrapper.get(`input[aria-label="${label} quantity"]`);
  it('flags a total over 10 next to the total, and on the inputs', async () => {
    await open();
    await quantity('MCQ').setValue(8);
    await quantity('True/False').setValue(3);
    expect(wrapper.get('#quantity-total').text()).toBe('11 questions in total · The maximum is 10; remove 1.');
    expect(wrapper.get('#quantity-total').classes()).toContain('count-problem');
    expect(quantity('MCQ').attributes('aria-invalid')).toBe('true');
    expect(quantity('MCQ').attributes('aria-describedby')).toBe('quantity-total');
    expect(button('Generate questions').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Fix the question quantities above.');
  });
  it('flags no questions and non-whole numbers, and says "1 question"', async () => {
    await open();
    await quantity('MCQ').setValue(0);
    expect(wrapper.get('#quantity-total').text()).toBe('0 questions in total · Choose at least one question.');
    await quantity('MCQ').setValue(1.5);
    expect(wrapper.get('#quantity-total').text()).toContain('Each type takes a whole number from 0 to 10.');
    expect(quantity('MCQ').attributes('aria-invalid')).toBe('true');
    expect(quantity('Short Answer').attributes('aria-invalid')).toBeUndefined();
    await quantity('MCQ').setValue(1);
    expect(wrapper.get('#quantity-total').text()).toBe('1 question in total');
    expect(wrapper.get('#quantity-total').classes()).not.toContain('count-problem');
  });
});
