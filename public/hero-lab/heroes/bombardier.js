import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

export class Bombardier extends Hero {
  constructor() {
    super(setup('bombardier', 'Bombardier', '💣', 'magic'));
    this.spec = GAME_CONFIG.heroes.bombardier; this.weaponName = 'Blast Bomb'; this.skillName = 'Proximity Trap'; this.ultimateName = 'Targeted Bombing'; this.targetingUntil = 0;
  }
  fire() { const s = this.spec.bomb; return shot(this, { ...s, damage: this.attack * s.damageMultiplier, explosionRadius: s.explosionRadius, detonateOnExpire: true, emoji: '💣', sourceAbility: 'weapon' }); }
  skill() { const s = this.spec.trap; return { type: 'trap', ...s, x: this.position.x, y: this.position.y, damage: this.attack * s.damageMultiplier }; }
  ultimate(now) { this.targetingUntil = now + this.spec.airstrike.targetTimeoutMs; return { type: 'targeting' }; }
}

export const bombardier = new Bombardier();
export default bombardier;
