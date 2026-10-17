import { Hero } from '../bases/hero.js';

export class Ranger extends Hero {
  constructor(options = {}) {
    super({
      id: 'ranger',
      name: 'Ranger',
      emoji: '🏹',
      hp: 85,
      attack: 18,
      defense: 3,
      weaponName: 'Longbow',
      weaponDescription: 'a precise arrow toward the aim arrow.',
      skillName: 'Volley',
      skillDescription: 'fires a fan of arrows in the aimed direction.',
      ultimateName: 'Starfall',
      ultimateDescription: 'rains arrows on the aimed point.',
      talent: { name: 'Keen Eye', description: 'deals extra damage to distant targets.' },
      ...options,
    });
  }
}

export const ranger = new Ranger();
export default ranger;
