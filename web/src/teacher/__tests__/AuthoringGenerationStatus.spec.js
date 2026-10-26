/*
  AI drafting + floating generation status (integration):
  which batch the status follows, with the authoring API mocked.
   1. A batch started here shows, even when it finishes before the next poll
   2. A batch finished on an earlier visit never pops up stale
   3. A repeated generation replaces the previous status: one at a time
   4. View Question Bank opens the bank on the batch's topic; nothing navigates by itself
*/
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import AuthoringWorkflow from '../AuthoringWorkflow.vue';
import { S, api, setTab } from '../../api.js';
import { draftStore } from '../authoring-draft.js';

vi.mock('../../api.js', () => ({ S: { me: { id: 'teacher' } }, api: vi.fn(), setTab: vi.fn(), reqId: () => 'attempt-' + Math.random().toString(36).slice(2, 10) }));
vi.mock('../authoring-draft.js', () => ({ draftStore: vi.fn() }));

const topic = { id: 'topic', week: 1, name: 'Data', outcomes: [{ id: 'o1', text: 'Explain delay.' }] };
const other = { id: 'topic-2', week: 2, name: 'Networks', outcomes: [] };
const course = { id: 'course', topics: [topic, other] };
const report = { id: 'r1', kind: 'analysis', status: 'complete', at: 1, input: { reportBased: true, topicId: 'topic', passageIds: [] }, reviewedText: 'R'.repeat(60), reportRevision: 1, reportSourceId: 'p1', result: { markdown: 'R'.repeat(60) } };
const batch = (id, status, saved, extra = {}) => ({ id, kind: 'generation', status, message: '', at: 2, input: { analysisId: 'r1', topicId: 'topic', count: 2 }, result: { created: Array.from({ length: saved }, (_, i) => id + '-q' + i) }, ...extra });
let server, wrapper, completeOnPost;
const button = (text) => wrapper.findAll('button').find((b) => b.text() === text);
const status = () => wrapper.findAll('.gen-status');
async function open() {
  wrapper = mount(AuthoringWorkflow, { props: { course, topic }, global: { stubs: { ImportMaterials: true, MarkdownEditor: true } } });
  await flushPromises();
}
async function refresh(mutate) { mutate?.(); await button('Refresh progress').trigger('click'); await flushPromises(); }
async function generate() { await button('Explain delay.').trigger('click'); await button('Generate questions').trigger('click'); await flushPromises(); }
beforeEach(() => {
  vi.clearAllMocks();
  server = [structuredClone(report)]; completeOnPost = false;
  S.qFilter = 'all'; S.topicId = '';
  draftStore.mockResolvedValue(undefined);
  api.mockImplementation(async (method, path, body) => {
    if (method === 'GET') return structuredClone(server);
    const j = batch('job-' + server.length, completeOnPost ? 'complete' : 'queued', completeOnPost ? 2 : 0, { input: { ...JSON.parse(JSON.stringify(body)), count: 2 } }); // body is a reactive proxy
    server.push(j);
    return structuredClone(j);
  });
});
afterEach(() => wrapper?.unmount());

describe('floating generation status in AI drafting', () => {
  it('shows a batch started here and follows its progress to completion', async () => {
    await open();
    expect(status()).toHaveLength(0);
    await generate();
    expect(status()).toHaveLength(1);
    expect(wrapper.get('.gen-status').text()).toContain('0 of 2 saved to the Question Bank');
    await refresh(() => Object.assign(server[1], { status: 'running', result: { created: ['a'] } }));
    expect(wrapper.get('[role=progressbar]').attributes('aria-valuenow')).toBe('1');
    await refresh(() => Object.assign(server[1], { status: 'complete', result: { created: ['a', 'b'] } }));
    expect(wrapper.get('.gen-status').text()).toContain('2 questions saved to the Question Bank');
    expect(setTab).not.toHaveBeenCalled();
  });
  it('shows a batch that already finished when its request returned', async () => {
    completeOnPost = true;
    await open(); await generate();
    expect(wrapper.get('.gen-status').text()).toContain('2 questions saved to the Question Bank');
  });
  it('does not pop up a batch finished on an earlier visit, but does follow one still running', async () => {
    server.push(batch('old', 'complete', 2));
    await open();
    expect(status()).toHaveLength(0);
    wrapper.unmount();
    server.push(batch('live', 'running', 1));
    await open();
    expect(wrapper.get('.gen-status').text()).toContain('1 of 2 saved');
  });
  it('replaces the previous status on a repeated generation, and replaces the in-page note while shown', async () => {
    server.push(batch('first', 'running', 0, { message: 'Generating and checking questions' }));
    await open();
    expect(wrapper.findAll('.note').some((n) => n.text().includes('Generating and checking questions'))).toBe(false);
    await refresh(() => Object.assign(server[1], { status: 'complete', result: { created: ['a', 'b'] } }));
    await generate();
    expect(status()).toHaveLength(1);
    expect(wrapper.get('.gen-status').text()).toContain('0 of 2 saved');
  });
  it('explains a partial failure, brings back the in-page note on dismiss, and shows again on resume', async () => {
    server.push(batch('b1', 'running', 1));
    await open();
    await refresh(() => Object.assign(server[1], { status: 'failed', message: '1 questions saved; 1 still missing. Resume to fill the remaining 1.' }));
    expect(wrapper.get('.gen-status').classes()).toContain('warn');
    expect(wrapper.get('.gen-status').text()).toContain('1 of 2 questions saved');
    expect(wrapper.findAll('.note').some((n) => n.text().includes('still missing'))).toBe(false);
    await wrapper.get('[aria-label="Dismiss generation status"]').trigger('click');
    expect(status()).toHaveLength(0);
    expect(wrapper.findAll('.note').some((n) => n.text().includes('still missing'))).toBe(true);
    api.mockImplementationOnce(async () => Object.assign(server[1], { status: 'queued' }));
    await button('Resume saved work').trigger('click'); await flushPromises();
    expect(wrapper.get('.gen-status').text()).toContain('Generating questions');
  });
  it('View Question Bank opens the drafts of the batch topic', async () => {
    server.push(batch('b2', 'complete', 2, { input: { analysisId: 'r1', topicId: 'topic-2', count: 2 } }), batch('b3', 'running', 0));
    await open();
    await refresh(() => Object.assign(server[2], { status: 'complete', result: { created: ['x'] }, input: { ...server[2].input, topicId: 'topic-2' } }));
    expect(wrapper.get('.gen-status').text()).toContain('Week 2 · Networks');
    await button('View Question Bank').trigger('click');
    expect(setTab).toHaveBeenCalledWith('review');
    expect(S).toMatchObject({ qFilter: 'draft', topicId: 'topic-2' });
  });
});
