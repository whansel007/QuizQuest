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

export function tintedPlayerFrames(visuals, color) {
  const key = String(color || '').toUpperCase();
  if (visuals.tintCache.has(key)) return visuals.tintCache.get(key);
  const crop = visuals.visual.crop.open;
  const result = {};
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
