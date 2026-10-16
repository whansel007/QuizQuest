// Safe display-only Markdown subset; never emits HTML or changes stored answers.
export function displayText(value = '') {
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, key) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
    if (key[0] !== '#') return named[key.toLowerCase()] ?? all;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  });
}
export function inlineText(value) {
  // As in Markdown, * with a space just inside (e.g. "padding * 2") is a literal asterisk.
  return displayText(value).split(/(`+[^`\n]+`+|\*\*(?=\S)[^*\n]*?\S\*\*|\*(?=\S)[^*\n]*?\S\*|\*\S\*)/g).filter(Boolean).map(text => {
    if (/^(`+)[^`\n]+\1$/.test(text)) { const n = text.match(/^`+/)[0].length; return { tag: 'code', text: text.slice(n, -n) }; }
    if (/^\*\*\S(?:[^*\n]*\S)?\*\*$/.test(text)) return { tag: 'strong', text: text.slice(2, -2) };
    if (/^\*\S(?:[^*\n]*\S)?\*$/.test(text)) return { tag: 'em', text: text.slice(1, -1) };
    return { tag: 'span', text };
  });
}
export function richBlocks(value = '') {
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n'), out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i], fence = line.match(/^\s{0,3}(`{3,}|~{3,})([^\s]*)\s*$/);
    if (fence) {
      const text = []; i++;
      const close = new RegExp('^\\s{0,3}' + fence[1][0] + '{' + fence[1].length + ',}\\s*$');
      while (i < lines.length && !close.test(lines[i])) text.push(lines[i++]);
      if (i < lines.length) i++;
      out.push({ tag: 'pre', text: displayText(text.join('\n')), language: fence[2] }); continue;
    }
    if (/^( {4}|\t)/.test(line)) {
      const text = [];
      while (i < lines.length && /^( {4}|\t)/.test(lines[i])) text.push(lines[i++].replace(/^( {4}|\t)/, ''));
      out.push({ tag: 'pre', text: displayText(text.join('\n')) }); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/), list = line.match(/^\s{0,3}([-*+]|\d+[.)])\s+(.+)$/);
    if (heading) { out.push({ tag: 'h' + heading[1].length, text: heading[2] }); i++; continue; }
    if (list) {
      const tag = /^\d/.test(list[1]) ? 'ol' : 'ul', items = [];
      while (i < lines.length) {
        const next = lines[i].match(/^\s{0,3}([-*+]|\d+[.)])\s+(.+)$/);
        if (!next || (/^\d/.test(next[1]) ? 'ol' : 'ul') !== tag) break;
        items.push(next[2]); i++;
      }
      out.push({ tag, items }); continue;
    }
    if (line.trim()) out.push({ tag: 'p', text: line });
    i++;
  }
  return out;
}
