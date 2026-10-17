import { Hero } from '../bases/hero.js';

export class Flamekeeper extends Hero {
  constructor(options = {}) {
    super({
      id: 'flamekeeper',
      name: 'Flamekeeper',
      emoji: '🧙',
      hp: 100,
      attack: 14,
      defense: 5,
      weaponName: 'Ember Staff',
      weaponDescription: 'fires a blazing red fireball in the aimed direction.',
      skillName: 'Firebolt',
      skillDescription: 'a quick burst of fire in the aimed direction.',
      ultimateName: 'Meteor Storm',
      ultimateDescription: 'a large area attack around the aimed point.',
      talent: { name: 'Kindled', description: 'gains power while close to the campfire.' },
      ...options,
    });
  }

  fire(mode = 'primary', actor = this) {
    const result = super.fire(mode, actor);
    if (mode === 'primary') {
      result.projectile = {
        type: 'fireball',
        color: '#ff2d20',
        radius: 10,
        speed: 550,
      };
    }
    return result;
  }
}

export const flamekeeper = new Flamekeeper();
export default flamekeeper;
