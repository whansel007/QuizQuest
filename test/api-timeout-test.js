const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

test('API requests honor an explicit deadline when the server never responds', async t => {
  const server = http.createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const source = fs.readFileSync('web/src/api.js', 'utf8')
    .replace("from 'axios'", `from '${pathToFileURL(require.resolve('axios')).href}'`)
    .replace("from 'vue'", `from '${pathToFileURL(require.resolve('vue')).href}'`);
  const { api } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const controller = new AbortController();
  const watchdog = setTimeout(() => controller.abort(), 1000);
  t.after(() => clearTimeout(watchdog));
  await assert.rejects(api('GET', `http://127.0.0.1:${server.address().port}/authoring`, null,
    { timeout: 30, signal: controller.signal }), /timed out/i);
});
