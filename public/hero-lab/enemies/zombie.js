import { Enemy } from '../bases/enemy.js';

export class Zombie extends Enemy {
  constructor(options = {}) {
    super({
      emoji: '🧟',
      hp: 20,
      maxHp: 20,
      speed: 55,
      radius: 16,
      damage: 6,
      ...options,
    });
  }
}

export default Zombie;
