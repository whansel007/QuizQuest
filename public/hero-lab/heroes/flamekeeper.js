import { Hero } from '../bases/hero.js';

export class Flamekeeper extends Hero {
  constructor() {
    super({
      id: 'flamekeeper',
      name: 'Flamekeeper',
      emoji: '🧙',
      hp: 100,
      attack: 14,
      defense: 5,
    });
    this.weaponName = 'Ember Staff';
    this.skillName = 'Firebolt';
    this.skillDescription = 'a quick burst of fire in the aimed direction.';
    this.ultimateName = 'Meteor Storm';
    this.ultimateDescription = 'a large area attack around the aimed point.';
  }

  fire(mode = 'primary') {
    if (mode !== 'primary') return null;
    return { type: 'fireball', color: '#ff2d20', radius: 10, speed: 550 };
  }

  skill() {
    return `${this.name} used ${this.skillName}: ${this.skillDescription}`;
  }

  ultimate() {
    return `${this.name} used ${this.ultimateName}: ${this.ultimateDescription}`;
  }
}

export const flamekeeper = new Flamekeeper();
export default flamekeeper;
