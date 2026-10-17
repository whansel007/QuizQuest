import { Hero } from '../bases/hero.js';
import { Weapon } from '../bases/weapon.js';
import { Skill } from '../bases/skill.js';
import { Ultimate } from '../bases/ultimate.js';

export class Flamekeeper extends Hero {
  constructor(options = {}) {
    super({
      id: 'flamekeeper',
      name: 'Flamekeeper',
      emoji: '🧙',
      stats: { hp: 100, attack: 14, defense: 5 },
      weapon: new Weapon({
        name: 'Ember Staff',
        description: 'fires a blazing red fireball in the aimed direction.',
        fire(hero, mode = 'primary') {
          const aim = hero?.aim ? { ...hero.aim } : { x: 1, y: 0 };
          const position = hero?.position
            ? { ...hero.position }
            : { x: hero?.x ?? 0, y: hero?.y ?? 0 };
          const result = {
            status: 'activated',
            mode,
            hero: hero?.name || 'Flamekeeper',
            weapon: this.name,
            aim,
            position,
            timestamp: Date.now(),
          };
          if (mode === 'primary') {
            result.projectile = {
              type: 'fireball',
              color: '#ff2d20',
              radius: 10,
              speed: 550,
            };
          }
          return result;
        },
      }),
      skill: new Skill({ name: 'Firebolt', description: 'a quick burst of fire in the aimed direction.' }),
      ultimate: new Ultimate({ name: 'Meteor Storm', description: 'a large area attack around the aimed point.' }),
      talent: { name: 'Kindled', description: 'gains power while close to the campfire.' },
      ...options,
    });
  }
}

export const flamekeeper = new Flamekeeper();
export default flamekeeper;
