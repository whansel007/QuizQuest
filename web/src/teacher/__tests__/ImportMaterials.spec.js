import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ImportMaterials from '../ImportMaterials.vue';
import { api } from '../../api.js';
import { extractFile } from '../import-materials.js';
import { draftStore } from '../authoring-draft.js';

vi.mock('../../api.js', () => ({ S: { me: { id: 'teacher' } }, api: vi.fn() }));
vi.mock('../import-materials.js', () => ({ extractFile: vi.fn(), originOf: () => 'text' }));
vi.mock('../authoring-draft.js', () => ({ draftStore: vi.fn() }));
let server, recovery, wrapper, failSave;
const props = { course: { id: 'course', geminiEnabled: true }, topic: { id: 'topic' } };
const stored = (name = 'lecture.txt', extra = {}) => ({ id: name, documentId: name, fileName: name, title: name + ' · Text', text: 'Original lecture text', importHash: name, topicId: 'topic', saved: true, ...extra });
async function open() { wrapper = mount(ImportMaterials, { props }); await flushPromises(); return wrapper; }
async function choose(name = 'new.txt', replacement = false) {
  const input = wrapper.get(`input[aria-label="${replacement ? 'Replacement lecture file' : 'Lecture files'}"]`);
  Object.defineProperty(input.element, 'files', { value: [new File(['Lecture text'], name)], configurable: true });
  await input.trigger('change'); await flushPromises();
  await vi.waitFor(() => expect(button('Choose files').attributes('disabled')).toBeUndefined());
}
const button = text => wrapper.findAll('button').find(b => b.text() === text);
async function upload() { await wrapper.findAll('label').find(l => l.text().includes('authorised')).get('input').setValue(true); await button('Upload files').trigger('click'); await flushPromises(); }
beforeEach(() => {
  sessionStorage.clear(); server = []; recovery = undefined; failSave = false;
  vi.clearAllMocks();
  draftStore.mockImplementation(async (_, value) => value === undefined ? structuredClone(recovery) : (recovery = structuredClone(value)));
  extractFile.mockImplementation(async (file, progress, options) => {
    if (!await options.accept(file.name)) return null;
    return { pages: [{ label: 'Text', text: 'Lecture text for ' + file.name }], note: '' };
  });
  api.mockImplementation(async (method, path, body) => {
    if (method === 'GET') return structuredClone(server);
    if (method === 'PUT') { server.forEach(p => { if (body.passageIds.includes(p.id)) p.attached = body.attached; }); return {}; }
    if (failSave) throw new Error('Connection lost');
    let p = server.find(p => p.title === body.title && p.text === body.text);
    if (!p) { p = { ...body, id: 'id-' + server.length, importHash: 'hash-' + server.length }; server.push(p); }
    Object.assign(p, { documentId: body.documentId, attached: true });
    return structuredClone(p);
  });
});
afterEach(() => wrapper?.unmount());

describe('lecture upload state and disclosure', () => {
  it('shows a compact empty state, deduplicates selections and moves saved files to the top', async () => {
    await open(); expect(wrapper.find('.saved-materials').exists()).toBe(false);
    await choose(); await choose(); expect(wrapper.findAll('.upload-materials article')).toHaveLength(1);
    await upload(); expect(wrapper.findAll('.saved-materials article')).toHaveLength(1);
    expect(wrapper.findAll('.upload-materials article')).toHaveLength(0);
    expect(wrapper.get('.saved-toggle').attributes('aria-expanded')).toBe('true');
    expect(server).toHaveLength(1);
  });
  it('keeps extraction/AI warnings on saved files and visible in the collapsed header', async () => {
    server = [stored()]; recovery = [stored('lecture.txt', { fileNote: 'AI description stopped early. Diagrams were not read.' })];
    await open(); expect(wrapper.get('.saved-materials').text()).toContain('Uploaded');
    await wrapper.get('.saved-toggle').trigger('click');
    expect(wrapper.get('.saved-toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('.saved-toggle').text()).toContain('1 file(s) have extraction notes');
    expect(wrapper.get('.saved-region').attributes('inert')).toBeDefined();
    expect(wrapper.get('.saved-toggle').attributes('aria-controls')).toBe(wrapper.get('.saved-region').attributes('id'));
    wrapper.unmount(); await open(); expect(wrapper.get('.saved-toggle').attributes('aria-expanded')).toBe('false');
    expect(server[0].attached).toBeUndefined();
  });
  it('retains failed reads across refresh and requests reselection when the original is gone', async () => {
    extractFile.mockRejectedValueOnce(new Error('Unsupported document. Save as DOCX.'));
    await open(); await choose('old.doc');
    expect(wrapper.get('.upload-materials').text()).toContain('Save as DOCX');
    wrapper.unmount(); await open();
    await button('Retry').trigger('click'); expect(wrapper.text()).toContain('Reselect old.doc');
    await choose('new.docx', true); expect(wrapper.text()).not.toContain('Could not read file');
    await upload(); expect(wrapper.get('.saved-materials').text()).toContain('new.docx');
  });
  it('retries upload failure without duplicating saved excerpts', async () => {
    await open(); await choose(); failSave = true; await upload();
    expect(wrapper.get('.upload-materials').text()).toContain('Upload failed');
    expect(wrapper.find('.saved-materials').exists()).toBe(false);
    failSave = false; await button('Retry').trigger('click'); await flushPromises();
    expect(server).toHaveLength(1); expect(wrapper.get('.saved-materials').text()).toContain('new.txt');
  });
  it('keeps original attached during replacement failures, then detaches only after success', async () => {
    server = [stored()]; await open();
    await button('Replace').trigger('click'); await choose('replacement.txt', true);
    expect(server[0].attached).toBeUndefined(); expect(wrapper.get('.saved-materials').text()).toContain('lecture.txt');
    failSave = true; await upload(); expect(server[0].attached).toBeUndefined();
    failSave = false; await button('Retry').trigger('click'); await flushPromises();
    expect(server[0].attached, wrapper.text() + JSON.stringify(api.mock.calls)).toBe(false); expect(server[1].attached).toBe(true);
    expect(wrapper.findAll('.saved-materials article')).toHaveLength(1);
  });
  it('removes attachments without deleting their saved sources', async () => {
    server = [stored()]; await open(); await button('Remove').trigger('click'); await flushPromises();
    expect(server).toHaveLength(1); expect(server[0].attached).toBe(false);
    expect(wrapper.find('.saved-materials').exists()).toBe(false);
    expect(api.mock.calls.some(([method]) => method === 'DELETE')).toBe(false);
  });
  it('restores server-saved files without browser recovery data', async () => {
    server = [stored()]; await open(); expect(wrapper.get('.saved-materials').text()).toContain('lecture.txt');
    expect(wrapper.emitted('state').at(-1)[0]).toMatchObject({ materialIds: ['lecture.txt'], pending: false, ready: true });
    wrapper.vm.collapse(); await flushPromises(); expect(wrapper.get('.saved-toggle').attributes('aria-expanded')).toBe('false');
  });
  it('blocks mutations until the server attachments have been verified', async () => {
    api.mockRejectedValueOnce(new Error('Offline'));
    await open(); expect(button('Choose files').attributes('disabled')).toBeDefined();
    expect(wrapper.emitted('state').at(-1)[0].ready).toBe(false);
    await button('Retry connection').trigger('click'); await flushPromises();
    expect(button('Choose files').attributes('disabled')).toBeUndefined();
  });
  it('does not duplicate a file when the AI option changes', async () => {
    await open(); await choose(); await upload();
    await wrapper.findAll('label').find(l => l.text().includes('Describe images')).get('input').setValue(true);
    await choose(); expect(wrapper.findAll('article')).toHaveLength(1);
  });
  it('restores shared original excerpts when a partial replacement is removed after refresh', async () => {
    server = [stored()]; await open(); await button('Replace').trigger('click');
    extractFile.mockImplementationOnce(async (file, progress, options) => {
      await options.accept('changed');
      return { pages: [{label:'Text',text:'Original lecture text'}, {label:'Extra',text:'New excerpt'}], note:'' };
    });
    const normalApi = api.getMockImplementation();
    api.mockImplementation(async (method, path, body) => {
      if (method === 'POST' && body.text === 'New excerpt') throw new Error('Lost connection');
      return normalApi(method, path, body);
    });
    await choose('lecture.txt', true); await upload();
    expect(wrapper.get('.upload-materials').text()).toContain('Upload failed');
    wrapper.unmount(); await open();
    await wrapper.get('.upload-materials').findAll('button').find(b => b.text() === 'Remove').trigger('click'); await flushPromises();
    expect(server[0].attached).toBe(true); expect(server[0].documentId).toBe('lecture.txt');
    expect(wrapper.findAll('.saved-materials article')).toHaveLength(1);
    expect(wrapper.findAll('.upload-materials article')).toHaveLength(0);
  });
});
