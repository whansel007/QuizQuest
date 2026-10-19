const { zipSync, strToU8 } = require('fflate');
const lecture =
  'Latency is the time a packet takes to travel from sender to receiver. Bandwidth is the maximum data transferred per second. A router forwards packets between networks using destination addresses. A switch connects devices inside one local network. Congestion occurs when offered traffic exceeds capacity and queues grow.';
function pptx() {
  const ns =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const slide = (t) =>
    `<p:sld ${ns}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const files = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'ppt/presentation.xml':
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml': slide('Slide two: ' + lecture),
    'ppt/slides/slide2.xml': slide('Slide one: Latency &amp; bandwidth. ' + lecture),
    'ppt/slides/_rels/slide2.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide7.xml"/></Relationships>',
    'ppt/notesSlides/notesSlide7.xml': slide('Speaker example: a high-capacity link can still have high latency.'),
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
}
function pdf(padding = 0) {
  const lines = lecture.match(/.{1,75}(?:\s|$)/g);
  const content = 'BT /F1 12 Tf 50 750 Td ' + lines.map((s, i) => `${i ? '0 -20 Td ' : ''}(${s.trim()}) Tj`).join('\n') + ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let value = '%PDF-1.4\n' + (padding ? '%' + ' '.repeat(padding) + '\n' : ''),
    offsets = [0];
  objects.forEach((s, i) => {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${s}\nendobj\n`;
  });
  const offset = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(value);
}
module.exports = { lecture, pptx, pdf };
