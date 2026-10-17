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

test('Hero applies damage at most once per shared cooldown interval', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const hero = new Hero({ hp: 100 });
  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;

  try {
    assert.equal(hero.damage(10), 10);
    assert.equal(hero.hp, 90);

    now += 999;
    assert.equal(hero.damage(10), 0);
    assert.equal(hero.hp, 90);

    now += 1;
    assert.equal(hero.damage(10), 10);
    assert.equal(hero.hp, 80);
  } finally {
    Date.now = originalNow;
  }
});

test('Hero damage cooldown is per instance and health cannot fall below zero', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const first = new Hero({ hp: 20 });
  const second = new Hero({ hp: 20 });
  const originalNow = Date.now;
  Date.now = () => 10_000;

  try {
    assert.equal(first.damage(20), 20);
    assert.equal(first.damage(1), 0);
    assert.equal(second.damage(5), 5);
    assert.equal(first.hp, 0);
    assert.equal(second.hp, 15);
  } finally {
    Date.now = originalNow;
  }
});

test('Hero subclasses own their skills, ultimates, and fire configuration', async () => {
  const { HEROES, HERO_CLASSES } = await import('../public/hero-lab/hero-list.js');
  const flamekeeper = HEROES.find((hero) => hero.id === 'flamekeeper');

  assert.equal(flamekeeper.skillName, 'Firebolt');
  assert.equal(flamekeeper.ultimateName, 'Meteor Storm');
  assert.equal(typeof flamekeeper.skill, 'function');
  assert.equal(typeof flamekeeper.ultimate, 'function');
  assert.match(flamekeeper.skill(), /Firebolt: a quick burst of fire/);
  assert.match(flamekeeper.ultimate(), /Meteor Storm: a large area attack/);
  assert.equal(typeof flamekeeper.use, 'undefined');
  assert.deepEqual(flamekeeper.fire('primary'), {
    type: 'fireball',
    color: '#ff2d20',
    radius: 10,
    speed: 550,
  });
  assert.equal(flamekeeper.fire('secondary'), null);

  const FirstFlamekeeper = HERO_CLASSES.flamekeeper;
  const first = new FirstFlamekeeper();
  const second = new FirstFlamekeeper();
  first.hp = 1;
  assert.notEqual(first, second);
  assert.equal(second.hp, 100);
});
