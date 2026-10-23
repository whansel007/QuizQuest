// The hero picker on /hero-lab. This page only chooses: world.js reads the
// heroId it is given and sends you back here if there isn't one, so picking a
// hero is a hand-off to the arena rather than a test field of its own.
// Kept as its own module because the server sends a Content-Security-Policy of
// script-src 'self', which blocks inline scripts.
import { HEROES } from './hero-list.js';

const list = document.querySelector('#hero-list');
for (const hero of HEROES) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hero-card';
  const name = document.createElement('strong');
  name.textContent = `${hero.emoji} ${hero.name}`;
  const stats = document.createElement('span');
  stats.textContent = `HP ${hero.maxHp} · attack ${hero.attack} · defense ${hero.defense}`;
  button.append(name, stats);
  button.addEventListener('click', () => location.assign(`/hero-lab/world?heroId=${encodeURIComponent(hero.id)}`));
  item.append(button);
  list.append(item);
}