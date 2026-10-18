import { Enemy } from '../bases/enemy.js';

export class Devil extends Enemy {
  constructor(options = {}) {
    super({
      emoji: '😈',
      hp: 35,
      maxHp: 35,
      speed: 95,
      radius: 18,
      damage: 12,
      ...options,
    });
    this.attackCooldownMs = 1000;
    this.nextAttackAt = 0;
  }

  update(dt, target, now = Date.now()) {
    if (!target || !target.hero || this.dead) return 0;

    const touching = this.moveTowards(dt, target);
    if (!touching || now < this.nextAttackAt) return 0;

    this.nextAttackAt = now + this.attackCooldownMs;
    return target.hero.damage(this.damage);
  }
}

export default Devil;
