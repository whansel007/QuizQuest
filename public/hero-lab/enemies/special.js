import { Enemy } from '../bases/enemy.js';
import { GAME_CONFIG } from '../game-config.js';

const playerSpeed = GAME_CONFIG.heroDefaults.speed;

export class Brute extends Enemy {
  constructor(options = {}) {
    const spec = GAME_CONFIG.arenaTuning.enemies.brute;
    super({ type: 'brute', emoji: '🧟', hp: spec.hp, maxHp: spec.hp,
      speed: playerSpeed * spec.speedFraction, radius: GAME_CONFIG.enemies.zombie.radius * spec.scale,
      damage: GAME_CONFIG.enemies.zombie.damage, ...options });
    this.scale = spec.scale;
  }
}

export class Exploder extends Enemy {
  constructor(options = {}) {
    const spec = GAME_CONFIG.arenaTuning.enemies.exploder;
    super({ type: 'exploder', emoji: '💣', hp: spec.hp, maxHp: spec.hp,
      speed: playerSpeed * spec.speedFraction, radius: GAME_CONFIG.enemies.zombie.radius,
      damage: spec.damage, ...options });
    this.fuseUntil = 0;
    this.scale = 1;
  }

  update(dt, campfire, now = Date.now()) {
    if (this.dead || !campfire) return null;
    if (this.fuseUntil) {
      if (now >= this.fuseUntil) { this.dead = true; return 'explode'; }
      return null;
    }
    if (this.moveTowards(dt, campfire)) {
      this.fuseUntil = now + GAME_CONFIG.arenaTuning.enemies.exploder.fuseMs;
      return 'telegraph';
    }
    return null;
  }
}

export class BruteKing extends Brute {
  constructor(options = {}) {
    super({ ...options, type: 'brute-king', emoji: '👑', radius: GAME_CONFIG.arenaTuning.enemies.bruteKing.scale * GAME_CONFIG.enemies.zombie.radius,
      damage: GAME_CONFIG.enemies.zombie.damage });
    this.isBoss = true;
    this.isElite = true;
    this.emoji = '🧟';
    this.scale = GAME_CONFIG.arenaTuning.enemies.bruteKing.scale;
    this.nextSlamAt = (options.now || Date.now()) + GAME_CONFIG.arenaTuning.enemies.bruteKing.slamIntervalMs;
  }
}
