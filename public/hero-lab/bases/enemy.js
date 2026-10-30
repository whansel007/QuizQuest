import { GAME_CONFIG } from '../game-config.js';

export class Enemy {
  constructor({
    id,
    x = 0,
    y = 0,
    radius = 16,
    speed = 55,
    hp = 20,
    maxHp = 20,
    emoji = '🧟',
    damage = 6,
    type = 'zombie',
  } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.speed = speed;
    this.hp = hp;
    this.maxHp = maxHp;
    this.emoji = emoji;
    this.type = type;
    this.damage = damage;
    this.dead = false;
    this.nextCampfireAttackAt = 0;
  }

  update(dt, target, now = Date.now()) {
    if (!target || this.dead) return;
    if (this.heldUntil > now) return;
    const touching = this.moveTowards(dt, target, now);
    if (touching && target.hp > 0 && now >= this.nextCampfireAttackAt) {
      this.nextCampfireAttackAt = now + GAME_CONFIG.arenaTuning.campfire.contactDamageCooldownMs;
      target.hp = Math.max(0, target.hp - this.damage);
    }
  }

  moveTowards(dt, target, now = Date.now()) {
    if (!target || this.dead) return false;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const minContactDist = target.radius + this.radius;

    if (dist > minContactDist) {
      const slow = this.slowUntil > now ? Math.min(1, Math.max(0, this.slowPct || 0)) : 0;
      const speed = this.speed * (1 - slow);
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
      return false;
    }

    if (dist > 0) {
      this.x = target.x - (dx / dist) * minContactDist;
      this.y = target.y - (dy / dist) * minContactDist;
    }
    return true;
  }

  takeDamage(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || this.dead) return 0;

    const previousHp = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.dead = true;
    }
    return previousHp - this.hp;
  }
}

export default Enemy;
