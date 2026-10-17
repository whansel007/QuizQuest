import { Projectile } from '../bases/projectile.js';

export class Fireball extends Projectile {
  constructor(options = {}) {
    super({
      radius: 10,
      color: '#ff2d20',
      speed: 550,
      damage: 10,
      ...options,
    });
    this.type = 'fireball';
  }

  draw(context) {
    // 1. Draw trailing ember tail
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const pt = this.trail[i];
      const ratio = (this.trail.length - i) / this.trail.length;
      context.beginPath();
      context.arc(pt.x, pt.y, this.radius * (0.3 + 0.5 * ratio), 0, Math.PI * 2);
      context.fillStyle = `rgba(255, ${Math.floor(70 * ratio)}, 0, ${0.35 * ratio})`;
      context.fill();
    }

    // 2. Draw glowing red ball
    context.save();
    context.shadowColor = 'rgba(255, 35, 10, 0.85)';
    context.shadowBlur = 14;

    const grad = context.createRadialGradient(
      this.x - this.radius * 0.3,
      this.y - this.radius * 0.3,
      this.radius * 0.1,
      this.x,
      this.y,
      this.radius
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, '#ffe566');
    grad.addColorStop(0.55, '#ff2414');
    grad.addColorStop(1, '#9b0000');

    context.fillStyle = grad;
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = 'rgba(255, 220, 150, 0.7)';
    context.lineWidth = 1.2;
    context.stroke();
    context.restore();
  }
}

export default Fireball;
