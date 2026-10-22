// Runs the upload extractor (web/src/teacher/import-materials.js) in Chromium,
// since it relies on DOMParser, canvas and Blob. No server or AI calls: the
// optional `describe` step uses a stub.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main',
  A = 'http://schemas.openxmlformats.org/drawingml/2006/main',
  R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rels = (inner) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`;
const zip = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v]))));
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function deck() {
  const sp = (ph, body) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp>`;
  const para = (t, lvl) => `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ''}<a:r><a:t>${t}</a:t></a:r></a:p>`;
  const pic = (id, cx, cy) => `<p:pic><p:nvPicPr><p:cNvPr id="5" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${id}"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr></p:pic>`;
  const tbl = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>${para('Metric')}</a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Unit</a:t></a:r><a:br/><a:r><a:t>(SI)</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody>${para('Latency')}</a:txBody></a:tc><a:tc><a:txBody>${para('ms')}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const slide = (inner, attrs = '') => `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"${attrs}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
  return zip({
    'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst><p:sldSz cx="1000" cy="1000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(['slide1', 'slide2', 'slide3'].map((s, i) => `<Relationship Id="rId${i + 1}" Target="slides/${s}.xml"/>`).join('')),
    'ppt/slides/slide1.xml': slide(
      sp('<p:ph type="title"/>', para('Network delay')) +
        sp('<p:ph idx="1"/>', para('Latency') + para('Measured in ms', 1)) +
        sp('<p:ph type="sldNum"/>', para('1')) +
        tbl + pic('rIdBig', 800, 800) + pic('rIdLogo', 50, 50),
    ),
    'ppt/slides/_rels/slide1.xml.rels': rels(
      `<Relationship Id="rIdBig" Target="../media/image1.png"/><Relationship Id="rIdLogo" Target="../media/image2.png"/><Relationship Id="rN" Type="${R}/notesSlide" Target="../notesSlides/notesSlide1.xml"/>`,
    ),
    'ppt/notesSlides/notesSlide1.xml': `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${sp('<p:ph type="sldImg"/>', '')}${sp('<p:ph type="body" idx="1"/>', para('Stress units'))}${sp('<p:ph type="sldNum"/>', para('1'))}</p:spTree></p:cSld></p:notes>`,
    'ppt/slides/slide2.xml': slide(sp('', para('Hidden draft')), ' show="0"'),
    'ppt/slides/slide3.xml': slide(pic('rIdEmf', 900, 900) + pic('rIdPng', 900, 900)),
    'ppt/slides/_rels/slide3.xml.rels': rels('<Relationship Id="rIdEmf" Target="../media/image3.emf"/><Relationship Id="rIdPng" Target="../media/image4.png"/>'),
    'ppt/media/image1.png': PNG,
    'ppt/media/image2.png': PNG,
    'ppt/media/image3.emf': new Uint8Array([1, 2, 3]),
    'ppt/media/image4.png': PNG,
  });
}
function wordDoc() {
  const p = (t, extra = '') => `<w:p>${extra ? `<w:pPr>${extra}</w:pPr>` : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`;
  const style = (s) => `<w:pStyle w:val="${s}"/>`;
  return zip({
    'word/document.xml': `<w:document xmlns:w="${W}"><w:body>${p('Queues', style('Heading1'))}${p('A buffer holds packets.')}${p('Drop-tail', '<w:numPr><w:ilvl w:val="1"/></w:numPr>')}<w:tbl><w:tr><w:tc>${p('Load')}</w:tc><w:tc>${p('Delay')}</w:tc></w:tr></w:tbl>${p('Routing', style('Heading1'))}${p('Routers forward packets.')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`,
  });
}

let browser, page;
test.before(async () => {
  const src = fs
    .readFileSync(path.join(__dirname, '..', 'web', 'src', 'teacher', 'import-materials.js'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export const (\w+)/gm, 'window.$1')
    .replace(/^export (async function|function) (\w+)/gm, 'window.$2 = $1 $2');
  browser = await chromium.launch({ ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  page = await browser.newPage();
  await page.addScriptTag({ path: path.join(path.dirname(require.resolve('fflate')), '..', 'umd', 'index.js') });
  await page.addScriptTag({ content: 'const { unzipSync, strFromU8 } = window.fflate; const loadPdfJs = () => window.pdfLibrary;\n' + src });
});
test.after(() => browser?.close());

const run = (name, bytes, ai) =>
  page.evaluate(
    async ({ name, b64, ai }) => {
      const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name);
      const calls = [];
      // `ai` is true, or a list of HTTP statuses to throw on successive calls.
      const describe =
        ai &&
        (async (blob, mode) => {
          calls.push([blob.type, mode]);
          const status = Array.isArray(ai) && ai[calls.length - 1];
          if (status) throw Object.assign(new Error(`AI error ${status}`), { status });
          return { text: 'A bar chart of delay against load.', containsPersonalData: false };
        });
      try {
        return { ...(await extractFile(file, () => {}, { describe })), calls };
      } catch (e) {
        return { error: e.message };
      }
    },
    { name, b64: Buffer.from(bytes).toString('base64'), ai },
  );

test('PowerPoint keeps titles, bullet levels, tables and notes, and skips hidden slides and footers', async () => {
  const { pages, note, error } = await run('lecture.pptx', deck(), false);
  assert.equal(error, undefined);
  assert.deepEqual(pages.map((p) => p.label), ['Slide 1', 'Slide 3']);
  const text = pages[0].text;
  assert.match(text, /^## Network delay\n- Latency\n {2}- Measured in ms/);
  assert.match(text, /\| Metric \| Unit<br>\(SI\) \|\n\| --- \| --- \|\n\| Latency \| ms \|/);
  assert.match(text, /Speaker notes:\nStress units$/);
  assert.doesNotMatch(text, /Hidden draft|^1$/m);
  // The logo is below the size threshold; only the large picture counts.
  assert.deepEqual(pages[0].images, ['ppt/media/image1.png']);
  assert.match(note, /2 slides with diagrams or pictures that were not read\. Tick/);
});

test('AI descriptions are opt-in, deduplicated and skip formats the browser cannot decode', async () => {
  const off = await run('lecture.pptx', deck(), false);
  const on = await run('lecture.pptx', deck(), true);
  assert.deepEqual(on.calls, [['image/png', 'diagram'], ['image/png', 'diagram']]);
  assert.match(on.pages[0].text, /\[Image description, AI-generated: check against the original\]\nA bar chart of delay against load\.$/);
  assert.deepEqual(on.pages[0].images, []);
  assert.match(on.note, /2 images described by AI.*1 image use a format the browser cannot read/);
  // The fingerprint identifies the file's content, not the AI output.
  assert.equal(on.fingerprint, off.fingerprint);
});

test('a file the caller declines is identified before any AI request', async () => {
  const r = await page.evaluate(async (b64) => {
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'lecture.pptx');
    let calls = 0, seen = '';
    const result = await extractFile(file, () => {}, {
      describe: async () => (calls++, { text: 'x', containsPersonalData: false }),
      accept: async (fingerprint) => ((seen = fingerprint), false),
    });
    return { result, calls, seen: seen.length > 0 };
  }, deck().toString('base64'));
  assert.deepEqual(r, { result: null, calls: 0, seen: true });
});

test('a declined image is skipped, but a quota error stops the AI step', async () => {
  const declined = await run('lecture.pptx', deck(), [422]);
  assert.equal(declined.calls.length, 2);
  assert.match(declined.note, /1 image described by AI.*1 image could not be described by AI\. Describe it in the report yourself\./);
  assert.doesNotMatch(declined.note, /stopped early/);
  const quota = await run('lecture.pptx', deck(), [429]);
  assert.equal(quota.calls.length, 1);
  assert.match(quota.note, /AI description stopped early: AI error 429$/);
});

test('cancelling stops before the next AI request', async () => {
  const r = await page.evaluate(async (b64) => {
    const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'lecture.pptx');
    const ctrl = new AbortController();
    let calls = 0;
    const describe = async () => (calls++, ctrl.abort(), { text: 'x', containsPersonalData: false });
    try {
      await extractFile(file, () => {}, { describe, signal: ctrl.signal });
      return { calls, error: '' };
    } catch (e) {
      return { calls, error: e.name };
    }
  }, deck().toString('base64'));
  assert.deepEqual(r, { calls: 1, error: 'AbortError' });
});

test('Word documents split into sections with headings, lists and tables', async () => {
  const { pages } = await run('notes.docx', wordDoc(), false);
  assert.deepEqual(pages.map((p) => p.label), ['Section 1: Queues', 'Section 2: Routing']);
  assert.equal(pages[0].text, '# Queues\nA buffer holds packets.\n  - Drop-tail\n\n| Load | Delay |\n| --- | --- |\n');
});

test('legacy Office formats get a save-as instruction', async () => {
  assert.match((await run('old.ppt', Buffer.from('x'), false)).error, /Save As › PowerPoint Presentation \(\.pptx\)/);
  assert.match((await run('old.doc', Buffer.from('x'), false)).error, /Save As › Word Document \(\.docx\)/);
  assert.equal(await page.evaluate(() => [originOf('a.PPSX'), originOf('a.docx'), originOf('a.pdf'), originOf('a.md')].join()), 'pptx,docx,pdf,text');
});

test('empty scan transcriptions still count toward the per-file AI limit', async () => {
  const result = await page.evaluate(async () => {
    let calls = 0, destroyed = false;
    window.pdfLibrary = { getDocument: () => ({
      promise: Promise.resolve({ numPages: 45, getPage: async () => ({
        getTextContent: async () => ({ items: [] }), cleanup() {},
        getViewport: () => ({ width: 10, height: 10 }),
        render: () => ({ promise: Promise.resolve() }),
      }) }),
      destroy: async () => { destroyed = true; },
    }) };
    try {
      const result = await extractFile(new File(['mock PDF'], 'scans.pdf'), () => {}, {
        describe: async () => { calls++; return { text: '', containsPersonalData: false }; },
      });
      return { calls, destroyed, pages: result.pages.length };
    } finally { delete window.pdfLibrary; }
  });
  assert.equal(result.calls, 40);
  assert.equal(result.pages, 45, 'unread pages remain available');
  assert.equal(result.destroyed, true);
});
