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
  } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.speed = speed;
    this.hp = hp;
    this.maxHp = maxHp;
    this.emoji = emoji;
    this.damage = damage;
    this.dead = false;
  }

  update(dt, target) {
    if (!target || this.dead) return;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const minContactDist = target.radius + this.radius;

    if (dist > minContactDist) {
      this.x += (dx / dist) * this.speed * dt;
      this.y += (dy / dist) * this.speed * dt;
    } else {
      if (target.hp > 0) {
        target.hp = Math.max(0, target.hp - this.damage * dt);
      }
      if (dist > 0) {
        this.x = target.x - (dx / dist) * minContactDist;
        this.y = target.y - (dy / dist) * minContactDist;
      }
    }
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.dead = true;
    }
    return this.dead;
  }
}

export class Zombie extends Enemy {
  constructor(options = {}) {
    super({
      emoji: '🧟',
      hp: 20,
      maxHp: 20,
      speed: 55,
      radius: 16,
      damage: 6,
      ...options,
    });
  }
}

export const Enemies = {
  Enemy,
  Zombie,
};
