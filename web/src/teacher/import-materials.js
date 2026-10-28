import { unzipSync, strFromU8 } from 'fflate';
import { loadPdfJs } from './pdf.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
// Pictures smaller than this share of the slide/page are usually logos, icons or bullets.
const SIGNIFICANT_AREA = 0.12;
// Per file, so one deck cannot use up the shared daily AI quota.
const MAX_DESCRIBED = 40;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024; // the server accepts 4 MiB after base64 decoding
const SENDABLE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const DRAWABLE = { gif: 'image/gif', bmp: 'image/bmp' }; // re-encoded through a canvas
// Slide number, date, footer and header placeholders repeat on every slide.
const SKIP_PLACEHOLDER = /^(sldNum|dt|ftr|hdr|sldImg)$/;
const PRESENTATION = /\.(pptx|pptm|ppsx|ppsm|potx)$/i;

const xml = (value) => {
  const d = new DOMParser().parseFromString(value, 'application/xml');
  if (d.getElementsByTagName('parsererror').length)
    throw new Error('This file contains unreadable XML. Export it as PDF and try again.');
  return d;
};
const nodes = (d, local) => [...d.getElementsByTagNameNS('*', local)];
const children = (el, local) => [...el.children].filter((c) => c.localName === local);
// Soft line breaks (a:br / w:br) separate items such as UML attributes.
const runText = (p) => nodes(p, '*').map((e) => (e.localName === 't' ? e.textContent : e.localName === 'br' ? '\n' : '')).join('');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function unzip(bytes, wanted, what) {
  let total = 0;
  return unzipSync(bytes, {
    filter: (f) => {
      if (!wanted(f.name)) return false;
      total += f.originalSize;
      if (f.originalSize > 10 * 1024 * 1024 || total > 50 * 1024 * 1024)
        throw new Error(`${what} text is too large. Split the file and try again.`);
      return true;
    },
  });
}
const read = (zip, name) => (zip[name] ? xml(strFromU8(zip[name])) : null);
// Relationship targets are relative to the part that owns them.
function resolve(from, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const s of target.split('/')) s === '..' ? parts.pop() : s !== '.' && parts.push(s);
  return parts.join('/');
}
function relsOf(zip, part) {
  const d = read(zip, part.replace(/([^/]+)$/, '_rels/$1.rels'));
  if (!d) return {};
  return Object.fromEntries(
    nodes(d, 'Relationship')
      .filter((r) => r.getAttribute('TargetMode') !== 'External')
      .map((r) => [r.getAttribute('Id'), { target: resolve(part, r.getAttribute('Target') || ''), type: r.getAttribute('Type') || '' }]),
  );
}

// Tables become Markdown tables so the AI keeps rows and columns together.
// PowerPoint (a:tbl) and Word (w:tbl) share the tr/tc element names.
function table(tbl) {
  const rows = children(tbl, 'tr').map((tr) =>
    children(tr, 'tc').map((tc) => nodes(tc, 'p').map(runText).filter(Boolean).join('\n').trim().replace(/\|/g, '\\|').replace(/\s*\n\s*/g, '<br>')),
  );
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r) => '| ' + Array.from({ length: width }, (_, i) => r[i] || '').join(' | ') + ' |';
  return ['', line(rows[0]), '|' + ' --- |'.repeat(width), ...rows.slice(1).map(line), ''];
}
function chart(d) {
  if (!d) return [];
  const title = nodes(d, 'title')[0];
  const out = ['Chart' + (title ? ': ' + runText(title) : '')];
  const points = (el) => Object.fromEntries((el ? nodes(el, 'pt') : []).map((pt) => [pt.getAttribute('idx'), nodes(pt, 'v')[0]?.textContent ?? '']));
  for (const ser of nodes(d, 'ser')) {
    const name = children(ser, 'tx')[0] ? nodes(children(ser, 'tx')[0], 'v').map((v) => v.textContent).join(' ') : '';
    const cats = points(children(ser, 'cat')[0] || children(ser, 'xVal')[0]);
    const vals = points(children(ser, 'val')[0] || children(ser, 'yVal')[0]);
    const pairs = Object.entries(vals).slice(0, 40).map(([i, v]) => (cats[i] ? `${cats[i]}: ${v}` : v));
    out.push(`- ${name || 'Series'}${pairs.length ? ': ' + pairs.join('; ') : ''}`);
  }
  return out;
}
// SmartArt keeps its text in a separate data part, not in the slide.
const smartArt = (d) =>
  d ? nodes(d, 'pt').filter((pt) => (pt.getAttribute('type') || 'node') === 'node').map((pt) => nodes(pt, 'p').map(runText).join(' ').trim()).filter(Boolean).map((t) => '- ' + t) : [];

function paragraphs(txBody, bullets) {
  return children(txBody, 'p')
    .map((p) => {
      const text = runText(p).trim();
      if (!text) return '';
      const pPr = children(p, 'pPr')[0];
      const level = Number(pPr?.getAttribute('lvl') || 0);
      const bullet = pPr && (nodes(pPr, 'buChar').length || nodes(pPr, 'buAutoNum').length);
      const none = pPr && nodes(pPr, 'buNone').length;
      return (bullets && !none) || bullet ? '  '.repeat(level) + '- ' + text : text;
    })
    .filter(Boolean);
}
function walkShapes(root, visit) {
  for (const el of root.children) {
    if (['sp', 'graphicFrame', 'pic'].includes(el.localName)) visit(el);
    else if (el.localName === 'AlternateContent') el.firstElementChild && walkShapes(el.firstElementChild, visit);
    else if (!['txBody', 'spPr', 'extLst'].includes(el.localName)) walkShapes(el, visit);
  }
}
// Renders one slide or notes page in reading order. Returns its lines and the
// pictures large enough to carry teaching content.
function renderPart(zip, part, doc, { notes = false, slideArea = 0 } = {}) {
  const rels = relsOf(zip, part);
  const lines = [], images = [];
  let titled = false;
  const tree = nodes(doc, 'spTree')[0];
  if (tree)
    walkShapes(tree, (el) => {
      if (el.localName === 'sp') {
        const ph = nodes(el, 'ph')[0];
        const type = ph ? ph.getAttribute('type') || 'body' : '';
        const body = children(el, 'txBody')[0];
        if (!body || SKIP_PLACEHOLDER.test(type)) return;
        if (!notes && !titled && /^(title|ctrTitle)$/.test(type)) {
          const title = children(body, 'p').map(runText).join(' ').trim();
          if (title) lines.push('## ' + title);
          titled = Boolean(title);
          return;
        }
        lines.push(...paragraphs(body, !notes && /^(body|obj)$/.test(type)));
      } else if (el.localName === 'graphicFrame') {
        const tbl = nodes(el, 'tbl')[0];
        if (tbl) return void lines.push(...table(tbl));
        const chartId = nodes(el, 'chart')[0]?.getAttributeNS(REL, 'id');
        if (rels[chartId]) return void lines.push(...chart(read(zip, rels[chartId].target)));
        const dataId = nodes(el, 'relIds')[0]?.getAttributeNS(REL, 'dm');
        if (rels[dataId]) lines.push(...smartArt(read(zip, rels[dataId].target)));
      } else if (slideArea) {
        const target = rels[nodes(el, 'blip')[0]?.getAttributeNS(REL, 'embed')]?.target;
        const ext = nodes(el, 'xfrm')[0] && children(nodes(el, 'xfrm')[0], 'ext')[0];
        const area = ext ? Number(ext.getAttribute('cx')) * Number(ext.getAttribute('cy')) : 0;
        if (target && area >= SIGNIFICANT_AREA * slideArea && !images.includes(target)) images.push(target);
      }
    });
  return { lines, images };
}

export function extractPptx(bytes) {
  const zip = unzip(
    bytes,
    (n) =>
      /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/(_rels\/)?slide\d+\.xml(\.rels)?|notesSlides\/(_rels\/)?notesSlide\d+\.xml(\.rels)?|charts\/chart\d+\.xml|diagrams\/data\d+\.xml)$/.test(n),
    'Presentation',
  );
  const presentation = read(zip, 'ppt/presentation.xml'),
    rels = relsOf(zip, 'ppt/presentation.xml');
  if (!presentation || !Object.keys(rels).length) throw new Error('This is not a readable PowerPoint file.');
  const size = nodes(presentation, 'sldSz')[0];
  const slideArea = size ? Number(size.getAttribute('cx')) * Number(size.getAttribute('cy')) : 9144000 * 6858000;
  const slides = nodes(presentation, 'sldId');
  if (!slides.length || slides.length > 1000) throw new Error('Choose a presentation with 1–1,000 slides.');
  return slides
    .map((s, i) => {
      const path = rels[s.getAttributeNS(REL, 'id')]?.target;
      if (!/^ppt\/slides\/slide\d+\.xml$/.test(path || '')) throw new Error('Unsupported slide relationship. Export the deck as PDF.');
      const doc = read(zip, path);
      if (!doc) throw new Error(`Slide ${i + 1} is missing.`);
      if (doc.documentElement.getAttribute('show') === '0') return null; // hidden slide
      const slide = renderPart(zip, path, doc, { slideArea });
      const notePath = Object.values(relsOf(zip, path)).find((r) => /\/notesSlide$/.test(r.type))?.target;
      const notes = /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(notePath || '') && read(zip, notePath);
      const noteText = notes ? renderPart(zip, notePath, notes, { notes: true }).lines.join('\n') : '';
      const body = slide.lines.join('\n');
      return {
        label: `Slide ${i + 1}`,
        text: body + (noteText ? '\nSpeaker notes:\n' + noteText : ''),
        images: slide.images,
        warning: !body.trim() && !slide.images.length ? 'No slide text found.' : '',
      };
    })
    .filter(Boolean);
}

export function extractDocx(bytes) {
  const zip = unzip(bytes, (n) => /^word\/(document\.xml|_rels\/document\.xml\.rels)$/.test(n), 'Document');
  const doc = read(zip, 'word/document.xml');
  const body = doc && nodes(doc, 'body')[0];
  if (!body) throw new Error('This is not a readable Word file.');
  const rels = relsOf(zip, 'word/document.xml');
  const pg = nodes(doc, 'pgSz')[0];
  // Page size is in twentieths of a point; drawing extents are in EMUs (635 per twip).
  const pageArea = pg ? Number(pg.getAttributeNS(WORD, 'w')) * 635 * Number(pg.getAttributeNS(WORD, 'h')) * 635 : 7772400 * 10058400;
  const sections = [];
  let current = { heading: '', lines: [], images: [] };
  const text = (p) =>
    nodes(p, '*')
      .map((e) => (e.namespaceURI === WORD ? (e.localName === 't' ? e.textContent : e.localName === 'tab' ? ' ' : e.localName === 'br' ? '\n' : '') : ''))
      .join('')
      .trim();
  const visit = (container) => {
    for (const el of container.children) {
      if (el.localName === 'sdt') visit(children(el, 'sdtContent')[0] || el);
      else if (el.localName === 'tbl') current.lines.push(...table(el));
      else if (el.localName === 'p') {
        for (const d of nodes(el, 'drawing')) {
          const target = rels[nodes(d, 'blip')[0]?.getAttributeNS(REL, 'embed')]?.target;
          const ext = nodes(d, 'extent')[0];
          if (target && ext && Number(ext.getAttribute('cx')) * Number(ext.getAttribute('cy')) >= SIGNIFICANT_AREA * pageArea) current.images.push(target);
        }
        const value = text(el);
        if (!value) continue;
        const style = nodes(el, 'pStyle')[0]?.getAttributeNS(WORD, 'val') || '';
        const level = /^Title$/i.test(style) ? 1 : Number(style.match(/^Heading([1-6])$/i)?.[1] || 0);
        if (level === 1) {
          if (current.lines.length || current.images.length) sections.push(current);
          current = { heading: value, lines: ['# ' + value], images: [] };
        } else if (level) current.lines.push('#'.repeat(level) + ' ' + value);
        else if (nodes(el, 'numPr').length) current.lines.push('  '.repeat(Number(nodes(el, 'ilvl')[0]?.getAttributeNS(WORD, 'val') || 0)) + '- ' + value);
        else current.lines.push(value);
      }
    }
  };
  visit(body);
  if (current.lines.length || current.images.length) sections.push(current);
  return sections.map((s, i) => ({
    label: sections.length === 1 && !s.heading ? 'Document' : `Section ${i + 1}${s.heading ? ': ' + s.heading.slice(0, 60) : ''}`,
    text: s.lines.join('\n'),
    images: [...new Set(s.images)],
    warning: '',
  }));
}

async function reencode(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const max of [2000, 1400, 1000]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // transparent diagrams would otherwise turn black as JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (out && out.size <= MAX_IMAGE_BYTES) return out;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
// One image the AI declines (422) or fails on (502/504) is skipped. Quota,
// configuration and connection errors, or three failures in a row, stop the
// AI step so a broken setup does not burn through the quota.
function describeFailed(e, stats) {
  if (e.name === 'AbortError') throw e; // Cancel is not an AI failure
  stats.failed++;
  stats.streak++;
  if (![422, 502, 504].includes(e.status) || stats.streak >= 3) stats.stopped = e.message;
}
async function sendable(data, path) {
  const ext = path.split('.').pop().toLowerCase();
  const type = SENDABLE[ext] || DRAWABLE[ext];
  if (!type) return null; // EMF/WMF/TIFF cannot be decoded by the browser
  const blob = new Blob([data], { type });
  return SENDABLE[ext] && blob.size <= MAX_IMAGE_BYTES ? blob : reencode(blob);
}
// The optional AI step. `describe(blob, mode)` resolves to the transcription
// endpoint's { text, containsPersonalData }. Stops at the first failure (such
// as an exhausted quota) and keeps whatever was already described.
async function describeImages(bytes, pages, describe, progress, stats, signal) {
  const wanted = [...new Set(pages.flatMap((p) => p.images))];
  const take = wanted.slice(0, MAX_DESCRIBED);
  stats.overLimit = wanted.length - take.length;
  if (!take.length) return;
  let total = 0;
  const media = unzipSync(bytes, {
    filter: (f) => {
      if (!take.includes(f.name)) return false;
      total += f.originalSize;
      if (f.originalSize > 20 * 1024 * 1024 || total > 300 * 1024 * 1024) throw new Error('Images in this file are too large to describe. Split the file and try again.');
      return true;
    },
  });
  const results = new Map();
  for (const [i, path] of take.entries()) {
    signal?.throwIfAborted();
    progress(`Describing image ${i + 1} of ${take.length} with AI`);
    const blob = media[path] && (await sendable(media[path], path));
    if (!blob) {
      stats.unsupported++;
      continue;
    }
    try {
      const r = await describe(blob, 'diagram');
      stats.streak = 0;
      if (r.containsPersonalData) stats.personal++;
      else results.set(path, String(r.text || '').trim());
    } catch (e) {
      describeFailed(e, stats);
      if (stats.stopped) break;
    }
  }
  for (const p of pages) {
    const described = p.images.filter((x) => results.get(x));
    if (described.length)
      p.text += described.map((x) => `\n\n[Image description, AI-generated: check against the original]\n${results.get(x)}`).join('');
    // Images the AI judged decorative return empty text and count as read.
    p.images = p.images.filter((x) => !results.has(x));
  }
  stats.described = [...results.values()].filter(Boolean).length;
}

// True when a PDF page draws a picture (photo, chart or diagram exported as
// an image) covering a significant share of the page. Follows the
// transformation matrix to each image's drawn size. Diagrams drawn as vector
// shapes are not detected: code blocks and tables draw shapes too.
export async function pdfPageHasFigure(lib, page) {
  const { OPS, Util } = lib;
  const ops = await page.getOperatorList();
  const [x0, y0, x1, y1] = page.view;
  const pageArea = Math.abs((x1 - x0) * (y1 - y0)) || 1;
  const images = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (const [i, fn] of ops.fnArray.entries()) {
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (args?.[0]) ctm = Util.transform(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    // images are drawn into the unit square, so the matrix determinant is their area
    else if (images.includes(fn) && Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) >= SIGNIFICANT_AREA * pageArea) return true;
  }
  return false;
}

// Reads every page's text and keeps the document open for describePdfPages().
// The caller destroys the returned task.
async function readPdf(bytes, progress, signal) {
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: bytes, isEvalSupported: false });
  try {
    const doc = await task.promise;
    if (doc.numPages > 1000) throw new Error('Split PDFs longer than 1,000 pages.');
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      signal?.throwIfAborted();
      progress(`Reading page ${n} of ${doc.numPages}`);
      const p = await doc.getPage(n),
        tc = await p.getTextContent();
      const text = tc.items
        .map((t) => t.str + (t.hasEOL ? '\n' : ' '))
        .join('')
        .replace(/[ \t]+/g, ' ')
        .trim();
      const scanned = text.length < 30;
      // a scanned page is one big image; its text is transcribed instead
      const figure = !scanned && (await pdfPageHasFigure(lib, p));
      pages.push({ label: `Page ${n}`, text, images: figure ? [`page:${n}`] : [], scanned, warning: '' });
      p.cleanup();
    }
    return { pages, doc, task };
  } catch (e) {
    await task.destroy();
    throw e;
  }
}
// Sends rendered pages to AI: scanned pages are transcribed, and pages with
// figures get the figures described (their text layer is already read).
async function describePdfPages(doc, pages, describe, progress, stats, signal) {
  const wanted = pages.filter((p) => p.scanned || p.images.length);
  let attempted = 0;
  for (const [n, page] of wanted.entries()) {
    signal?.throwIfAborted();
    if (stats.stopped) break;
    if (attempted >= MAX_DESCRIBED) {
      stats.overLimit = wanted.length - n;
      break;
    }
    attempted++; // Empty successful responses still consume an AI attempt.
    const i = pages.indexOf(page);
    progress(page.scanned ? `Transcribing scanned page ${i + 1} with AI` : `Describing figures on page ${i + 1} with AI`);
    try {
      const p = await doc.getPage(i + 1);
      const vp1 = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: Math.min(2, 2000 / Math.max(vp1.width, vp1.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await p.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      p.cleanup();
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      const r = await describe(blob, page.scanned ? 'text' : 'figures');
      stats.streak = 0;
      const text = String(r.text || '').trim();
      if (r.containsPersonalData) stats.personal++;
      else if (!page.scanned) {
        // empty text: the AI judged the picture decorative, so it counts as read
        if (text) page.text += `\n\n[Figure description, AI-generated: check against the original]\n${text}`;
        page.images = [];
        if (text) stats.described++;
      } else if (text) {
        page.text = `[Scanned page, AI-transcribed: check against the original]\n${text}`;
        page.scanned = false;
        stats.transcribed++;
      }
    } catch (e) {
      describeFailed(e, stats);
    }
  }
}

// One summary per file, shown next to it in the upload list.
function summarize(pages, stats, describe, kind) {
  const unread = pages.filter((p) => p.images.length).length;
  const notes = [];
  if (stats.described) notes.push(`${plural(stats.described, 'image')} described by AI. Check them in the report.`);
  if (stats.transcribed) notes.push(`${plural(stats.transcribed, 'scanned page')} transcribed by AI. Check them in the report.`);
  if (unread) notes.push(`${plural(unread, kind)} with diagrams or pictures that were not read${describe ? '' : '. Tick “Describe images with AI” and use Replace to include them'}.`);
  if (stats.scanned) notes.push(`${plural(stats.scanned, 'page')} look scanned and had no readable text${describe ? '' : '. Tick “Describe images with AI” and use Replace to transcribe them'}.`);
  if (stats.unsupported) notes.push(`${plural(stats.unsupported, 'image')} use a format the browser cannot read (such as EMF). Describe them in the report yourself.`);
  if (stats.failed) notes.push(`${plural(stats.failed, 'image')} could not be described by AI. Describe ${stats.failed === 1 ? 'it' : 'them'} in the report yourself.`);
  if (stats.personal) notes.push(`${plural(stats.personal, 'image')} looked like they contained personal data and were skipped.`);
  if (stats.overLimit) notes.push(`Only the first ${MAX_DESCRIBED} ${kind === 'page' ? 'pages' : 'images'} were sent to AI; ${stats.overLimit} more were not.`);
  if (stats.stopped) notes.push(`AI description stopped early: ${stats.stopped}`);
  return notes.join(' ');
}

export const originOf = (name) => (/\.pdf$/i.test(name) ? 'pdf' : PRESENTATION.test(name) ? 'pptx' : /\.docx$/i.test(name) ? 'docx' : 'text');

// Returns { pages, note, fingerprint }, or null when `accept(fingerprint)`
// declines the file. Aborting `signal` stops at the next page or image with an
// AbortError. `fingerprint` identifies the file's own content and is
// checked before any AI step, so a duplicate costs no AI requests.
export async function extractFile(file, progress = () => {}, { describe, accept = async () => true, signal } = {}) {
  if (/\.(ppt|pps|pot)$/i.test(file.name))
    throw new Error('This is the older PowerPoint format. Open it in PowerPoint, choose File › Save As › PowerPoint Presentation (.pptx), then upload the .pptx.');
  if (/\.doc$/i.test(file.name)) throw new Error('This is the older Word format. Open it in Word, choose File › Save As › Word Document (.docx), then upload the .docx.');
  if (file.size > 100 * 1024 * 1024) throw new Error('Choose files up to 100 MB each.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stats = { described: 0, transcribed: 0, unsupported: 0, personal: 0, overLimit: 0, stopped: '', failed: 0, streak: 0 };
  let pages, kind, pdf;
  if (PRESENTATION.test(file.name)) [pages, kind] = [extractPptx(bytes), 'slide'];
  else if (/\.docx$/i.test(file.name)) [pages, kind] = [extractDocx(bytes), 'section'];
  else if (/\.pdf$/i.test(file.name)) [pdf, kind] = [await readPdf(bytes, progress, signal), 'page'];
  else if (/\.(txt|md|csv)$/i.test(file.name)) [pages, kind] = [[{ label: 'Text', text: new TextDecoder().decode(bytes), images: [], warning: '' }], 'part'];
  else throw new Error('Choose PDF, PowerPoint, Word, TXT, Markdown or CSV. Transcribe images in the AI drafting material library.');
  try {
    pages ||= pdf.pages;
    const fingerprint = JSON.stringify(pages.map((p) => [p.label, p.text]));
    if (!(await accept(fingerprint))) return null;
    signal?.throwIfAborted();
    if (describe && pdf) await describePdfPages(pdf.doc, pages, describe, progress, stats, signal);
    else if (describe) await describeImages(bytes, pages, describe, progress, stats, signal);
    stats.scanned = pages.filter((p) => p.scanned).length;
    return { pages, note: summarize(pages, stats, describe, kind), fingerprint };
  } finally {
    await pdf?.task.destroy();
  }
}
