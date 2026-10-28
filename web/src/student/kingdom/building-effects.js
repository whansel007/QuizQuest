// ============================================================
// What each kingdom building does, in words, from the same tuning
// the game server reads (see buildHero/computeHeroStats in
// src/hero-lab/room.js). Display only: no game rules live here.
// ============================================================
import {
  BUILDING_BONUS_PER_LEVEL, BUILDING_LEVEL_CAP, TOWER_BONUS_PER_LEVEL, TOWER_MAX_LEVEL,
} from '../../../../config/tuning.js';

export const buildingCap = (id) => (id === 'tower' ? TOWER_MAX_LEVEL : BUILDING_LEVEL_CAP);
const perLevel = (id) => (id === 'tower' ? TOWER_BONUS_PER_LEVEL : BUILDING_BONUS_PER_LEVEL);
export const buildingPercent = (id, level) => Math.round(Math.max(0, level) * perLevel(id) * 100);

export function buildingEffect(id, level) {
  const percent = buildingPercent(id, level);
  if (id === 'tower') return `+${percent}% strength on your team buff cards`;
  if (id === 'garden') return `+${percent}% campfire HP in Campfire Run`;
  if (id === 'library') return `+${percent}% attack for magic heroes`;
  if (id === 'workshop') return `+${percent}% attack for physical heroes`;
  return '';
}

export const BUILDING_ROLES = {
  garden: { kicker: 'NORTH · CELESTIAL GARDEN', purpose: 'Stargazers summon new heroes from the telescope here. Its flowers also strengthen your campfire.' },
  tower: { kicker: 'SOUTH · BROADCAST TOWER', purpose: 'The tower boosts the buff cards your team picks during a Campfire Run.' },
  library: { kicker: 'WEST · MAGICAL LIBRARY', purpose: 'Spellbooks and scrolls sharpen your magic heroes.' },
  workshop: { kicker: 'EAST · TRAINING WORKSHOP', purpose: 'A training gym where Guardian, Sheriff, Pilot and other physical heroes build their strength.' },
  castle: { kicker: 'CENTRE · YOUR CASTLE', purpose: 'The heart of your town. It grows when every building reaches the next level.' },
};
