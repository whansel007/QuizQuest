// Compatibility entry point for selectors and server code. Hero behavior lives
// with each hero so one implementation can be changed without editing a monolith.
export { Sheriff, sheriff } from './sheriff.js';
export { Guardian, guardian } from './guardian.js';
export { Pilot, pilot } from './pilot.js';
export { Bombardier, bombardier } from './bombardier.js';
export { Bubbles, bubbles } from './bubbles.js';
export { Electromancer, electromancer } from './electromancer.js';
export { Fairy, fairy } from './fairy.js';

import { sheriff } from './sheriff.js';
import { guardian } from './guardian.js';
import { pilot } from './pilot.js';
import { bombardier } from './bombardier.js';
import { bubbles } from './bubbles.js';
import { electromancer } from './electromancer.js';
import { fairy } from './fairy.js';

export const HERO_ROSTER = Object.freeze({ sheriff, guardian, pilot, bombardier, bubbles, electromancer, fairy });
export default HERO_ROSTER;
