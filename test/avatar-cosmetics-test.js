// ============================================================
// Avatar cosmetics: the server catalog and the shared storybook art agree,
// worn cosmetics always paint opaque, and new catalog items can be bought
// and equipped through the server-authoritative wardrobe routes.
// Run with:  node --test test/avatar-cosmetics-test.js
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');
const { AVATAR_COSMETIC_CATALOG, AVATAR_COSMETIC_BY_ID } = require('../config/avatar-cosmetics');

const loadArt = () => import('../public/hero-lab/avatar-cosmetic-art.js');
const wearables = AVATAR_COSMETIC_CATALOG.filter((item) => item.slot === 'hat' || item.slot === 'accessory');

test('every catalog hat and pin has shared art with the same slot and anchor', async () => {
  const { COSMETIC_ART, COSMETIC_ANCHORS } = await loadArt();
  for (const item of wearables) {
    const art = COSMETIC_ART[item.id];
    assert.ok(art, `${item.id} has art`);
    assert.equal(art.slot, item.slot, `${item.id} slot`);
    assert.equal(art.anchor, item.anchor, `${item.id} anchor`);
    assert.ok(COSMETIC_ANCHORS[art.anchor], `${item.id} anchor is defined`);
    assert.ok(art.scale > 0 && art.scale < 1, `${item.id} scale is a fraction of sprite width`);
    assert.equal(typeof art.draw, 'function');
  }
  for (const id of Object.keys(COSMETIC_ART)) assert.ok(AVATAR_COSMETIC_BY_ID[id], `${id} art is listed in the catalog`);
});

test('catalog keeps existing prices and gives new items a valid provisional price', () => {
  const original = {
    hat_ribbon: [null, 0], hat_top_hat: ['wood', 8], hat_crown: ['crystal', 3], hat_cowboy: ['herb', 6],
    accessory_star_pin: [null, 0], accessory_leaf_pin: ['herb', 3], accessory_heart_pin: ['crystal', 2],
  };
  for (const [id, [currency, cost]] of Object.entries(original)) {
    assert.deepEqual([AVATAR_COSMETIC_BY_ID[id].currency, AVATAR_COSMETIC_BY_ID[id].cost], [currency, cost], id);
  }
  const added = wearables.filter((item) => !Object.hasOwn(original, item.id));
  assert.ok(added.length >= 6, 'new hats and pins were added');
  assert.ok(added.some((item) => item.slot === 'hat') && added.some((item) => item.slot === 'accessory'));
  for (const item of added) {
    assert.match(item.id, item.slot === 'hat' ? /^hat_[a-z_]+$/ : /^accessory_[a-z_]+$/);
    assert.ok(['wood', 'crystal', 'herb'].includes(item.currency), `${item.id} currency`);
    assert.ok(Number.isSafeInteger(item.cost) && item.cost > 0, `${item.id} cost`);
    assert.ok(item.name && item.description, `${item.id} copy`);
  }
  assert.equal(new Set(AVATAR_COSMETIC_CATALOG.map((item) => item.id)).size, AVATAR_COSMETIC_CATALOG.length, 'IDs are unique');
});

// A minimal 2D context that records the paint state at every fill/stroke.
function recordingContext(initial) {
  const paints = [];
  let state = { ...initial };
  const stack = [];
  const ctx = new Proxy({}, {
    get(_, key) {
      if (key === 'save') return () => stack.push({ ...state });
      if (key === 'restore') return () => { state = stack.pop() || state; };
      if (key === 'fill' || key === 'stroke') return () => paints.push({ ...state });
      if (key in state) return state[key];
      if (key === 'filter') return undefined;
      return () => {};
    },
    set(_, key, value) { state[key] = value; return true; },
    has(_, key) { return key in state; },
  });
  return { ctx, paints, current: () => state };
}

test('worn cosmetics paint opaque without inheriting a caller fade or shadow', async () => {
  const { drawAvatarCosmetics, drawCosmeticIcon } = await loadArt();
  const translucent = { globalAlpha: 0.2, shadowColor: 'red', shadowBlur: 12, fillStyle: 'rgba(35,56,47,.2)', globalCompositeOperation: 'source-over', filter: 'none' };
  for (const item of wearables) {
    const { ctx, paints, current } = recordingContext(translucent);
    drawAvatarCosmetics(ctx, { left: 0, top: 0, width: 100, height: 110, hatId: item.slot === 'hat' ? item.id : null, accessoryId: item.slot === 'accessory' ? item.id : null });
    assert.ok(paints.length > 0, `${item.id} draws`);
    for (const paint of paints) {
      assert.equal(paint.globalAlpha, 1, `${item.id} opaque`);
      assert.equal(paint.shadowBlur, 0, `${item.id} no shadow`);
    }
    assert.equal(current().globalAlpha, 0.2, 'the caller state is restored');
    const icon = recordingContext(translucent);
    assert.equal(drawCosmeticIcon(icon.ctx, item.id, { x: 20, y: 20, size: 40 }), true);
    assert.ok(icon.paints.every((paint) => paint.globalAlpha === 1));
  }
  const faded = recordingContext({ globalAlpha: 1 });
  drawAvatarCosmetics(faded.ctx, { left: 0, top: 0, width: 100, height: 110, hatId: 'hat_ribbon', accessoryId: null, alpha: 0.5 });
  assert.ok(faded.paints.every((paint) => paint.globalAlpha === 0.5), 'an intentional whole-character fade is honored');
  const unknown = recordingContext({ globalAlpha: 1 });
  drawAvatarCosmetics(unknown.ctx, { left: 0, top: 0, width: 100, height: 110, hatId: 'constructor', accessoryId: 'hat_ribbon' });
  assert.equal(unknown.paints.length, 0, 'unknown IDs and wrong slots draw nothing');
});

// ---------------- server: purchase and loadout ----------------
let srv;
let base;
async function call(token, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const login = async (userId) => (await call(null, 'POST', '/api/login', { userId })).body.token;

test.before(async () => {
  srv = start(0, { dataFile: null, debugMode: true });
  await new Promise((resolve) => srv.httpServer.once('listening', resolve));
  base = 'http://localhost:' + srv.httpServer.address().port;
});
test.after(() => srv.io.close());

test('new catalog cosmetics can be bought and equipped, and the saved look is reported', async () => {
  const token = await login('s-04');
  const wardrobe = await call(token, 'GET', '/api/student/castle/wardrobe');
  assert.equal(wardrobe.status, 200);
  const hat = wardrobe.body.catalog.find((item) => item.id === 'hat_wizard');
  const pin = wardrobe.body.catalog.find((item) => item.id === 'accessory_moon_pin');
  assert.ok(hat && pin, 'new items are listed');
  assert.equal(hat.anchor, 'head');
  assert.equal(pin.anchor, 'badge');

  await call(token, 'POST', '/api/student/debug/resources', { resource: hat.currency, balance: 0 });
  const broke = await call(token, 'POST', '/api/student/castle/wardrobe/purchase', { cosmeticId: hat.id, requestId: 'wizard-broke' });
  assert.equal(broke.status, 400, 'cannot buy without the resource');
  const notOwned = await call(token, 'PUT', '/api/student/castle/wardrobe/loadout', { hatId: hat.id, accessoryId: null });
  assert.equal(notOwned.status, 400, 'cannot equip an unowned hat');

  for (const item of [hat, pin]) {
    await call(token, 'POST', '/api/student/debug/resources', { resource: item.currency, balance: item.cost + 5 });
    const bought = await call(token, 'POST', '/api/student/castle/wardrobe/purchase', { cosmeticId: item.id, requestId: `buy-${item.id}` });
    assert.equal(bought.status, 200, JSON.stringify(bought.body));
    assert.ok(bought.body.ownedIds.includes(item.id));
    assert.equal(bought.body.resources[item.currency], 5, 'the catalog price is charged once');
  }

  const equipped = await call(token, 'PUT', '/api/student/castle/wardrobe/loadout', { hatId: hat.id, accessoryId: pin.id });
  assert.equal(equipped.status, 200, JSON.stringify(equipped.body));
  assert.deepEqual({ hat: equipped.body.avatarVisual.hat, accessory: equipped.body.avatarVisual.accessory }, { hat: hat.id, accessory: pin.id });
  const me = await call(token, 'GET', '/api/me');
  assert.deepEqual(me.body.avatarVisual, equipped.body.avatarVisual, 'the saved look reaches every view through the signed-in user');

  const wrongSlot = await call(token, 'PUT', '/api/student/castle/wardrobe/loadout', { hatId: pin.id });
  assert.equal(wrongSlot.status, 400, 'a pin cannot be worn as a hat');
  const fake = await call(token, 'POST', '/api/student/castle/wardrobe/purchase', { cosmeticId: 'hat_not_real', requestId: 'fake-1' });
  assert.equal(fake.status, 400, 'IDs outside the catalog are rejected');
});
