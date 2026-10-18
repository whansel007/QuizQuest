import { Enemy } from '../bases/enemy.js';
import { EnemyProjectile } from '../projectiles/enemy-projectile.js';
import { GAME_CONFIG } from '../game-config.js';

export class Skeleton extends Enemy {
  constructor(options = {}) {
    const spec = GAME_CONFIG.enemies.skeleton;
    super({ emoji: '💀', hp: spec.hp, maxHp: spec.hp, speed: spec.speed, radius: spec.radius, damage: spec.damage, ...options });
    this.spec = spec;
    this.nextShotAt = Date.now() + spec.shootIntervalMs;
    this.pauseUntil = 0;
  }

  update(dt, campfire, target, now = Date.now()) {
    if (this.dead || !campfire) return null;
    if (now >= this.nextShotAt && now >= this.pauseUntil && target) {
      const dx = target.x - this.x, dy = target.y - this.y, length = Math.hypot(dx, dy) || 1;
      this.pauseUntil = now + this.spec.pauseMs;
      this.nextShotAt = now + this.spec.shootIntervalMs;
      return new EnemyProjectile({ x: this.x, y: this.y, aim: { x: dx / length, y: dy / length },
        speed: this.spec.bulletSpeed, damage: this.spec.bulletDamage, color: '#e64045', emoji: '🔴', radius: 8 });
    }
    if (now < this.pauseUntil) return null;
    super.update(dt, campfire);
    return null;
  }
}

export default Skeleton;
