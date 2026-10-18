const test = require('node:test');
const assert = require('node:assert/strict');

test('Hero accepts hp, attack, defense, and speed as separate options', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const hero = new Hero({ id: 'test', name: 'Test', hp: 110, attack: 15, defense: 6, speed: 240 });

  assert.equal(hero.hp, 110);
  assert.equal(hero.maxHp, 110);
  assert.equal(hero.attack, 15);
  assert.equal(hero.defense, 6);
  assert.equal(hero.speed, 240);
  assert.equal(hero.stats, undefined);
});

test('Hero retains default combat stats when options are omitted', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const hero = new Hero();

  assert.equal(hero.hp, 100);
  assert.equal(hero.maxHp, 100);
  assert.equal(hero.attack, 10);
  assert.equal(hero.defense, 5);
  assert.equal(hero.speed, 220);
});

test('Hero applies defense-reduced damage at most once per cooldown interval', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const hero = new Hero({ hp: 100 });
  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;

  try {
    assert.equal(hero.damage(10), 5);
    assert.equal(hero.hp, 95);

    now += 999;
    assert.equal(hero.damage(10), 0);
    assert.equal(hero.hp, 95);

    now += 1;
    assert.equal(hero.damage(10), 5);
    assert.equal(hero.hp, 90);
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
    assert.equal(first.damage(20), 15);
    assert.equal(first.damage(1), 0);
    assert.equal(second.damage(5), 1);
    assert.equal(first.hp, 5);
    assert.equal(second.hp, 19);
  } finally {
    Date.now = originalNow;
  }
});

test('Hero subclasses own their skill, ultimate, and projectile behavior', async () => {
  const { HEROES, HERO_CLASSES } = await import('../public/hero-lab/hero-list.js');
  const flamekeeper = HEROES.find((hero) => hero.id === 'flamekeeper');

  assert.equal(flamekeeper.skillName, 'Firebolt');
  assert.equal(flamekeeper.ultimateName, 'Meteor Strike');
  assert.equal(typeof flamekeeper.skill, 'function');
  assert.equal(typeof flamekeeper.ultimate, 'function');
  assert.deepEqual(flamekeeper.skill(), {
    type: 'dash',
    direction: { x: 1, y: 0 },
    distance: 180,
  });
  const { Fireball } = await import('../public/hero-lab/projectiles/fireball.js');
  assert.ok(flamekeeper.ultimate(Date.now()) instanceof Fireball);
  assert.equal(typeof flamekeeper.use, 'undefined');
  const projectile = flamekeeper.fire('primary');
  assert.ok(projectile instanceof Fireball);
  assert.equal(projectile.type, 'fireball');
  assert.equal(projectile.color, '#ff2d20');
  assert.equal(projectile.radius, 10);
  assert.equal(projectile.speed, 550);
  assert.equal(projectile.damage, 14);
  assert.equal(projectile.vx, 550);
  assert.equal(projectile.vy, 0);
  assert.equal(flamekeeper.fire('secondary'), null);

  const FirstFlamekeeper = HERO_CLASSES.flamekeeper;
  const first = new FirstFlamekeeper();
  const second = new FirstFlamekeeper();
  first.hp = 1;
  assert.notEqual(first, second);
  assert.equal(second.hp, 100);
});
