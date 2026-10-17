import { Hero } from '../hero-base.js';
import { Weapon } from '../weapon.js';
import { Skill } from '../skill.js';
import { Ultimate } from '../ultimate.js';

export class Ranger extends Hero {
  constructor(options = {}) {
    super({
      id: 'ranger',
      name: 'Ranger',
      emoji: '🏹',
      stats: { hp: 85, attack: 18, defense: 3 },
      weapon: new Weapon({ name: 'Longbow', description: 'a precise arrow toward the aim arrow.' }),
      skill: new Skill({ name: 'Volley', description: 'fires a fan of arrows in the aimed direction.' }),
      ultimate: new Ultimate({ name: 'Starfall', description: 'rains arrows on the aimed point.' }),
      talent: { name: 'Keen Eye', description: 'deals extra damage to distant targets.' },
      ...options,
    });
  }
}

export const ranger = new Ranger();
export default ranger;
