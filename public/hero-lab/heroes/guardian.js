import { Hero } from '../bases/hero.js';
import { GAME_CONFIG } from '../game-config.js';

export class Guardian extends Hero {
  constructor() {
    super({
      id: 'guardian',
      name: 'Guardian',
      emoji: '🛡️',
      ...GAME_CONFIG.heroes.guardian,
    });
    this.weaponName = 'Iron Mace';
    this.skillName = 'Shield Rush';
    this.skillDescription = 'charges in the aimed direction.';
    this.ultimateName = 'Bulwark';
    this.ultimateDescription = 'raises a protective barrier around the campfire.';
  }

  fire() {
    return null;
  }

  skill() {
    return `${this.name} used ${this.skillName}: ${this.skillDescription}`;
  }

  ultimate() {
    return `${this.name} used ${this.ultimateName}: ${this.ultimateDescription}`;
  }
}

export const guardian = new Guardian();
export default guardian;
