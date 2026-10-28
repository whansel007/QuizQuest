const configPromise = fetch('/hero-lab/hero-visuals.json').then((response) => {
  if (!response.ok) throw new Error(`Hero visuals config returned ${response.status}`);
  return response.json();
});

export function loadHeroVisualConfig() {
  return configPromise;
}

function imageUrl(base, filename) {
  return encodeURI(`${base}${filename}`);
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function rasterize(image, sizePx, dpr) {
  const ratio = image.naturalWidth / image.naturalHeight || 1;
  const width = Math.max(1, Math.round(sizePx * ratio * dpr));
  const height = Math.max(1, Math.round(sizePx * dpr));
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const silhouette = makeCanvas(width, height);
  const silhouetteContext = silhouette.getContext('2d');
  silhouetteContext.drawImage(canvas, 0, 0);
  silhouetteContext.globalCompositeOperation = 'source-in';
  silhouetteContext.fillStyle = '#fff';
  silhouetteContext.fillRect(0, 0, width, height);
  return { canvas, silhouette, width: width / dpr, height: height / dpr };
}

export async function preloadHeroSprites({ onWarning = console.warn } = {}) {
  const config = await loadHeroVisualConfig();
  const dpr = Math.max(config.SPRITE_DPR_MIN, window.devicePixelRatio || config.SPRITE_DPR_MIN);
  const cache = new Map();
  const warned = new Set();
  const warnOnce = (filename, error) => {
    if (warned.has(filename)) return;
    warned.add(filename);
    onWarning(`[Hero sprites] Could not load ${filename}; using fallback.`, error || 'missing image');
  };

  const entries = Object.entries(config.HERO_VISUALS);
  await Promise.all(entries.flatMap(([heroId, heroConfig]) => Object.entries(heroConfig.frames).map(async ([frameName, filename]) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = imageUrl(config.assetBase, filename);
    try {
      await image.decode();
      const scale = heroConfig.scale || 1;
      const sizePx = config.SPRITE_BASE_PX * scale;
      const record = rasterize(image, sizePx, dpr);
      let heroFrames = cache.get(heroId);
      if (!heroFrames) { heroFrames = new Map(); cache.set(heroId, heroFrames); }
      heroFrames.set(frameName, { ...record, filename });
    } catch (error) {
      warnOnce(filename, error);
    }
  })));

  let bytes = 0;
  for (const frames of cache.values()) for (const frame of frames.values()) {
    bytes += frame.canvas.width * frame.canvas.height * 4 * 2;
  }

  return {
    config,
    cache,
    memoryBytes: bytes,
    get(heroId, frameName) {
      const frames = cache.get(heroId);
      if (!frames) return null;
      const frame = frames.get(frameName);
      if (frame) return frame;
      if (frameName === 'closed') return frames.get('open') || null;
      if (frameName === 'ultimate') return frames.get('open') || null;
      return null;
    },
  };
}

export function drawCachedHero(context, spriteCache, hero, x, y, visualState = {}) {
  const heroId = hero?.heroId || hero?.id;
  const heroConfig = spriteCache?.config?.HERO_VISUALS?.[heroId];
  const state = visualState || {};
  const frames = spriteCache?.cache?.get(heroId);
  if (!heroConfig || state.disableSprites || !frames) return false;

  const now = Number.isFinite(state.time) ? state.time : performance.now();
  const offset = Number.isFinite(state.heroOffset) ? state.heroOffset : 0;
  const clip = spriteCache.config.IDLE_CLIP;
  const frameIndex = Math.floor(((now + offset) / spriteCache.config.TIME_MS_PER_SECOND) * spriteCache.config.IDLE_FPS) % clip.length;
  const idleFrame = clip[frameIndex] || 'open';
  const frameName = state.downed ? 'closed' : (state.ultActive ? 'ultimate' : idleFrame);
  const frame = spriteCache.get(heroId, frameName);
  if (!frame) return false;

  const anchor = heroConfig.anchor || { x: 0.5, y: 0.5 };
  const flip = Boolean(state.facingLeft && spriteCache.config.SPRITE_FLIP_BY_AIM);
  let rotation = 0;
  if (heroId === 'guardian' && state.guardianCharging) {
    rotation = Math.atan2(state.chargeDirection?.y || 0, state.chargeDirection?.x || 1)
      + ((now - (state.ultimateStartedAt || now)) / spriteCache.config.TIME_MS_PER_SECOND)
        * Math.PI * 2 * spriteCache.config.GUARDIAN_CHARGE_SPIN_RPS;
  }

  let scale = 1;
  let popAge = -1;
  if (Number.isFinite(state.transformStartedAt)) {
    popAge = now - state.transformStartedAt;
    const transformMs = heroConfig.ultimate?.transformMs || 200;
    if (popAge >= 0 && popAge < transformMs) scale = 1 + (spriteCache.config.ULTIMATE_POP_SCALE - 1) * Math.sin(Math.PI * popAge / transformMs);
  }
  const width = frame.width * scale * (state.scaleX || 1);
  const height = frame.height * scale * (state.scaleY || 1);
  const left = x - width * anchor.x;
  const top = y - height * anchor.y;

  context.save();
  context.globalAlpha *= state.downed ? 0.5 : 1;
  if (flip || rotation || state.scaleX || state.scaleY) {
    context.translate(x, y);
    if (rotation) context.rotate(rotation);
    if (flip) context.scale(-1, 1);
    context.drawImage(state.hitFlash && frame.silhouette ? frame.silhouette : frame.canvas, -width * anchor.x, -height * anchor.y, width, height);
  } else {
    context.drawImage(state.hitFlash && frame.silhouette ? frame.silhouette : frame.canvas, left, top, width, height);
  }
  if (popAge >= 0 && popAge < spriteCache.config.ULTIMATE_FLASH_MS && frame.silhouette) {
    context.globalAlpha = Math.max(0, 1 - popAge / spriteCache.config.ULTIMATE_FLASH_MS) * 0.8;
    context.drawImage(frame.silhouette, left, top, width, height);
  }
  context.restore();
  return true;
}

export function getHeroSpriteUrl(config, heroId, frameName = 'open') {
  const hero = config?.HERO_VISUALS?.[heroId];
  if (!hero) return null;
  const filename = hero.frames[frameName] || (frameName === 'closed' ? hero.frames.open : null);
  return filename ? imageUrl(config.assetBase, filename) : null;
}
