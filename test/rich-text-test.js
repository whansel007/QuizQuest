const test = require('node:test');
const assert = require('node:assert/strict');
const renderer = import('../web/src/components/rich-text.mjs');
test('code fences preserve syntax, indentation, backticks and emphasis literally', async()=>{
  const {richBlocks}=await renderer;
  for(const [language,code] of [['css','.box {\n  content: "**literal** `tick`";\n  width: calc(100% - 2px);\n}'],['js','const label = `<div>${x}</div>`;\n  if (a < b && c > 1) run();']]) {
    const blocks=richBlocks('```'+language+'\n'+code+'\n```');
    assert.deepEqual(blocks,[{tag:'pre',language,text:code}]);
  }
  assert.deepEqual(richBlocks('    let a = 1;\n\t  run(a);'),[{tag:'pre',text:'let a = 1;\n  run(a);'}]);
  assert.equal(richBlocks('```js\nunfinished')[0].text,'unfinished');
});
test('inline formatting, lists, math, entities and unsafe HTML stay safe display text',async()=>{
  const {richBlocks,inlineText,displayText}=await renderer;
  assert.deepEqual(inlineText('Use `a < b` and **evidence** with *care*.'),[
    {tag:'span',text:'Use '},{tag:'code',text:'a < b'},{tag:'span',text:' and '},{tag:'strong',text:'evidence'},{tag:'span',text:' with '},{tag:'em',text:'care'},{tag:'span',text:'.'}]);
  assert.deepEqual(inlineText('`unfinished'),[{tag:'span',text:'`unfinished'}]);
  assert.deepEqual(richBlocks('- one\n- two\n1. first\n2. second').map(b=>b.tag),['ul','ol']);
  const math='Solve $x^2$ and \\(x + y\\) with {a}.';
  assert.equal(inlineText(math).map(p=>p.text).join(''),math);
  assert.equal(displayText('&lt;img onerror="run()"&gt; &amp; &#x3c; &#65;'),' <img onerror="run()"> & < A'.trimStart());
  assert.equal(displayText('&#99999999;'),'&#99999999;');
  assert.deepEqual(richBlocks('<script>run()</script>'),[{tag:'p',text:'<script>run()</script>'}]);
});

test('an asterisk with a space just inside is literal, as in Markdown', async () => {
  const { inlineText } = await import('../web/src/components/rich-text.mjs');
  assert.deepEqual(inlineText('(20px padding * 2) + (5px border * 2)'), [{ tag: 'span', text: '(20px padding * 2) + (5px border * 2)' }]);
  assert.deepEqual(inlineText('**bold**, *em* and *a*').map((p) => p.tag), ['strong', 'span', 'em', 'span', 'em']);
});
