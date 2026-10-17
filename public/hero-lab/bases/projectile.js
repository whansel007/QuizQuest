export class Projectile {
  constructor({
    id,
    ownerId,
    heroId,
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    radius = 10,
    color = '#ff2d20',
    damage = 10,
    speed = 550,
    createdAt = Date.now(),
  } = {}) {
    this.id = id;
    this.ownerId = ownerId;
    this.heroId = heroId;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.color = color;
    this.damage = damage;
    this.speed = speed;
    this.createdAt = createdAt;
    this.trail = [];
    this.dead = false;
  }

  update(dt, arena = { width: 800, height: 500 }) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.pop();

    if (
      this.x < -40 ||
      this.x > arena.width + 40 ||
      this.y < -40 ||
      this.y > arena.height + 40 ||
      Date.now() - this.createdAt > 3500
    ) {
      this.dead = true;
    }
  }

  collidesWith(target) {
    if (!target) return false;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const hitDist = this.radius + target.radius;
    return (dx * dx + dy * dy) <= (hitDist * hitDist);
  }

  draw(context) {
    context.fillStyle = this.color;
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.fill();
  }
}

export default Projectile;
