// Syntax-check the shipped Node and browser modules without bundling them.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(js|cjs)$/.test(p) ? [p] : [];
  });
}
const files = ['server.js', ...['src', 'public', 'test', 'scripts'].flatMap(walk)];
for (const file of files) {
  const browserModule = file.startsWith(path.join('public', 'app') + path.sep);
  const result = spawnSync(process.execPath,
    browserModule ? ['--input-type=module', '--check'] : ['--check', file],
    { input: browserModule ? fs.readFileSync(file, 'utf8') : undefined, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(file, result.stderr || result.error);
    process.exit(1);
  }
}
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
