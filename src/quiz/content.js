// Preserve meaningful Markdown indentation while trimming surrounding blank lines.
// Plain single-line fields retain the established whitespace cleanup.
function contentText(value, max = Infinity) {
  if (typeof value !== 'string') return '';
  const text=value.replace(/\r\n?/g,'\n');
  if (!text.trim()) return '';
  return (text.includes('\n') || /^( {4}|\t)/.test(text)
    ? text.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g,'') : text.trim()).slice(0,max);
}
module.exports={contentText};
