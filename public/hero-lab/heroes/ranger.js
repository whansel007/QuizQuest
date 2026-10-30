import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';
import { setup } from './shared.js';

export class Ranger extends Hero {
  constructor() {
    super(setup('ranger', 'Ranger', '🧝', 'magic'));
    this.spec = GAME_CONFIG.heroes.ranger;
    this.weaponName = 'Charge Bow';
    this.skillName = 'Meat and Wolf';
    this.ultimateName = 'Dead Aim';
    this.deadAimArrows = 0;
    this.deadAimUntil = 0;
    this.deadAimNextAt = 0;
  }

  // Primary timing and projectile creation are deliberately server driven in
  // room.js; this class carries the common hero stats and ability metadata.
  fire() { return null; }
  skill() { return { type: 'ranger-wolf' }; }
  ultimate() { return { type: 'ranger-dead-aim' }; }
}

export const ranger = new Ranger();
export default ranger;
