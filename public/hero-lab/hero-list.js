import { Sheriff, Guardian, Pilot, Bombardier, Bubbles, Electromancer,
  sheriff, guardian, pilot, bombardier, bubbles, electromancer } from './heroes/roster.js';

export { Sheriff, Guardian, Pilot, Bombardier, Bubbles, Electromancer,
  sheriff, guardian, pilot, bombardier, bubbles, electromancer };

export const HEROES = [
  guardian,
  sheriff,
  pilot,
  bombardier,
  bubbles,
  electromancer,
];
export const HERO_CLASSES = {
  guardian: Guardian,
  sheriff: Sheriff,
  pilot: Pilot,
  bombardier: Bombardier,
  bubbles: Bubbles,
  electromancer: Electromancer,
};
export default HEROES;
