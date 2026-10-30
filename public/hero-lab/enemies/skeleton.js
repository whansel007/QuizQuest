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

  update(dt, campfire, target, now = Date.now(), turretTarget = null) {
    if (this.dead || !campfire || this.heldUntil > now) return null;
    if (this.windupUntil && now >= this.windupUntil) {
      const aim = this.windupAim || { x: 1, y: 0 };
      const targetDecoyId = this.windupTurretId;
      this.windupUntil = 0;
      this.windupAim = null;
      this.windupTurretId = null;
      this.pauseUntil = now + this.spec.pauseMs;
      const projectile = new EnemyProjectile({ x: this.x, y: this.y, aim, speed: this.spec.bulletSpeed, damage: this.spec.bulletDamage * (this.damageScale || 1), color: '#e64045', emoji: '🔴', radius: 8 });
      if (targetDecoyId?.startsWith('wolf:')) projectile.targetWolfId = targetDecoyId;
      else if (targetDecoyId) projectile.targetTurretId = targetDecoyId;
      return projectile;
    }
    if (now >= this.nextShotAt && now >= this.pauseUntil && !this.windupUntil && target) {
      const dx = target.x - this.x, dy = target.y - this.y, length = Math.hypot(dx, dy) || 1;
      this.windupAim = { x: dx / length, y: dy / length };
      this.windupTurretId = turretTarget?.id || null;
      this.windupUntil = now + GAME_CONFIG.arenaTuning.briefing.skeletonWindupMs;
      this.nextShotAt = now + this.spec.shootIntervalMs;
      return null;
    }
    if (now < this.pauseUntil || now < this.windupUntil) return null;
    if (turretTarget) {
      const dx = turretTarget.x - this.x, dy = turretTarget.y - this.y;
      const distance = Math.hypot(dx, dy) || 1;
      const stopAt = turretTarget.radius + this.radius + GAME_CONFIG.turret.range;
      if (distance > stopAt) {
        const slow = this.slowUntil > now ? Math.min(1, Math.max(0, this.slowPct || 0)) : 0;
        this.x += dx / distance * this.speed * (1 - slow) * dt;
        this.y += dy / distance * this.speed * (1 - slow) * dt;
      }
    } else super.update(dt, campfire, now);
    return null;
  }
}

export default Skeleton;
