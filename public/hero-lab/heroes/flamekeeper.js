import { Hero } from '../bases/hero.js';
import { Fireball } from '../projectiles/fireball.js';
import { GAME_CONFIG } from '../game-config.js';

export class Flamekeeper extends Hero {
  constructor() {
    super({
      id: 'flamekeeper',
      name: 'Flamekeeper',
      emoji: '🧙',
      hp: GAME_CONFIG.heroes.flamekeeper.hp,
      attack: GAME_CONFIG.heroes.flamekeeper.attack,
      defense: GAME_CONFIG.heroes.flamekeeper.defense,
      speed: GAME_CONFIG.heroes.flamekeeper.speed,
      type: GAME_CONFIG.heroes.flamekeeper.type,
      weaponName: 'Ember Staff',
      skillName: 'Firebolt',
      ultimateName: 'Meteor Strike',
      weaponCooldownMs: GAME_CONFIG.heroes.flamekeeper.weaponCooldownMs,
      skillCooldownMs: GAME_CONFIG.heroes.flamekeeper.skillCooldownMs,
      ultimateCooldownMs: GAME_CONFIG.heroes.flamekeeper.ultimateCooldownMs,
    });
    this.weaponName = 'Ember Staff';
    this.skillName = 'Firebolt';
    this.skillDescription = 'a quick burst of fire in the aimed direction.';
    this.ultimateDescription = 'launches one powerful fireball.';
    this.dashDistance = GAME_CONFIG.heroes.flamekeeper.dashDistance;
  }

  fire(mode = 'primary', now = Date.now()) {
    if (mode !== 'primary') return null;
    return new Fireball({
      x: this.position.x + this.aim.x * GAME_CONFIG.weaponMuzzleOffset,
      y: this.position.y + this.aim.y * GAME_CONFIG.weaponMuzzleOffset,
      aim: this.aim,
      damage: this.attack,
      damage: this.attack,
    });
  }

  skill() {
    return { type: 'dash', direction: { ...this.aim }, distance: this.dashDistance };
  }

  ultimate() {
    return new Fireball({
      x: this.position.x + this.aim.x * GAME_CONFIG.weaponMuzzleOffset,
      y: this.position.y + this.aim.y * GAME_CONFIG.weaponMuzzleOffset,
      aim: this.aim,
      damage: this.attack * GAME_CONFIG.heroes.flamekeeper.ultimateDamageMultiplier,
      radius: 18,
      color: '#b17cff',
      speed: 420,
    });
  }
}

export const flamekeeper = new Flamekeeper();
export default flamekeeper;
