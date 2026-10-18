import { Hero } from '../bases/hero.js';

export class Guardian extends Hero {
  constructor() {
    super({
      id: 'guardian',
      name: 'Guardian',
      emoji: '🛡️',
      hp: 130,
      attack: 10,
      defense: 9,
      speed: 180,
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
