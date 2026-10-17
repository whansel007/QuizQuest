import { Hero } from '../bases/hero.js';

export class Guardian extends Hero {
  constructor(options = {}) {
    super({
      id: 'guardian',
      name: 'Guardian',
      emoji: '🛡️',
      hp: 130,
      attack: 10,
      defense: 9,
      weaponName: 'Iron Mace',
      weaponDescription: 'a sturdy strike toward the aim arrow.',
      skillName: 'Shield Rush',
      skillDescription: 'charges in the aimed direction.',
      ultimateName: 'Bulwark',
      ultimateDescription: 'raises a protective barrier around the campfire.',
      talent: { name: 'Steadfast', description: 'takes less damage while nearby allies are hurt.' },
      ...options,
    });
  }
}

export const guardian = new Guardian();
export default guardian;
