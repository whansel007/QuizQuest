import { Enemy } from '../bases/enemy.js';
import { GAME_CONFIG } from '../game-config.js';

export class Devil extends Enemy {
  constructor(options = {}) {
    super({
      emoji: '😈',
      type: 'devil',
      hp: GAME_CONFIG.enemies.devil.hp,
      maxHp: GAME_CONFIG.enemies.devil.hp,
      speed: GAME_CONFIG.enemies.devil.speed,
      radius: GAME_CONFIG.enemies.devil.radius,
      damage: GAME_CONFIG.enemies.devil.damage,
      ...options,
    });
    this.attackCooldownMs = GAME_CONFIG.enemies.devil.attackCooldownMs;
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
