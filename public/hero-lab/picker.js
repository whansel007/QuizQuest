// Standalone sandbox entry: pick a hero, then open the arena. The arena reads
// ?heroId= (see world.js), so this page only has to link there.
import { HEROES } from './hero-list.js';
import { loadHeroVisualConfig, getHeroSpriteUrl } from './hero-visuals.js';

const list = document.querySelector('#hero-list');

for (const hero of HEROES) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'hero-card';
  link.href = `/hero-lab/world?heroId=${encodeURIComponent(hero.id)}`;
  const details = document.createElement('span');
  details.textContent = `${hero.emoji} ${hero.name} — HP ${hero.maxHp}, attack ${hero.attack}, defense ${hero.defense}`;
  link.append(details);
  void loadHeroVisualConfig().then((config) => {
    const src = getHeroSpriteUrl(config, hero.id, 'open');
    if (!src) return;
    const image = document.createElement('img'); image.src = src; image.alt = ''; image.width = 40; image.height = 40;
    image.setAttribute('aria-hidden', 'true');
    details.textContent = `${hero.name} — HP ${hero.maxHp}, attack ${hero.attack}, defense ${hero.defense}`;
    link.prepend(image);
  }).catch(() => {});
  item.append(link);
  list.append(item);
}
