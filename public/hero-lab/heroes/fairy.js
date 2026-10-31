import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

export class Fairy extends Hero {
  constructor() {
    super(setup('fairy', 'Fairy', '🧚', 'magic'));
    this.spec = GAME_CONFIG.heroes.fairy;
    this.weaponName = 'Wind Arrow';
    this.skillName = 'Gale Burst';
    this.ultimateName = 'Vortex Orb';
  }

  fire() {
    const s = this.spec.windArrow;
    return shot(this, {
      speed: s.speed, radius: 5, shape: 'arrow', damage: this.attack * s.damageMultiplier,
      pierces: s.pierces, lifetimeMs: s.range / s.speed * 1000, rotateToAim: true,
    });
  }

  skill() {
    const s = this.spec.gale;
    return shot(this, {
      speed: s.speed, radius: 12, damage: this.attack * s.damageMultiplier,
      lifetimeMs: s.range / s.speed * 1000, sourceAbility: 'skill', detonateOnExpire: true,
      shape: 'gale', explosionRadius: s.radius,
    });
  }

  ultimate() {
    const s = this.spec.vortex;
    return shot(this, {
      speed: s.speed, radius: 10, damage: 0, lifetimeMs: s.range / s.speed * 1000,
      sourceAbility: 'ultimate', shape: 'vortex-orb',
    });
  }
}

export const fairy = new Fairy();
export default fairy;
