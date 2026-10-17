export { Hero } from './hero-base.js';
export { Weapon } from './weapon.js';
export { Skill } from './skill.js';
export { Ultimate } from './ultimate.js';

export { Flamekeeper, flamekeeper } from './heroes/flamekeeper.js';
export { Ranger, ranger } from './heroes/ranger.js';
export { Guardian, guardian } from './heroes/guardian.js';

import { flamekeeper } from './heroes/flamekeeper.js';
import { ranger } from './heroes/ranger.js';
import { guardian } from './heroes/guardian.js';

export const HEROES = [
  flamekeeper,
  ranger,
  guardian,
];
