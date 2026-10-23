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
    // defense is a percentage now, so the default 5 defense only shaves 5% off 10 damage
    assert.equal(hero.damage(10), 9.5);
    assert.equal(hero.hp, 90.5);

    now += 999;
    assert.equal(hero.damage(10), 0);
    assert.equal(hero.hp, 90.5);

    now += 1;
    assert.equal(hero.damage(10), 9.5);
    assert.equal(hero.hp, 81);
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
    // Defense is a percentage of incoming damage, so the default defense of 5
    // absorbs 5% of each hit instead of a flat 5 points.
    assert.equal(first.damage(20), 19);
    assert.equal(first.damage(1), 0);
    assert.equal(second.damage(5), 4.75);
    assert.equal(first.hp, 1);
    assert.equal(second.hp, 15.25);
  } finally {
    Date.now = originalNow;
  }
});

test('selected hero constructors create independent state and own their attacks', async () => {
  const { Sheriff } = await import('../public/hero-lab/heroes/roster.js');
  const first = new Sheriff();
  const second = new Sheriff();
  first.hp = 1;
  assert.notEqual(first, second);
  assert.equal(second.hp, 105);
  assert.equal(first.fire().speed, 980);
});

test('the selectable roster contains exactly the six configured heroes', async () => {
  const { HEROES, HERO_CLASSES } = await import('../public/hero-lab/hero-list.js');
  const ids = HEROES.map((hero) => hero.id);
  assert.deepEqual(new Set(ids), new Set(['sheriff', 'guardian', 'pilot', 'bombardier', 'bubbles', 'electromancer']));
  for (const id of ids) {
    assert.ok(ids.includes(id), `${id} is selectable in Hero Lab`);
    assert.equal(typeof HERO_CLASSES[id], 'function');
  }
  assert.equal(HERO_CLASSES.flamekeeper, undefined);
  assert.equal(HERO_CLASSES.ranger, undefined);
  const { Sheriff, Guardian, Pilot, Bombardier, Bubbles, Electromancer } = await import('../public/hero-lab/heroes/roster.js');
  for (const HeroClass of [Sheriff, Guardian, Pilot, Bombardier, Bubbles, Electromancer]) {
    const hero = new HeroClass();
    assert.ok(hero.hp > 0);
    assert.ok(hero.cooldowns.weapon.durationMs > 0);
    assert.ok(hero.cooldowns.skill.durationMs > 0);
    assert.ok(hero.cooldowns.ultimate.durationMs > 0);
  }
  assert.equal(new Sheriff().fire().speed, 980);
  assert.equal(new Electromancer().fire().piercesRemaining, 2);
  assert.equal(new Pilot().fire().length, 7);
  assert.equal(new Bombardier().cooldowns.weapon.durationMs, 1050, 'Bombardier keeps its primary cooldown');
  assert.equal(new Bubbles().talent.name, 'Finisher');
});

test('Skeleton pauses to fire at a hero, then resumes walking toward the campfire', async () => {
  const { Skeleton } = await import('../public/hero-lab/enemies/skeleton.js');
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const skeleton = new Skeleton({ id: 'skeleton-test', x: 100, y: 100 });
  skeleton.nextShotAt = 1000;
  const campfire = { x: 400, y: 100, radius: 20, hp: 100 };
  const target = { x: 200, y: 100, hero: { damage: () => 0 } };
  const firedAt = 1000 + GAME_CONFIG.arenaTuning.briefing.skeletonWindupMs;
  assert.equal(skeleton.update(1 / 30, campfire, target, 1000), null, 'the skeleton telegraphs its shot instead of firing immediately');
  const shot = skeleton.update(1 / 30, campfire, target, firedAt);
  assert.equal(shot.kind, 'enemy');
  const stoppedX = skeleton.x;
  assert.equal(skeleton.update(1 / 30, campfire, target, firedAt + 200), null);
  assert.equal(skeleton.x, stoppedX, 'the skeleton stays stopped during its firing pause');
  skeleton.update(1 / 30, campfire, target, firedAt + GAME_CONFIG.enemies.skeleton.pauseMs);
  assert.ok(skeleton.x > stoppedX, 'the skeleton resumes toward the campfire');
});
