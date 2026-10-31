import { TOWN_AVATAR_ORIGINAL_COLOR } from '../../../config/tuning.js';
import { drawAvatarCosmetics as drawCosmeticLayer, drawCosmeticIcon as drawCosmeticArtIcon } from '../../../public/hero-lab/avatar-cosmetic-art.js';
import { AVATAR_COSMETIC_BY_ID } from './kingdom/avatar-cosmetics.js';

export { COSMETIC_HEADROOM } from '../../../public/hero-lab/avatar-cosmetic-art.js';

// Draw one catalog hat or pin centered in a square (wardrobe buttons).
export function drawCosmeticIcon(context, id, { x, y, size }) {
  const slot = AVATAR_COSMETIC_BY_ID[id]?.slot;
  if (slot !== 'hat' && slot !== 'accessory') return false;
  return drawCosmeticArtIcon(context, id, { x, y, size });
}

let playerVisualPromise;

export function loadPlayerVisuals() {
  if (!playerVisualPromise) playerVisualPromise = (async () => {
    const response = await fetch('/hero-lab/hero-visuals.json');
    if (!response.ok) throw new Error('Player animation settings unavailable');
    const config = await response.json();
    const visual = config.HERO_VISUALS.player;
    const frames = {};
    await Promise.all(Object.entries(visual.frames).map(async ([name, filename]) => {
      const image = new Image();
      image.src = encodeURI(`${config.assetBase}${filename}`);
      await image.decode();
      frames[name] = image;
    }));
    return { config, visual, frames, tintCache: new Map() };
  })();
  return playerVisualPromise;
}

const heroVisualCache = new Map();

export async function loadOwnedHeroVisuals(heroIds) {
  const { config } = await loadPlayerVisuals();
  const ids = [...new Set(heroIds)];
  await Promise.all(ids.map(async (id) => {
    if (heroVisualCache.has(id)) return;
    const visual = config.HERO_VISUALS[id];
    if (!visual) { heroVisualCache.set(id, null); return; }
    const pending = (async () => {
      const frames = {};
      await Promise.all(['open', 'closed'].map(async (name) => {
        const filename = visual.frames[name];
        if (!filename) return;
        const image = new Image();
        image.src = encodeURI(config.assetBase + filename);
        try { await image.decode(); frames[name] = image; }
        catch (error) { console.warn('[Town hero sprite] Could not load ' + filename + '.', error); }
      }));
      return { visual, frames };
    })();
    heroVisualCache.set(id, pending);
  }));
  const heroes = new Map();
  await Promise.all(ids.map(async (id) => {
    const record = await heroVisualCache.get(id);
    if (record) heroes.set(id, record);
  }));
  return { config, heroes };
}

export function tintedPlayerFrames(visuals, color) {
  const key = String(color || '').toUpperCase();
  if (visuals.tintCache.has(key)) return visuals.tintCache.get(key);
  const crop = visuals.visual.crop.open;
  const result = {};
  if (key === TOWN_AVATAR_ORIGINAL_COLOR) {
    const [sx, sy, width, height] = crop;
    for (const [name, image] of Object.entries(visuals.frames)) {
      const frame = document.createElement('canvas');
      frame.width = width; frame.height = height;
      frame.getContext('2d').drawImage(image, sx, sy, width, height, 0, 0, width, height);
      result[name] = frame;
    }
    visuals.tintCache.set(key, result);
    return result;
  }
  const [sx, sy, width, height] = crop;
  const rgb = [1, 3, 5].map((index) => Number.parseInt(key.slice(index, index + 2), 16));
  for (const [name, image] of Object.entries(visuals.frames)) {
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    const context = frame.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, sx, sy, width, height, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
      // Tint the grayscale fur, leaving the near-black outline and bright eyes
      // and mouth intact. Preserve the original alpha and fur shading.
      if (light < 24 || light > 235) continue;
      const shade = 0.48 + 0.52 * (light / 255);
      data[i] = Math.round(rgb[0] * shade);
      data[i + 1] = Math.round(rgb[1] * shade);
      data[i + 2] = Math.round(rgb[2] * shade);
    }
    context.putImageData(pixels, 0, 0);
    result[name] = frame;
  }
  visuals.tintCache.set(key, result);
  return result;
}

// Keep the cosmetic art, scale, anchor and opacity consistent in the Castle
// mirror, Duel, World, and walkable Kingdom: every view draws through the
// shared Hero Lab module, which Campfire Run also uses. Coordinates describe
// the cropped sprite bounds as drawn; pass facing = -1 for a mirrored sprite
// and alpha only when the whole character is meant to fade.
// Only IDs in the server catalog (and with shared art) are drawn.
export function drawAvatarCosmetics(context, { left, top, width, height, hatId, accessoryId, facing = 1, alpha = 1 }) {
  drawCosmeticLayer(context, {
    left, top, width, height, facing, alpha,
    hatId: AVATAR_COSMETIC_BY_ID[hatId]?.slot === 'hat' ? hatId : null,
    accessoryId: AVATAR_COSMETIC_BY_ID[accessoryId]?.slot === 'accessory' ? accessoryId : null,
  });
}
