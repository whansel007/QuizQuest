import { Flamekeeper, flamekeeper } from './heroes/flamekeeper.js';
import { Ranger, ranger } from './heroes/ranger.js';
import { Guardian, guardian } from './heroes/guardian.js';

export { Flamekeeper, flamekeeper, Ranger, ranger, Guardian, guardian };

export const HEROES = [
  flamekeeper,
  ranger,
  guardian,
];
export const HERO_CLASSES = {
  flamekeeper: Flamekeeper,
  ranger: Ranger,
  guardian: Guardian,
};
export default HEROES;
