import { Enemy } from '../bases/enemy.js';
import { GAME_CONFIG } from '../game-config.js';

export class Zombie extends Enemy {
  constructor(options = {}) {
    super({
      emoji: '🧟',
      hp: GAME_CONFIG.enemies.zombie.hp,
      maxHp: GAME_CONFIG.enemies.zombie.hp,
      speed: GAME_CONFIG.enemies.zombie.speed,
      radius: GAME_CONFIG.enemies.zombie.radius,
      damage: GAME_CONFIG.enemies.zombie.damage,
      ...options,
    });
  }
}

export default Zombie;
