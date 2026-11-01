import * as castle from './castle.js';
import * as garden from './garden.js';
import * as library from './library.js';
import * as tower from './tower.js';
import * as workshop from './workshop.js';

export const BUILDING_ART = Object.freeze({ castle, garden, library, tower, workshop });
export const BUILDING_LAYOUT = Object.freeze(Object.fromEntries(
  Object.entries(BUILDING_ART).map(([id, building]) => [id, building.layout]),
));

export function drawBuilding(g, id, level, width, height, footprintWidth) {
  BUILDING_ART[id]?.draw(g, level, width, height, footprintWidth);
}
