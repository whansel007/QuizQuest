// Stage-2 button palette contrast check.
// Rule: the WHITE icon must have >= 3:1 contrast against its button colour
// (WCAG 2.1 SC 1.4.11 non-text contrast), because the icons are white SVG
// glyphs drawn directly on the button face.
// Usage: node scratch/_stage2_contrast.js
import fs from 'node:fs';

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// White on colour: (1.0 + 0.05) / (L + 0.05)
const ratio = (hex) => 1.05 / (luminance(hex) + 0.05);

const CANDIDATES = {
  physical: { primary: '#2F96D4', skill: '#1E78C8', ultimate: '#2F3AB8' },
  magic: { primary: '#9B7BE8', skill: '#7B4FD8', ultimate: '#4B2AA8' },
  // Original amber family failed on primary (2.45:1); darkened just enough to
  // pass while keeping the same lightness steps as the other two families.
  highlight: { primary: '#C08400', skill: '#A86E00', ultimate: '#8A5800' },
};

let failures = 0;
for (const [family, slots] of Object.entries(CANDIDATES)) {
  for (const [slot, hex] of Object.entries(slots)) {
    const r = ratio(hex);
    const pass = r >= 3;
    if (!pass) failures++;
    console.log(
      `${family.padEnd(10)} ${slot.padEnd(9)} ${hex}  ${r.toFixed(2)}:1  ${pass ? 'PASS' : 'FAIL'}`
    );
  }
}
console.log(failures === 0 ? '\nAll 9 colours pass the 3:1 white-icon rule.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
