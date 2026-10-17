import { Hero } from '../hero-base.js';
import { Weapon } from '../weapon.js';
import { Skill } from '../skill.js';
import { Ultimate } from '../ultimate.js';

export class Guardian extends Hero {
  constructor(options = {}) {
    super({
      id: 'guardian',
      name: 'Guardian',
      emoji: '🛡️',
      stats: { hp: 130, attack: 10, defense: 9 },
      weapon: new Weapon({ name: 'Iron Mace', description: 'a sturdy strike toward the aim arrow.' }),
      skill: new Skill({ name: 'Shield Rush', description: 'charges in the aimed direction.' }),
      ultimate: new Ultimate({ name: 'Bulwark', description: 'raises a protective barrier around the campfire.' }),
      talent: { name: 'Steadfast', description: 'takes less damage while nearby allies are hurt.' },
      ...options,
    });
  }
}

export const guardian = new Guardian();
export default guardian;
