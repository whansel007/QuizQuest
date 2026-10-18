import { Hero } from '../bases/hero.js';

export class Ranger extends Hero {
  constructor() {
    super({
      id: 'ranger',
      name: 'Ranger',
      emoji: '🏹',
      hp: 85,
      attack: 18,
      defense: 3,
      speed: 260,
    });
    this.weaponName = 'Longbow';
    this.skillName = 'Volley';
    this.skillDescription = 'fires a fan of arrows in the aimed direction.';
    this.ultimateName = 'Starfall';
    this.ultimateDescription = 'rains arrows on the aimed point.';
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

export const ranger = new Ranger();
export default ranger;
