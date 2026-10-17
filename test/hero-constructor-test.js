const test = require('node:test');
const assert = require('node:assert/strict');

test('Hero accepts hp, attack, and defense as separate options', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const hero = new Hero({ id: 'test', name: 'Test', hp: 110, attack: 15, defense: 6 });

  assert.equal(hero.hp, 110);
  assert.equal(hero.maxHp, 110);
  assert.equal(hero.attack, 15);
  assert.equal(hero.defense, 6);
  assert.equal(hero.stats, undefined);
});

test('Hero retains default combat stats when options are omitted', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const hero = new Hero();

  assert.equal(hero.hp, 100);
  assert.equal(hero.maxHp, 100);
  assert.equal(hero.attack, 10);
  assert.equal(hero.defense, 5);
});

test('Hero stores fixed skill and ultimate details directly and can describe them', async () => {
  const { HEROES, HERO_CLASSES } = await import('../public/hero-lab/hero-list.js');
  const flamekeeper = HEROES.find((hero) => hero.id === 'flamekeeper');

  assert.equal(flamekeeper.skillName, 'Firebolt');
  assert.equal(flamekeeper.ultimateName, 'Meteor Storm');
  assert.match(flamekeeper.use('skill'), /Firebolt: a quick burst of fire/);
  assert.match(flamekeeper.use('ultimate'), /Meteor Storm: a large area attack/);
  assert.equal(flamekeeper.skill?.name, undefined);
  assert.equal(flamekeeper.ultimate?.name, undefined);

  const FirstFlamekeeper = HERO_CLASSES.flamekeeper;
  const first = new FirstFlamekeeper();
  const second = new FirstFlamekeeper();
  first.hp = 1;
  assert.notEqual(first, second);
  assert.equal(second.hp, 100);
});
