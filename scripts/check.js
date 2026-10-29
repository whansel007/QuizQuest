// Syntax-check the Node modules and the Vue app's plain JS modules.
// (.vue files are compiled - and so checked - by `pnpm build`.)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(js|cjs)$/.test(p) ? [p] : [];
  });
}
const files = ['server.js', ...['src', 'public', 'web/src', 'test', 'scripts', 'e2e'].flatMap(walk)];
// The browser modules and the end-to-end specs are ES modules. node --check
// reads a .js file as CommonJS unless it is told otherwise, so a stray
// import would look like a syntax error instead of being a valid module.
const esModule = (file) => file.startsWith(path.join('web', 'src') + path.sep) || file.startsWith('e2e' + path.sep);
for (const file of files) {
  const module = esModule(file);
  const result = spawnSync(process.execPath,
    module ? ['--input-type=module', '--check'] : ['--check', file],
    { input: module ? fs.readFileSync(file, 'utf8') : undefined, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(file, result.stderr || result.error);
    process.exit(1);
  }
}
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
