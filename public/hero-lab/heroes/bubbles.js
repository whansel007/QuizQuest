import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

export class Bubbles extends Hero {
  constructor() {
    super(setup('bubbles', 'Bubbles', '🫧', 'magic'));
    this.spec = GAME_CONFIG.heroes.bubbles; this.weaponName = 'Bubble Spray'; this.skillName = 'Bubble Trap'; this.ultimateName = 'Bubble Rush';
  }
  fire() {
    const s = this.spec.spray, angle = Math.atan2(this.aim.y, this.aim.x) + (Math.random() - .5) * s.spreadRadians;
    return shot(this, { ...s, vx: Math.cos(angle) * s.speed, vy: Math.sin(angle) * s.speed, lifetimeMs: s.range / s.speed * 1000, damage: this.attack * s.damageMultiplier });
  }
  skill() {
    const s = this.spec.bubbleTrap;
    return shot(this, { speed: s.speed, radius: s.radius, lifetimeMs: s.travelDistance / s.speed * 1000, emoji: '🫧', damage: 0,
      sourceAbility: 'skill', trap: s });
  }
  ultimate() { const s = this.spec.ultimate; return { type: 'bubble_rush', ...s, damage: this.attack * s.damageMultiplier }; }
}

export const bubbles = new Bubbles();
export default bubbles;
