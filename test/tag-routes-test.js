// ============================================================
// The Circle Tag page is served at /tag
// ------------------------------------------------------------
// The page and its client live in public/tag/, but the server
// advertised the URL in its startup log and then answered 404,
// because the route still pointed at public/index.html (which
// does not exist) and public/client.js. This test boots the real
// server and checks both paths answer.
// Run with:  npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { start } = require('../server');

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: 'localhost', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body }));
    });
    req.on('error', reject);
  });
}

test('the Circle Tag page and its client are served', async (t) => {
  const srv = start(0, { dataFile: null }); // in-memory quiz DB: don't touch data/
  await new Promise((r) => srv.httpServer.once('listening', r));
  t.after(() => new Promise((r) => srv.httpServer.close(r)));
  const port = srv.httpServer.address().port;

  const page = await get(port, '/tag');
  assert.equal(page.status, 200, '/tag serves the Circle Tag page');
  assert.match(page.type, /text\/html/);
  assert.match(page.body, /<html/i, 'the response is the page itself, not a 404');

  // The page loads "client.js" relative to itself, and it is served at
  // /tag, so the browser asks for /client.js.
  const script = await get(port, '/client.js');
  assert.equal(script.status, 200, '/client.js serves the Circle Tag client');
  assert.match(script.type, /javascript/);
});
