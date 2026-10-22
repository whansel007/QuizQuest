// Authored lecture fixture: worked examples and misconceptions, not a provider
// mock. Live verification uploads these complementary PDF/PPTX excerpts.
const { zipSync, strToU8 } = require('fflate');
const slides = [
  {
    title: '1. Packets and end-to-end delivery',
    text: 'A network carries application data as packets. Each packet contains a header with destination addressing information and a payload containing application data. Routers inspect destination information to forward packets between networks. Forwarding a packet does not by itself guarantee that the entire application message arrives correctly. In this lecture, distinguish the job of delivering a packet from the job of providing reliable application communication.',
    notes: 'Learning goal: identify which layer or device addresses a particular delivery problem.',
  },
  {
    title: '2. Latency and bandwidth',
    text: "Latency is the time required for data to travel from a sender to a receiver. Bandwidth is a link's maximum transfer capacity per second. These are different properties. A link can have high bandwidth and high latency at the same time. A video conversation is sensitive to delay; transferring a large backup is sensitive to capacity. Upgrading capacity alone does not necessarily remove delay caused by a long physical path.",
    notes: 'Misconception: a high-capacity connection must always provide immediate interactive responses.',
  },
  {
    title: '3. Transmission delay: a worked example',
    text: 'Transmission delay is packet size in bits divided by link rate in bits per second. A packet of 8,000 bits on a link of 2,000,000 bits per second has a transmission delay of 0.004 seconds, or 4 milliseconds. Doubling link rate halves transmission delay if packet size stays constant. Doubling packet size doubles transmission delay if link rate stays constant. Use decimal units in these examples: one megabit equals 1,000,000 bits.',
    notes: 'Keep bits and bytes distinct. One byte contains eight bits. A 1,000-byte packet contains 8,000 bits.',
  },
  {
    title: '4. Components of delay',
    text: 'The end-to-end delay discussed here includes processing, queueing, transmission and propagation delay. Processing includes inspecting a packet header. Queueing is time spent waiting for a link. Transmission is time spent placing packet bits onto a link. Propagation is time spent travelling through the physical medium. A longer cable increases propagation delay; a higher link rate reduces transmission delay. A higher link rate does not necessarily change propagation speed.',
    notes: 'Comparison example: adding capacity can reduce transmission time while leaving the physical travel time unchanged.',
  },
  {
    title: '5. Queueing, congestion and loss',
    text: "Packets wait in a queue when a link cannot immediately transmit them. Sustained offered traffic above link capacity causes the waiting queue to grow. A finite buffer eventually fills, causing newly arriving packets to be dropped in the simple model used here. Adding buffer space can postpone dropping but does not increase the link's sustainable service rate. More waiting space may also permit larger queueing delay. Removing a persistent capacity shortfall requires reducing offered traffic or increasing service capacity.",
    notes: 'Ask students to explain why a larger buffer alone cannot fix sustained overload.',
  },
  {
    title: '6. Bottleneck capacity',
    text: 'For the simple path model in this lecture, maximum sustainable end-to-end throughput cannot exceed the capacity of its slowest link. A path with link capacities of 20, 5 and 12 megabits per second has a 5 megabit per second bottleneck. Increasing only the 20 megabit link to 40 does not remove the 5 megabit bottleneck. Actual achieved throughput can be lower because of contention or protocol overhead; do not claim it always equals the bottleneck capacity.',
    notes: 'Assessment focus: distinguish an upper bound from a guaranteed achieved rate.',
  },
  {
    title: '7. Local switches and routers',
    text: 'A switch connects devices in a local network and forwards frames within that network. A router forwards packets between networks based on destination network information. A student sending data to a server in another network needs routing between those networks. Merely adding more local switch ports does not provide a route to a remote network. This lecture does not cover the internal forwarding-table algorithms, so questions must not assume details of those algorithms.',
    notes: 'Explicit scope boundary: do not ask about unspecified routing protocols or table lookup implementations.',
  },
  {
    title: '8. Reliable delivery and retransmission',
    text: 'In the reliability model used here, a sender can use acknowledgements and retransmission to recover from packet loss. When expected confirmation does not arrive before a timeout, the sender may retransmit. An acknowledgement confirms successful receipt of the relevant data; it does not expand link bandwidth. Retransmission adds traffic and may increase completion time. A lost acknowledgement can lead to retransmitting data that already arrived, so receivers need a way to recognise repeated data in a reliable protocol.',
    notes: 'Reasoning example: absence of an acknowledgement does not prove that the original data packet was lost.',
  },
  {
    title: '9. Choosing an application trade-off',
    text: 'A bulk archive transfer values complete and correct delivery even if recovery takes extra time. A live conversation values timely delivery; extremely late information can be less useful than missing information. The appropriate delivery policy depends on application requirements. This lecture does not claim that one protocol is always best for every real-time application. Assessment scenarios should state their reliability and timing requirements explicitly.',
    notes: 'A good scenario question gives enough requirements to support one answer rather than relying on application stereotypes.',
  },
  {
    title: '10. Measurement and diagnosis',
    text: 'An application with low measured throughput and large queueing delays may be experiencing congestion. High delay alone does not uniquely identify its cause: propagation, processing, queueing and transmission can all contribute. Compare measurements against a stated hypothesis. For example, if a capacity upgrade reduces transmission time but leaves a substantial fixed delay unchanged, the remaining delay may come from another component. Avoid claiming a diagnosis is certain without enough evidence.',
    notes: 'Distinguish a plausible explanation from a uniquely proven cause.',
  },
  {
    title: '11. Integrated worked scenario',
    text: 'Consider a path with a 4 megabit per second bottleneck. A 1,000-byte packet has a 2 millisecond transmission delay on that link: 8,000 divided by 4,000,000 seconds. Suppose the scenario specifies 10 milliseconds of propagation delay and 3 milliseconds of queueing delay, with processing delay ignored. The total for those stated components is 15 milliseconds. Increasing the bottleneck to 8 megabits per second reduces transmission delay to 1 millisecond, giving 14 milliseconds total if the other stated components remain unchanged.',
    notes: 'Do not add unstated return-path or acknowledgement delays. State all assumptions in a calculation question.',
  },
  {
    title: '12. Review and assessment boundaries',
    text: 'Students should explain latency versus capacity, calculate transmission delay with correct units, reason about queueing and finite buffers, identify a bottleneck upper bound, distinguish switching from routing, and evaluate acknowledgement/retransmission trade-offs. Moderate questions can apply one concept in a short scenario. Challenging questions can combine several stated facts or compare interventions. Every question must have one defensible answer supported by these notes; avoid facts about topics not taught in this lecture.',
    notes: 'Professor preference: assess understanding and application rather than memorising a list of definitions.',
  },
];
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function makePptx(items = slides.slice(6)) {
  const p = 'http://schemas.openxmlformats.org/presentationml/2006/main',
    a = 'http://schemas.openxmlformats.org/drawingml/2006/main',
    r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = (inner) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${inner}</Relationships>`;
  const tx = (text) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Content"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${text
      .split('\n')
      .map((t) => `<a:p><a:r><a:t>${escapeXml(t)}</a:t></a:r></a:p>`)
      .join('')}</p:txBody></p:sp>`;
  const tree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
  const files = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${items.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join('')}</Types>`,
    '_rels/.rels': rels(`<Relationship Id="rId1" Type="${r}/officeDocument" Target="ppt/presentation.xml"/>`),
    'ppt/presentation.xml': `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst>${items.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(
      items.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${r}/slide" Target="slides/slide${i + 1}.xml"/>`).join(''),
    ),
  };
  items.forEach((s, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] =
      `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree>${tree}${tx(s.title + '\n' + s.text)}</p:spTree></p:cSld></p:sld>`;
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = rels(
      `<Relationship Id="rId1" Type="${r}/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/>`,
    );
    files[`ppt/notesSlides/notesSlide${i + 1}.xml`] =
      `<p:notes xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree>${tree}${tx(s.notes)}</p:spTree></p:cSld></p:notes>`;
  });
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
}
function makePdf(items = slides.slice(0, 6)) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const ids = [];
  items.forEach((s) => {
    const id = objects.length + 1,
      contentId = id + 1;
    ids.push(id);
    const text = [s.title, ...(s.text + ' Notes: ' + s.notes).match(/.{1,85}(?:\s|$)/g)].map((s) => s.trim().replace(/([()\\])/g, '\\$1'));
    const content = 'BT /F1 11 Tf 40 750 Td ' + text.map((s, i) => (i ? '0 -17 Td ' : '') + `(${s}) Tj`).join('\n') + ' ET';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  });
  objects[1] = `<< /Type /Pages /Kids [${ids.map((i) => i + ' 0 R').join(' ')}] /Count ${ids.length} >>`;
  let value = '%PDF-1.4\n',
    offsets = [];
  objects.forEach((s, i) => {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${s}\nendobj\n`;
  });
  const offset = Buffer.byteLength(value);
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(value);
}
module.exports = { slides, makePdf, makePptx };
