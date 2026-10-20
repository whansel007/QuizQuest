import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

export class Sheriff extends Hero {
  constructor() {
    super(setup('sheriff', 'Sheriff', '🤠', 'physical'));
    this.spec = GAME_CONFIG.heroes.sheriff; this.weaponName = 'Revolver'; this.skillName = 'Dynamite'; this.ultimateName = 'Deadeye';
    this.barrageUntil = 0; this.barrageAt = 0;
  }
  fire() {
    const range = Math.hypot(GAME_CONFIG.arena.width, GAME_CONFIG.arena.height) / 2 * GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletRangeArenaDiagonalFraction;
    return shot(this, { ...this.spec.bullet, damage: this.attack, lifetimeMs: range / this.spec.bullet.speed * 1000,
      fadeLastFraction: GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletFadeFraction });
  }
  skill() {
    const s = this.spec.dynamite;
    return { type: 'projectile', projectile: shot(this, { ...s, sourceAbility: 'skill', damage: this.attack * s.damageMultiplier, explosionRadius: s.explosionRadius, detonateOnExpire: true }) };
  }
  ultimate(now) { this.barrageUntil = now + this.spec.barrage.durationMs; this.barrageAt = now; return { type: 'activate' }; }
  update(now, primaryHeld = false) {
    if (!primaryHeld || now >= this.barrageUntil || now < this.barrageAt) return null;
    this.barrageAt = now + this.spec.barrage.intervalMs;
    // Position and aim are refreshed by the server every tick during Deadeye.
    const range = Math.hypot(GAME_CONFIG.arena.width, GAME_CONFIG.arena.height) / 2 * GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletRangeArenaDiagonalFraction;
    return shot(this, { ...this.spec.bullet, radius: this.spec.barrage.bulletRadius, sourceAbility: 'ultimate', damage: this.attack,
      lifetimeMs: range / this.spec.bullet.speed * 1000, fadeLastFraction: GAME_CONFIG.arenaTuning.heroTweaks.sheriffBulletFadeFraction });
  }
}

export const sheriff = new Sheriff();
export default sheriff;
