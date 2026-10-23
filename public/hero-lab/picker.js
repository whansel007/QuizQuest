// Standalone sandbox entry: pick a hero, then open the arena. The arena reads
// ?heroId= (see world.js), so this page only has to link there.
import { HEROES } from './hero-list.js';

const list = document.querySelector('#hero-list');

for (const hero of HEROES) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'hero-card';
  link.href = `/hero-lab/world?heroId=${encodeURIComponent(hero.id)}`;
  link.textContent = `${hero.emoji} ${hero.name} — HP ${hero.maxHp}, attack ${hero.attack}, defense ${hero.defense}`;
  item.append(link);
  list.append(item);
}
