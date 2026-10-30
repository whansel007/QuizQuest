import { GAME_CONFIG } from '../game-config.js';

let shurikenSprite = null;

function getShurikenSprite() {
  if (shurikenSprite) return shurikenSprite;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.translate(size / 2, size / 2);
  context.fillStyle = GAME_CONFIG.heroFxColors.samurai.primary;
  context.beginPath();
  context.moveTo(0, -15); context.lineTo(3, -3); context.lineTo(15, 0);
  context.lineTo(3, 3); context.lineTo(0, 15); context.lineTo(-3, 3);
  context.lineTo(-15, 0); context.lineTo(-3, -3); context.closePath(); context.fill();
  context.fillStyle = GAME_CONFIG.heroFxSecondary.samurai;
  context.beginPath(); context.arc(0, 0, 2, 0, Math.PI * 2); context.fill();
  shurikenSprite = canvas;
  return shurikenSprite;
}

export class Projectile {
  constructor({
    id,
    ownerId,
    heroId,
    x = 0,
    y = 0,
    vx,
    vy,
    aim,
    radius = 10,
    color = '#ff2d20',
    damage = 10,
    explosionDamage = null,
    speed = 0,
    piercing = false,
    pierces = 0,
    targetTeam = 'monsters',
    heal = 0,
    explosionRadius = 0,
    knockback = 0,
    stunMs = 0,
    detonateOnExpire = false,
    shape = 'circle',
    emoji = '',
    rotateToAim = false,
    flashColors = null,
    flashIntervalMs = 100,
    fadeLastFraction = 0,
    rangerDeadAim = false,
    rangerChargeT = 0,
    maxDistance = 0,
    distanceTravelled = 0,
    sourceAbility = 'weapon',
    trap = null,
    lifetimeMs = GAME_CONFIG.combat.projectileMaxAgeMs,
    kind = 'player',
    createdAt = Date.now(),
  } = {}) {
    this.id = id;
    this.ownerId = ownerId;
    this.heroId = heroId;
    this.x = x;
    this.y = y;
    this.vx = Number.isFinite(vx) ? vx : (aim?.x ?? 0) * speed;
    this.vy = Number.isFinite(vy) ? vy : (aim?.y ?? 0) * speed;
    this.radius = radius;
    this.color = color;
    this.damage = damage;
    this.explosionDamage = Number.isFinite(explosionDamage) ? explosionDamage : damage;
    this.piercing = piercing === true;
    this.piercesRemaining = Math.max(0, pierces | 0);
    this.targetTeam = targetTeam;
    this.heal = heal;
    this.explosionRadius = explosionRadius;
    this.knockback = knockback;
    this.stunMs = stunMs;
    this.detonateOnExpire = detonateOnExpire;
    this.shape = shape;
    this.emoji = emoji;
    this.rotateToAim = rotateToAim;
    this.flashColors = flashColors;
    this.flashIntervalMs = flashIntervalMs;
    this.fadeLastFraction = fadeLastFraction;
    this.rangerDeadAim = rangerDeadAim;
    this.rangerChargeT = rangerChargeT;
    this.maxDistance = Number.isFinite(maxDistance) ? Math.max(0, maxDistance) : 0;
    this.distanceTravelled = Number.isFinite(distanceTravelled) ? Math.max(0, distanceTravelled) : 0;
    this.sourceAbility = sourceAbility;
    this.trap = trap;
    this.kind = kind;
    this.lifetimeMs = lifetimeMs;
    this.speed = speed;
    this.createdAt = createdAt;
    this.dead = false;
    this.hitTargets = new Set();
  }

  onHit() {
    if (this.piercesRemaining > 0) {
      this.piercesRemaining -= 1;
      return false;
    }
    return !this.piercing;
  }

  update(dt, arena = { width: 1920, height: 1080 }) {
    const stepX = this.vx * dt, stepY = this.vy * dt;
    if (this.maxDistance > 0) {
      const step = Math.hypot(stepX, stepY);
      const remaining = Math.max(0, this.maxDistance - this.distanceTravelled);
      const fraction = step > remaining && step > 0 ? remaining / step : 1;
      this.x += stepX * fraction;
      this.y += stepY * fraction;
      this.distanceTravelled += step * fraction;
      if (this.distanceTravelled >= this.maxDistance) this.dead = true;
    } else {
      this.x += stepX;
      this.y += stepY;
    }

    if (
      this.x < -40 ||
      this.x > arena.width + 40 ||
      this.y < -40 ||
      this.y > arena.height + 40 ||
      (this.maxDistance <= 0 && Date.now() - this.createdAt > this.lifetimeMs)
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
    const age = Date.now() - this.createdAt;
    const progress = this.maxDistance > 0
      ? Math.max(0, Math.min(1, this.distanceTravelled / Math.max(1, this.maxDistance)))
      : Math.max(0, Math.min(1, age / Math.max(1, this.lifetimeMs)));
    const alpha = this.fadeLastFraction > 0 && progress > 1 - this.fadeLastFraction
      ? Math.max(0, (1 - progress) / this.fadeLastFraction) : 1;
    context.save();
    context.globalAlpha *= alpha;
    if (this.heroId === 'ranger' && this.shape === 'arrow') {
      const deadAim = this.rangerDeadAim;
      context.save();
      context.translate(this.x, this.y);
      context.rotate(Math.atan2(this.vy, this.vx));
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (deadAim) {
        context.strokeStyle = '#543923';
        context.lineWidth = 17;
        context.beginPath();
        context.moveTo(-57, 0);
        context.lineTo(-12, 0);
        context.stroke();
        context.strokeStyle = 'rgba(255, 205, 75, 0.92)';
        context.lineWidth = 11;
        context.beginPath();
        context.moveTo(-57, 0);
        context.lineTo(-12, 0);
        context.stroke();
      } else {
        const charge = Math.max(0, Math.min(1, this.rangerChargeT || 0));
        const tailLength = 8 + charge * 16;
        context.strokeStyle = '#303728';
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(-tailLength - 4, 0);
        context.lineTo(-5, 0);
        context.stroke();
        context.strokeStyle = 'rgba(240, 221, 160, 0.9)';
        context.lineWidth = 3 + charge * 2;
        context.beginPath();
        context.moveTo(-tailLength - 3, 0);
        context.lineTo(-5, 0);
        context.stroke();
      }
      const charge = Math.max(0, Math.min(1, this.rangerChargeT || 0));
      context.font = `${deadAim ? 56 : 22 + 22 * charge}px "Segoe UI Emoji", sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('➡️', deadAim ? 10 : 2, 0);
      context.restore();
      context.restore();
      return;
    }
    if (this.flashColors?.length) {
      context.beginPath(); context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      context.fillStyle = this.flashColors[Math.floor(Date.now() / this.flashIntervalMs) % this.flashColors.length]; context.fill();
    }
    if (this.heroId === 'samurai' && this.shape === 'shuriken') {
      const sprite = getShurikenSprite();
      const size = GAME_CONFIG.heroes.samurai.shuriken.size || 32;
      context.translate(this.x, this.y);
      context.rotate(age / 1000 * GAME_CONFIG.heroes.samurai.shuriken.spinRadPerSecond);
      context.drawImage(sprite, -size / 2, -size / 2, size, size);
      context.restore();
      return;
    }
    if (this.heroId === 'fairy' && this.shape === 'arrow') {
      const pinkAccent = GAME_CONFIG.heroFxSecondary.fairy;
      context.save();
      context.translate(this.x, this.y);
      context.rotate(Math.atan2(this.vy, this.vx));
      context.strokeStyle = pinkAccent;
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.beginPath(); context.moveTo(-13, 4); context.quadraticCurveTo(-8, -3, -3, 2); context.quadraticCurveTo(1, 7, 6, 0); context.stroke();
      context.strokeStyle = this.color;
      context.lineWidth = 3;
      context.beginPath(); context.moveTo(-4, 0); context.lineTo(9, 0); context.stroke();
      context.fillStyle = '#fff';
      context.beginPath(); context.moveTo(12, 0); context.lineTo(5, -4); context.lineTo(7, 0); context.lineTo(5, 4); context.closePath(); context.fill();
      context.restore(); context.restore();
      return;
    }
    if (this.heroId === 'fairy' && (this.shape === 'gale' || this.shape === 'vortex-orb')) {
      const pinkAccent = GAME_CONFIG.heroFxSecondary.fairy;
      const vortex = this.shape === 'vortex-orb';
      const rotation = Date.now() / (vortex ? 210 : 280);
      context.save(); context.translate(this.x, this.y); context.rotate(rotation);
      context.fillStyle = vortex ? GAME_CONFIG.vortexColors.core : this.color;
      context.beginPath(); context.arc(0, 0, this.radius, 0, Math.PI * 2); context.fill();
      context.strokeStyle = vortex ? pinkAccent : '#fff0fa'; context.lineWidth = vortex ? 2 : 1.5;
      context.beginPath(); context.arc(0, 0, this.radius, 0, Math.PI * 2); context.stroke();
      for (let i = 0; i < (vortex ? 4 : 3); i++) {
        const a = (Math.PI * 2 * i) / (vortex ? 4 : 3);
        context.strokeStyle = i % 2 ? pinkAccent : '#fff0fa'; context.lineWidth = 1.5;
        context.beginPath(); context.moveTo(-this.radius - 7, Math.sin(a) * 4);
        context.quadraticCurveTo(-this.radius - 3, Math.sin(a + 0.5) * 7, -this.radius, 0); context.stroke();
      }
      context.restore(); context.restore();
      return;
    }
    if (this.emoji) {
      context.save();
      context.translate(this.x, this.y);
      if (this.rotateToAim) {
        const facingLeft = this.vx < 0;
        const aimAngle = Math.atan2(this.vy, facingLeft ? -this.vx : this.vx);
        const spin = this.shape === 'wrench'
          ? age / 1000 * GAME_CONFIG.heroes.engineer.wrench.spinRadPerSecond
          : 0;
        const angle = aimAngle + spin;
        if (facingLeft) context.scale(-1, 1);
        context.rotate(angle);
      }
      context.font = `${this.radius * 1.8}px sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(this.emoji, 0, 0);
      context.restore();
      context.restore();
      return;
    }
    context.fillStyle = this.color;
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

export default Projectile;
