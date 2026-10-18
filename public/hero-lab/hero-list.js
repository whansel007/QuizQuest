import { Flamekeeper, flamekeeper } from './heroes/flamekeeper.js';
import { Ranger, ranger } from './heroes/ranger.js';
import { Sheriff, Guardian, Pilot, Bombardier, Bubbles, Electromancer,
  sheriff, guardian, pilot, bombardier, bubbles, electromancer } from './heroes/roster.js';

export { Flamekeeper, flamekeeper, Ranger, ranger, Sheriff, Guardian, Pilot, Bombardier, Bubbles, Electromancer,
  sheriff, guardian, pilot, bombardier, bubbles, electromancer };

export const HEROES = [
  flamekeeper,
  ranger,
  guardian,
  sheriff,
  pilot,
  bombardier,
  bubbles,
  electromancer,
];
export const HERO_CLASSES = {
  flamekeeper: Flamekeeper,
  ranger: Ranger,
  guardian: Guardian,
  sheriff: Sheriff,
  pilot: Pilot,
  bombardier: Bombardier,
  bubbles: Bubbles,
  electromancer: Electromancer,
};
export default HEROES;
