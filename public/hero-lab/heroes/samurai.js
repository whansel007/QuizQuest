import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

export class Samurai extends Hero {
  constructor() {
    super(setup('samurai', 'Samurai', '🥷', 'physical'));
    this.spec = GAME_CONFIG.heroes.samurai;
    this.weaponName = 'Shuriken';
    this.skillName = 'Cutting Dash';
    this.ultimateName = 'Afterimage Cut';
  }

  fire() {
    const s = this.spec.shuriken;
    return shot(this, {
      speed: s.speed,
      radius: 9,
      damage: this.attack * s.damageMultiplier,
      knockback: s.knockback,
      lifetimeMs: s.range / s.speed * 1000,
      shape: 'shuriken',
      emoji: '🌟',
      rotateToAim: true,
    });
  }

  skill() {
    return { type: 'samurai-dash', direction: { ...this.aim }, ...this.spec.cuttingDash };
  }

  ultimate(now, stacks = 0) {
    const tuning = this.spec;
    const multiplier = Math.max(tuning.killCount.minMultiplier,
      Math.min(tuning.killCount.maxMultiplier, stacks / tuning.killCount.divisor));
    return {
      type: 'samurai-afterimage-cut',
      direction: { ...this.aim },
      stackMultiplier: multiplier,
      ...tuning.afterimageCut,
      castAt: now,
    };
  }
}

export const samurai = new Samurai();
export default samurai;
