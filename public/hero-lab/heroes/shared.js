import { Projectile } from '../bases/projectile.js';
import { GAME_CONFIG } from '../game-config.js';

const muzzle = GAME_CONFIG.weaponMuzzleOffset;

export function shot(hero, spec, extra = {}) {
  return new Projectile({
    x: hero.position.x + hero.aim.x * muzzle,
    y: hero.position.y + hero.aim.y * muzzle,
    aim: hero.aim,
    damage: hero.attack,
    sourceAbility: 'weapon',
    ...spec,
    color: GAME_CONFIG.heroFxColors[hero.id]?.primary || spec.color,
    flashColors: [GAME_CONFIG.heroFxColors[hero.id]?.primary, GAME_CONFIG.heroFxColors[hero.id]?.highlight],
    ...extra,
  });
}

export function setup(id, name, emoji, type) {
  const config = GAME_CONFIG.heroes[id];
  return {
    id, name, emoji, type, rarity: GAME_CONFIG.heroSummon.rarities[id], ...config,
    weaponCooldownMs: config.weaponCooldownMs,
    skillCooldownMs: config.skillCooldownMs,
    ultimateCooldownMs: config.ultimateCooldownMs,
  };
}
