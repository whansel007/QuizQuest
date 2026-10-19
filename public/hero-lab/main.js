import { HEROES } from './hero-list.js';

const heroList = document.querySelector('#hero-list');

for (const hero of HEROES) {
  const card = document.createElement('li');
  const button = document.createElement('button');
  const heading = document.createElement('strong');
  const stats = document.createElement('span');
  const weapon = document.createElement('span');
  button.type = 'button';
  button.className = 'hero-card';
  heading.textContent = `${hero.emoji} ${hero.name}`;
  stats.textContent = `HP ${hero.maxHp} · Attack ${hero.attack} · Defense ${hero.defense} · Speed ${hero.speed}`;
  weapon.textContent = hero.weaponName;
  button.append(heading, stats, weapon);
  button.addEventListener('click', () => {
    location.assign(`/hero-lab/world?heroId=${encodeURIComponent(hero.id)}`);
  });
  card.append(button);
  heroList.append(card);
}
