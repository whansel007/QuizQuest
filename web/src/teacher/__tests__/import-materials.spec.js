import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractPptx } from '../import-materials.js';

// Practical slides (an exercise, a code box, a table of cases and speaker
// notes) must reach the knowledge report with nothing dropped.
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const para = (t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`;
const shape = (ph, lines) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="1" name="s"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody>${lines.map(para).join('')}</p:txBody></p:sp>`;
const cell = (t) => `<a:tc><a:txBody>${para(t)}</a:txBody></a:tc>`;
const table = (rows) =>
  `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${rows.map((r) => `<a:tr>${r.map(cell).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
const slide = (inner) => `<p:sld ${NS}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;

function deck() {
  const files = {
    'ppt/presentation.xml': `<p:presentation ${NS} xmlns:r="${REL}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>',
    'ppt/slides/slide1.xml': slide(
      shape('title', ['Exercise: fix the header']) +
        shape('body', ['Requirement: logo left, three links right', 'Must stay on one row at 600px']) +
        shape('', ['.nav {', '  display: flex;', '  justify-content: space-between;', '}']) +
        table([['Symptom', 'Cause'], ['Items stack vertically', 'Rule set on the child']]),
    ),
    'ppt/slides/_rels/slide1.xml.rels':
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
    'ppt/notesSlides/notesSlide1.xml': slide(shape('body', ['Ask students to predict the layout before running it.'])),
  };
  // Uint8Array.from: under jsdom, zipSync reads another realm's bytes as a folder.
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Uint8Array.from(strToU8(v))])));
}

describe('extractPptx keeps practical slide content', () => {
  it('keeps the exercise, its requirements, the code in order, the case table and the speaker notes', () => {
    const [page] = extractPptx(deck());
    expect(page.label).toBe('Slide 1');
    const lines = page.text.split('\n');
    expect(lines[0]).toBe('## Exercise: fix the header');
    expect(lines).toContain('- Requirement: logo left, three links right');
    expect(lines).toContain('- Must stay on one row at 600px');
    // Code boxes are not bulleted and keep their line order (leading spaces are trimmed).
    expect(page.text).toContain('.nav {\ndisplay: flex;\njustify-content: space-between;\n}');
    expect(page.text).toContain('| Symptom | Cause |');
    expect(page.text).toContain('| Items stack vertically | Rule set on the child |');
    expect(page.text).toContain('Speaker notes:\nAsk students to predict the layout before running it.');
  });
});
