import { Enemy } from '../bases/enemy.js';
import { EnemyProjectile } from '../projectiles/enemy-projectile.js';
import { GAME_CONFIG } from '../game-config.js';

export class Skeleton extends Enemy {
  constructor(options = {}) {
    const spec = GAME_CONFIG.enemies.skeleton;
    super({ emoji: '💀', type: 'skeleton', hp: spec.hp, maxHp: spec.hp, speed: spec.speed, radius: spec.radius, damage: spec.damage, ...options });
    this.spec = spec;
    this.nextShotAt = Date.now() + spec.shootIntervalMs;
    this.pauseUntil = 0;
    this.windupUntil = 0;
    this.windupAim = null;
  }

  update(dt, campfire, target, now = Date.now()) {
    if (this.dead || !campfire) return null;
    if (this.windupUntil && now >= this.windupUntil) {
      const aim = this.windupAim || { x: 1, y: 0 };
      this.windupUntil = 0;
      this.windupAim = null;
      this.pauseUntil = now + this.spec.pauseMs;
      return new EnemyProjectile({ x: this.x, y: this.y, aim, speed: this.spec.bulletSpeed, damage: this.spec.bulletDamage * (this.damageScale || 1), color: '#e64045', emoji: '🔴', radius: 8 });
    }
    if (now >= this.nextShotAt && now >= this.pauseUntil && !this.windupUntil && target) {
      const dx = target.x - this.x, dy = target.y - this.y, length = Math.hypot(dx, dy) || 1;
      this.windupAim = { x: dx / length, y: dy / length };
      this.windupUntil = now + GAME_CONFIG.arenaTuning.briefing.skeletonWindupMs;
      this.nextShotAt = now + this.spec.shootIntervalMs;
      return null;
    }
    if (now < this.pauseUntil || now < this.windupUntil) return null;
    super.update(dt, campfire, now);
    return null;
  }
}

export default Skeleton;
