import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup, shot } from './shared.js';

export class Electromancer extends Hero {
  constructor() {
    super(setup('electromancer', 'Electromancer', '⚡', 'magic'));
    this.spec = GAME_CONFIG.heroes.electromancer; this.weaponName = 'Lightning Orb'; this.skillName = 'Stun Field'; this.ultimateName = 'Chain Lightning';
  }
  fire() { const s = this.spec.ball; return shot(this, { ...s, damage: this.attack, pierces: s.pierces }); }
  skill() { const s = this.spec.stunBall; return shot(this, { ...s, sourceAbility: 'skill', damage: this.attack * s.damageMultiplier, stunMs: s.stunMs, explosionRadius: s.areaRadius }); }
  ultimate() { const s = this.spec.chain; return { type: 'chain', ...s, damage: this.attack * s.damageMultiplier, x: this.position.x, y: this.position.y }; }
}

export const electromancer = new Electromancer();
export default electromancer;
