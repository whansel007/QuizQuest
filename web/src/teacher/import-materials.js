import { unzipSync, strFromU8 } from 'fflate';
import { loadPdfJs } from './pdf.js';

const xml = (value) => {
  const d = new DOMParser().parseFromString(value, 'application/xml');
  if (d.getElementsByTagName('parsererror').length)
    throw new Error('This presentation contains unreadable XML. Export it as PDF and try again.');
  return d;
};
const nodes = (d, local) => [...d.getElementsByTagNameNS('*', local)];
const paragraphs = (d) =>
  nodes(d, 'p')
    .map((p) =>
      nodes(p, 't')
        .map((t) => t.textContent)
        .join(''),
    )
    .filter(Boolean)
    .join('\n');
export function extractPptx(bytes) {
  let total = 0;
  const zip = unzipSync(bytes, {
    filter: (f) => {
      if (
        !/^ppt\/(slides\/(?:_rels\/)?slide\d+\.xml(?:\.rels)?|notesSlides\/notesSlide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)$/.test(
          f.name,
        )
      )
        return false;
      total += f.originalSize;
      if (f.originalSize > 10 * 1024 * 1024 || total > 50 * 1024 * 1024)
        throw new Error('Presentation text is too large. Split the deck and try again.');
      return true;
    },
  });
  const read = (name) => (zip[name] ? xml(strFromU8(zip[name])) : null);
  const presentation = read('ppt/presentation.xml'),
    rels = read('ppt/_rels/presentation.xml.rels');
  if (!presentation || !rels) throw new Error('This is not a readable PPTX file.');
  const relationships = Object.fromEntries(nodes(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const slides = nodes(presentation, 'sldId');
  if (!slides.length || slides.length > 1000) throw new Error('Choose a presentation with 1–1,000 slides.');
  return slides.map((s, i) => {
    const target = relationships[s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')];
    const path = target?.startsWith('/ppt/') ? target.slice(1) : 'ppt/' + target;
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(path)) throw new Error('Unsupported slide relationship. Export the deck as PDF.');
    const doc = read(path);
    if (!doc) throw new Error(`Slide ${i + 1} is missing.`);
    const slideRels = read(path.replace('slides/', 'slides/_rels/') + '.rels');
    const noteRel = slideRels && nodes(slideRels, 'Relationship').find((r) => /\/notesSlide$/.test(r.getAttribute('Type')));
    const noteTarget = noteRel?.getAttribute('Target');
    const noteName = noteTarget?.match(/(?:^|\/)notesSlide\d+\.xml$/)?.[0].replace(/^\//, '');
    const notes = noteName && read('ppt/notesSlides/' + noteName);
    const body = paragraphs(doc),
      noteText = notes ? paragraphs(notes) : '';
    const hasVisual = nodes(doc, 'pic').length || nodes(doc, 'chart').length || nodes(doc, 'relIds').length;
    return {
      label: `Slide ${i + 1}`,
      text: body + (noteText ? '\nSpeaker notes:\n' + noteText : ''),
      warning: !body.trim()
        ? 'No slide text found. Add a description or use the existing image transcription tool.'
        : hasVisual
          ? 'Contains visuals. Check diagrams and charts against this extracted text.'
          : '',
    };
  });
}
export async function extractFile(file, progress = () => {}) {
  if (file.size > 100 * 1024 * 1024) throw new Error('Choose files up to 100 MB each.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.pptx$/i.test(file.name)) return extractPptx(bytes);
  if (/\.pdf$/i.test(file.name)) {
    const lib = await loadPdfJs();
    const task = lib.getDocument({ data: bytes, isEvalSupported: false });
    const doc = await task.promise;
    try {
      if (doc.numPages > 1000) throw new Error('Split PDFs longer than 1,000 pages.');
      const result = [];
      for (let n = 1; n <= doc.numPages; n++) {
        progress(`Reading page ${n} of ${doc.numPages}`);
        const p = await doc.getPage(n),
          tc = await p.getTextContent();
        const text = tc.items
          .map((t) => t.str + (t.hasEOL ? '\n' : ' '))
          .join('')
          .replace(/[ \t]+/g, ' ')
          .trim();
        result.push({
          label: `Page ${n}`,
          text,
          warning:
            text.length < 30
              ? 'Little or no text found. Use image transcription for scanned pages and review diagrams.'
              : 'Check diagrams and equations against the extracted text.',
        });
        p.cleanup();
      }
      return result;
    } finally {
      await task.destroy();
    }
  }
  if (/\.(txt|md|csv)$/i.test(file.name)) return [{ label: 'Text', text: new TextDecoder().decode(bytes), warning: '' }];
  throw new Error('Choose PDF, PPTX, TXT, Markdown or CSV. Images can be transcribed from Source material.');
}
